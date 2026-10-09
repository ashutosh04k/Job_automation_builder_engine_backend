import express from 'express';
import { getSettings, saveSettings, getLogs } from '../services/storageService.js';
import { sendTailoredResumeEmail } from '../services/emailService.js';

const router = express.Router();

// GET Settings
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings();
    const safeSettings = { ...settings };
    if (safeSettings.smtpPass) {
      safeSettings.smtpPass = '••••••••••••';
    }
    res.json({ success: true, data: safeSettings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Save Settings
router.post('/', async (req, res) => {
  try {
    const updated = await saveSettings(req.body);
    res.json({ success: true, message: 'Settings saved', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Send Test Email
router.post('/test-email', async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required.' });
    }

    const testHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #ffffff; border-radius: 8px;">
        <h2 style="color: #38bdf8;">MERN Resume Automation System Test</h2>
        <p>This email verifies your Nodemailer & SMTP settings are connected.</p>
        <p>Daily 9:00 AM Cron Schedule: <strong>Active (0 9 * * *)</strong></p>
      </div>
    `;

    const result = await sendTailoredResumeEmail({
      to: recipientEmail,
      subject: 'AutoResume System - SMTP Verification Test',
      htmlContent: testHtml
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Audit Logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await getLogs();
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
