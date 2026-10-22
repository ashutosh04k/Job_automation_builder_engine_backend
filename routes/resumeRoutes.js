import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getMasterResume, saveMasterResume, masterResumeVersion, getEmailTemplate, getJobTargetById, getDiscoveredJobs, updateJobTarget } from '../services/storageService.js';
import { extractPdfLines } from '../services/pdfTextService.js';
import { parseResumeLines } from '../shared/resumeParser.js';
import { generateTailoredResume } from '../services/resumeTailorService.js';
import { generateResumePDF } from '../services/pdfService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { SKILLS } from '../shared/keywords.js';
import User from '../models/User.js';
import { resolveRole, resolveCompany } from '../shared/jobMeta.js';
import { isPrimaryUser } from '../shared/owner.js';
import { tailorAndScore, rescoreUserTargets } from '../services/atsService.js';

const router = express.Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration (User-scoped directories)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = req.userId ? path.join(UPLOADS_DIR, req.userId.toString()) : UPLOADS_DIR;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'my_resume.pdf');
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  }
});

// In-memory upload for parsing only (the file is not stored).
const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : new Error('Only PDF files are allowed.'), ok);
  }
});

// The PDF this user uploaded earlier (their own folder; the legacy global file only for the owner).
function uploadedPdfPath(req) {
  const userPdf = req.userId ? path.join(UPLOADS_DIR, req.userId.toString(), 'my_resume.pdf') : null;
  if (userPdf && fs.existsSync(userPdf)) return userPdf;
  const globalPdf = path.join(UPLOADS_DIR, 'my_resume.pdf');
  return isPrimaryUser(req.user?.email) && fs.existsSync(globalPdf) ? globalPdf : null;
}

/**
 * POST /api/resume/parse-pdf  (multipart field "resumePdf", optional)
 * Extracts experience, skills, education, projects... from a PDF into a DRAFT.
 * Nothing is saved: the user reviews the draft and saves it with POST /api/resume.
 * Without a file, the user's previously uploaded PDF is used.
 */
router.post('/parse-pdf', requireAuth, (req, res, next) => {
  parseUpload.single('resumePdf')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    let buffer = req.file?.buffer;
    if (!buffer) {
      const file = uploadedPdfPath(req);
      if (!file) return res.status(404).json({ success: false, error: 'No PDF uploaded yet. Choose a PDF to extract from.' });
      buffer = fs.readFileSync(file);
    }
    const { lines, pages } = await extractPdfLines(buffer);
    if (lines.length < 5) {
      return res.status(422).json({ success: false, error: 'This PDF has almost no selectable text (it may be a scanned image). Upload a text-based PDF.' });
    }
    const result = parseResumeLines(lines);
    res.json({ success: true, data: { ...result, pages } });
  } catch (err) {
    res.status(422).json({ success: false, error: `Could not read this PDF: ${err.message}` });
  }
});

/** GET /api/resume/version — fingerprint of the saved resume (the extension uses it to drop stale cache). */
router.get('/version', requireAuth, async (req, res) => {
  try {
    const master = await getMasterResume(req.userId);
    res.json({ success: true, data: { version: masterResumeVersion(master), updatedAt: master?.updatedAt || null } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Master Resume Data (tenant-scoped)
router.get('/', requireAuth, async (req, res) => {
  try {
    const master = await getMasterResume(req.userId || null);
    res.json({ success: true, data: master });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Save Master Resume Data (tenant-scoped)
router.post('/', requireAuth, async (req, res) => {
  try {
    const updated = await saveMasterResume(req.body, req.userId || null);
    // Scores depend on the resume, so refresh them in the background.
    rescoreUserTargets(req.userId).catch((e) => console.warn('[ATS] rescore after save failed:', e.message));
    res.json({ success: true, message: 'Master resume saved', data: updated, version: masterResumeVersion(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Upload Custom PDF Resume File (tenant-scoped)
router.post('/upload-pdf', requireAuth, upload.single('resumePdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }
    const stats = fs.statSync(req.file.path);
    const cleanName = (req.user?.name || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');
    const displayName = `${cleanName}_Resume.pdf`;

    if (req.userId) {
      try {
        await User.findByIdAndUpdate(req.userId, { customPdfFilename: req.file.originalname });
      } catch (e) {
        console.warn('Could not update user customPdfFilename:', e.message);
      }
    }

    res.json({
      success: true,
      message: '✅ Custom PDF Resume uploaded successfully! This exact PDF will now be attached to all outgoing emails.',
      fileInfo: {
        filename: displayName,
        size: `${(stats.size / 1024).toFixed(1)} KB`,
        uploadedAt: stats.mtime
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Custom PDF Status (tenant-scoped)
router.get('/pdf-status', requireAuth, (req, res) => {
  try {
    const userPdf = req.userId ? path.join(UPLOADS_DIR, req.userId.toString(), 'my_resume.pdf') : null;
    const isOwner = isPrimaryUser(req.user?.email);
    const globalPdf = isOwner ? path.join(UPLOADS_DIR, 'my_resume.pdf') : null;
    const activePdf = (userPdf && fs.existsSync(userPdf)) ? userPdf : (globalPdf && fs.existsSync(globalPdf) ? globalPdf : null);

    if (activePdf) {
      const stats = fs.statSync(activePdf);
      const cleanName = (req.user?.name || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.json({
        hasCustomPdf: true,
        filename: `${cleanName}_Resume.pdf`,
        size: `${(stats.size / 1024).toFixed(1)} KB`,
        uploadedAt: stats.mtime
      });
    } else {
      res.json({ hasCustomPdf: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Download/View Uploaded PDF (tenant-scoped)
router.get('/download-pdf', requireAuth, (req, res) => {
  const userPdf = req.userId ? path.join(UPLOADS_DIR, req.userId.toString(), 'my_resume.pdf') : null;
  const isOwner = isPrimaryUser(req.user?.email);
  const globalPdf = isOwner ? path.join(UPLOADS_DIR, 'my_resume.pdf') : null;
  const activePdf = (userPdf && fs.existsSync(userPdf)) ? userPdf : (globalPdf && fs.existsSync(globalPdf) ? globalPdf : null);

  if (activePdf) {
    res.contentType('application/pdf');
    res.sendFile(activePdf);
  } else {
    res.status(404).json({ success: false, error: 'No custom uploaded PDF found for this account.' });
  }
});

// POST Preview Tailored HTML Email Body (tenant-scoped)
router.post('/preview', requireAuth, async (req, res) => {
  try {
    let { jobDescription, targetRole, companyName } = req.body;
    const master = await getMasterResume(req.userId || null);
    const template = await getEmailTemplate(req.userId || null);

    targetRole = resolveRole(targetRole, jobDescription);
    companyName = resolveCompany(companyName, jobDescription);

    const preview = generateTailoredResume(
      master, 
      jobDescription || 'Full Stack Engineer Node.js React developer', 
      targetRole || 'Software Developer',
      template,
      companyName || 'your company'
    );

    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Generate and stream tailored ATS PDF resume directly
router.post('/tailored-pdf', requireAuth, async (req, res) => {
  try {
    let { jobDescription, targetRole, companyName } = req.body;
    const master = await getMasterResume(req.userId || null);

    targetRole = resolveRole(targetRole, jobDescription);
    companyName = resolveCompany(companyName, jobDescription);

    const pdfBuffer = await generateResumePDF(master, {
      targetRole: targetRole || 'Software Developer',
      companyName: companyName || '',
      jobDescription: jobDescription || ''
    });

    const cleanName = (master?.fullName || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanRole = (targetRole || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cleanName}_${cleanRole}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(isProfileError(err) ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET Stream tailored ATS PDF resume for a specific target
router.get('/tailored-pdf/:targetId', requireAuth, async (req, res) => {
  try {
    const target = await getJobTargetById(req.params.targetId, req.userId || null);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Job target not found' });
    }

    const master = await getMasterResume(req.userId || null);

    const role = resolveRole(target.targetRole, target.jobDescription, master?.title || 'Software Developer');
    const company = resolveCompany(target.companyName, target.jobDescription);

    const pdfBuffer = await generateResumePDF(master, {
      targetRole: role,
      companyName: company || '',
      jobDescription: target.jobDescription || ''
    });

    const cleanName = (master?.fullName || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanRole = (role || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cleanName}_${cleanRole}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(isProfileError(err) ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET Stream tailored ATS PDF resume for a discovered job
router.get('/tailored-pdf/discovered/:id', requireAuth, async (req, res) => {
  try {
    const result = await getDiscoveredJobs({ fetchAll: true }, req.userId || null);
    const jobs = result.data || result;
    const job = jobs.find(j => String(j._id) === String(req.params.id) || String(j.jobId) === String(req.params.id));
    if (!job) {
      return res.status(404).json({ success: false, error: 'Discovered job not found' });
    }

    const master = await getMasterResume(req.userId || null);
    const role = job.title || master?.title || 'Software Developer';
    const company = job.company || '';
    const jd = job.jobDescription || `${role} at ${company}. Location: ${job.location || ''}`;

    const pdfBuffer = await generateResumePDF(master, {
      targetRole: role,
      companyName: company,
      jobDescription: jd
    });

    const cleanName = (master?.fullName || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanRole = (role || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cleanName}_${cleanRole}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(isProfileError(err) ? 400 : 500).json({ success: false, error: err.message });
  }
});

// Profile problems (no name / no experience) are the user's to fix -> 400, not 500.
const isProfileError = (err) => /master resume is incomplete/i.test(err?.message || '');

/**
 * POST /api/resume/score { jobDescription, targetRole, companyName }
 * Builds the tailored resume for this JD and scores the text it actually prints.
 */
router.post('/score', requireAuth, async (req, res) => {
  try {
    let { jobDescription = '', targetRole = '', companyName = '' } = req.body || {};
    if (String(jobDescription).length > 50000) {
      return res.status(413).json({ success: false, error: 'Job description is too long (50,000 characters max).' });
    }
    targetRole = resolveRole(targetRole, jobDescription, '');
    companyName = resolveCompany(companyName, jobDescription);

    const master = await getMasterResume(req.userId);
    const { report } = await tailorAndScore(master, { jobDescription, targetRole, companyName });
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(isProfileError(err) ? 400 : 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/resume/tailor { jobDescription, targetRole, companyName }
 * One call for the extension: tailored PDF (base64) + its ATS report + what was changed.
 * Score and PDF come from the same generation, so they always agree.
 */
router.post('/tailor', requireAuth, async (req, res) => {
  try {
    let { jobDescription = '', targetRole = '', companyName = '' } = req.body || {};
    if (String(jobDescription).length > 50000) {
      return res.status(413).json({ success: false, error: 'Job description is too long (50,000 characters max).' });
    }
    const master = await getMasterResume(req.userId);
    targetRole = resolveRole(targetRole, jobDescription, master?.title || 'Software Developer');
    companyName = resolveCompany(companyName, jobDescription);

    const { report, pdf, changes } = await tailorAndScore(master, { jobDescription, targetRole, companyName });
    const slug = (s) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const filename = [slug(master?.fullName) || 'Resume', slug(targetRole), slug(companyName)].filter(Boolean).join('_') + '.pdf';

    res.json({
      success: true,
      data: { report, changes, targetRole, companyName, filename, resumeVersion: masterResumeVersion(master), pdfBase64: pdf.toString('base64') }
    });
  } catch (err) {
    res.status(isProfileError(err) ? 400 : 500).json({ success: false, error: err.message });
  }
});

/** GET /api/resume/score/target/:targetId — full report for a saved target; also refreshes its stored score. */
router.get('/score/target/:targetId', requireAuth, async (req, res) => {
  try {
    const target = await getJobTargetById(req.params.targetId, req.userId);
    if (!target) return res.status(404).json({ success: false, error: 'Job target not found' });

    const master = await getMasterResume(req.userId);
    const { report } = await tailorAndScore(master, {
      jobDescription: target.jobDescription || '',
      targetRole: resolveRole(target.targetRole, target.jobDescription, master?.title || ''),
      companyName: resolveCompany(target.companyName, target.jobDescription)
    });
    if (report.score !== target.atsScore) {
      await updateJobTarget(target._id, { atsScore: report.score }, req.userId);
    }
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(isProfileError(err) ? 400 : 500).json({ success: false, error: err.message });
  }
});

router.get('/keywords', async (req, res) => {
  try {
    res.json({ success: true, data: SKILLS });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
