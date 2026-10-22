import fs from 'fs';
import path from 'path';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { OAuth2Client } from 'google-auth-library';
import { getSettings, getMasterResume, isMongoConnected } from './storageService.js';
import { generateResumePDF } from './pdfService.js';
import { isPrimaryUser } from '../shared/owner.js';
import User from '../models/User.js';

export async function sendTailoredResumeEmail({ to, subject, htmlContent, tailoredData, userId = null }) {
  try {
    const settings = await getSettings(userId);
    const masterResume = await getMasterResume(userId);

    let userObj = null;
    if (userId && isMongoConnected()) {
      try {
        userObj = await User.findById(userId);
      } catch (e) {
        console.warn('Could not fetch user for email sending:', e.message);
      }
    }

    const senderName = userObj?.senderName || settings?.senderName || masterResume?.fullName || process.env.SENDER_NAME || '';
    const senderEmail = userObj?.senderEmail || settings?.senderEmail || masterResume?.email || process.env.SENDER_EMAIL || '';
    if (!senderEmail) {
      throw new Error('No sender email configured. Set it in Settings before sending.');
    }

    // Check if custom uploaded PDF resume exists for this specific user or global fallback
    let customPdfPath = null;
    if (userId) {
      const userPdf = path.resolve(process.cwd(), 'uploads', userId.toString(), 'my_resume.pdf');
      if (fs.existsSync(userPdf)) customPdfPath = userPdf;
    }
    // Only primary owner can fall back to the pre-existing global uploads/my_resume.pdf
    if (!customPdfPath && (isPrimaryUser(userObj?.email) || (!userId && !userObj))) {
      const globalPdf = path.resolve(process.cwd(), 'uploads', 'my_resume.pdf');
      if (fs.existsSync(globalPdf)) customPdfPath = globalPdf;
    }

    let pdfBuffer = null;
    let attachmentSource = '';

    // Check if user explicitly chose static uploaded resume, otherwise default to Dynamic Tailored ATS Resume
    const preferStatic = settings?.resumeMode === 'static' || userObj?.resumeMode === 'static';

    if (preferStatic && customPdfPath && fs.existsSync(customPdfPath)) {
      pdfBuffer = fs.readFileSync(customPdfPath);
      attachmentSource = 'Custom Uploaded PDF Resume';
      console.log(`[Email Service] Using Custom Uploaded PDF Resume from ${customPdfPath}`);
    } else {
      pdfBuffer = await generateResumePDF(masterResume, tailoredData || {});
      attachmentSource = `Dynamic Tailored ATS Resume PDF (${tailoredData?.targetRole || 'Software Developer'})`;
      console.log(`[Email Service] Generated & Attaching Dynamic Tailored ATS Resume PDF for ${tailoredData?.targetRole || 'Software Developer'}`);
    }

    const gmailClientId = userObj?.gmailClientId || settings?.gmailClientId || process.env.GMAIL_CLIENT_ID || '';
    const gmailClientSecret = userObj?.gmailClientSecret || settings?.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET || '';
    const gmailRefreshToken = userObj?.gmailRefreshToken || settings?.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN || '';

    // Attachment filename formatted nicely per user
    const cleanFilename = `${(senderName || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_')}_Resume.pdf`;

    // --- PRIMARY: Official Gmail REST API via OAuth2 (Bypasses SMTP port blocks, Primary tab, Sent box) ---
    if (gmailClientId && gmailClientSecret && gmailRefreshToken) {
      console.log(`[Email Service] Using Official Gmail REST API to send email to ${to} from ${senderEmail}`);

      const oauth2Client = new OAuth2Client(
        gmailClientId,
        gmailClientSecret,
        'https://developers.google.com/oauthplayground'
      );

      oauth2Client.setCredentials({
        refresh_token: gmailRefreshToken
      });

      const tokenResponse = await oauth2Client.getAccessToken();
      const accessToken = tokenResponse?.token;

      if (!accessToken) {
        throw new Error('Failed to generate Google access token from refresh token.');
      }

      // Compile 100% standard RFC 2822 MIME message with both text/html body and PDF attachment
      const mail = new MailComposer({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        replyTo: senderEmail,
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: cleanFilename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      });

      const compiledBuffer = await mail.compile().build();

      // Encode as URL-safe base64 (RFC 4648 base64url) required by Gmail API
      const raw = compiledBuffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
      });

      const sendData = await sendRes.json();

      if (!sendRes.ok) {
        throw new Error(sendData?.error?.message || 'Google Gmail API request failed.');
      }

      console.log(`[Email Service LIVE via Gmail API] Sent email to ${to}. MessageId: ${sendData.id}`);
      return {
        success: true,
        simulated: false,
        messageId: sendData.id,
        message: `🎉 Email + ${attachmentSource} sent successfully to ${to} via your Gmail account!`
      };
    }

    // --- FALLBACK: Simulation Mode (if credentials not provided) ---
    console.log(`[Email Service SIMULATION] No Gmail API credentials found. Prepared for: ${to}`);
    return {
      success: true,
      simulated: true,
      message: `Simulation Mode: Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN to send live emails.`,
      previewRecipient: to,
      subject
    };

  } catch (error) {
    console.error(`[Email Service ERROR] Failed to send email to ${to}:`, error.message);

    return {
      success: false,
      simulated: false,
      error: error.message,
      message: `Email sending failed: ${error.message}`
    };
  }
}
