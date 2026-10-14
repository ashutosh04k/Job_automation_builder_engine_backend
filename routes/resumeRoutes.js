import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getMasterResume, saveMasterResume, getEmailTemplate } from '../services/storageService.js';
import { generateTailoredResume } from '../services/resumeTailorService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// Enforce authentication on all resume routes
router.use(requireAuth);

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

// GET Master Resume Data (tenant-scoped)
router.get('/', async (req, res) => {
  try {
    const master = await getMasterResume(req.userId || null);
    res.json({ success: true, data: master });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Save Master Resume Data (tenant-scoped)
router.post('/', async (req, res) => {
  try {
    const updated = await saveMasterResume(req.body, req.userId || null);
    res.json({ success: true, message: 'Master resume profile updated', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Upload Custom PDF Resume File (tenant-scoped)
router.post('/upload-pdf', upload.single('resumePdf'), async (req, res) => {
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
router.get('/pdf-status', (req, res) => {
  try {
    const userPdf = req.userId ? path.join(UPLOADS_DIR, req.userId.toString(), 'my_resume.pdf') : null;
    const isOwner = req.user?.email === 'kumarasutosh2014@gmail.com';
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
router.get('/download-pdf', (req, res) => {
  const userPdf = req.userId ? path.join(UPLOADS_DIR, req.userId.toString(), 'my_resume.pdf') : null;
  const isOwner = req.user?.email === 'kumarasutosh2014@gmail.com';
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
router.post('/preview', async (req, res) => {
  try {
    let { jobDescription, targetRole, companyName } = req.body;
    const master = await getMasterResume(req.userId || null);
    const template = await getEmailTemplate(req.userId || null);

    if (!targetRole || targetRole === 'Software Developer' || targetRole === 'Software Engineer' || targetRole === 'Software Developer | Frontend / Full Stack') {
      const m = (jobDescription || '').match(/^Role:\s*(.+)$/m);
      if (m && m[1].trim()) {
        targetRole = m[1].trim();
      }
    }

    if (!companyName || companyName === 'Target Company' || companyName === 'your company' || companyName === 'Tech Corp') {
      const mc = (jobDescription || '').match(/^Company:\s*(.+)$/m);
      if (mc && mc[1].trim()) {
        companyName = mc[1].trim();
      }
    }

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

export default router;
