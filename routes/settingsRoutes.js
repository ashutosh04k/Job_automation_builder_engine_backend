import express from 'express';
import { getSettings, saveSettings, getLogs } from '../services/storageService.js';
import { sendTailoredResumeEmail } from '../services/emailService.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// Apply optional auth
router.use(optionalAuth);

// GET Settings (tenant-scoped)
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings(req.userId || null);
    const safeSettings = { ...settings };

    // Mask sensitive secrets in response
    if (safeSettings.smtpPass) {
      safeSettings.smtpPass = '••••••••••••';
    }
    if (safeSettings.gmailClientSecret) {
      safeSettings.gmailClientSecret = '••••••••••••';
    }

    if (req.user) {
      if (req.user.senderName) safeSettings.senderName = req.user.senderName;
      if (req.user.senderEmail) safeSettings.senderEmail = req.user.senderEmail;
      if (req.user.gmailClientId) safeSettings.gmailClientId = req.user.gmailClientId;
      safeSettings.hasUserOAuth = !!req.user.gmailRefreshToken;
    }

    res.json({ success: true, data: safeSettings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Save Settings (tenant-scoped)
router.post('/', async (req, res) => {
  try {
    const updated = await saveSettings(req.body, req.userId || null);

    // If user is authenticated, sync sender info and credentials to User profile
    if (req.userId) {
      const userUpdate = {};
      if (req.body.senderName) userUpdate.senderName = req.body.senderName;
      if (req.body.senderEmail) userUpdate.senderEmail = req.body.senderEmail;
      if (req.body.gmailClientId) userUpdate.gmailClientId = req.body.gmailClientId;
      if (req.body.gmailClientSecret) userUpdate.gmailClientSecret = req.body.gmailClientSecret;
      if (req.body.gmailRefreshToken) userUpdate.gmailRefreshToken = req.body.gmailRefreshToken;

      if (Object.keys(userUpdate).length > 0) {
        await User.findByIdAndUpdate(req.userId, userUpdate);
      }
    }

    res.json({ success: true, message: 'Settings saved', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Send Test Email (tenant-scoped)
router.post('/test-email', async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required.' });
    }

    const testHtml = `
      <div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #ffffff; border-radius: 8px;">
        <h2 style="color: #38bdf8;">MERN Resume Automation System Test</h2>
        <p>This email verifies your Nodemailer & SMTP/Gmail settings are connected.</p>
        <p>Daily 9:00 AM Cron Schedule: <strong>Active (0 9 * * *)</strong></p>
      </div>
    `;

    const result = await sendTailoredResumeEmail({
      to: recipientEmail,
      subject: 'AutoResume System - Verification Test',
      htmlContent: testHtml,
      userId: req.userId || null
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Audit Logs (tenant-scoped)
router.get('/logs', async (req, res) => {
  try {
    const logs = await getLogs(req.userId || null);
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
