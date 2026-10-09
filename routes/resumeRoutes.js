import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getMasterResume, saveMasterResume } from '../services/storageService.js';
import { generateTailoredResume } from '../services/resumeTailorService.js';

const router = express.Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
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

// GET Master Resume Data
router.get('/', async (req, res) => {
  try {
    const master = await getMasterResume();
    res.json({ success: true, data: master });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Save Master Resume Data
router.post('/', async (req, res) => {
  try {
    const updated = await saveMasterResume(req.body);
    res.json({ success: true, message: 'Master resume profile updated', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Upload Custom PDF Resume File
router.post('/upload-pdf', upload.single('resumePdf'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }
    const stats = fs.statSync(req.file.path);
    res.json({
      success: true,
      message: '✅ Custom PDF Resume uploaded successfully! This exact PDF will now be attached to all outgoing emails.',
      fileInfo: {
        filename: 'Ashutosh_Kumar_Resume.pdf',
        size: `${(stats.size / 1024).toFixed(1)} KB`,
        uploadedAt: stats.mtime
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Custom PDF Status
router.get('/pdf-status', (req, res) => {
  try {
    const pdfPath = path.join(UPLOADS_DIR, 'my_resume.pdf');
    if (fs.existsSync(pdfPath)) {
      const stats = fs.statSync(pdfPath);
      res.json({
        hasCustomPdf: true,
        filename: 'Ashutosh_Kumar_Resume.pdf',
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

// GET Download/View Uploaded PDF
router.get('/download-pdf', (req, res) => {
  const pdfPath = path.join(UPLOADS_DIR, 'my_resume.pdf');
  if (fs.existsSync(pdfPath)) {
    res.contentType('application/pdf');
    res.sendFile(pdfPath);
  } else {
    res.status(404).json({ success: false, error: 'No custom uploaded PDF found.' });
  }
});

// POST Preview Tailored HTML Email Body
router.post('/preview', async (req, res) => {
  try {
    const { jobDescription, targetRole } = req.body;
    const master = await getMasterResume();

    const preview = generateTailoredResume(
      master, 
      jobDescription || 'Full Stack Engineer Node.js React developer', 
      targetRole || 'Software Developer'
    );

    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
