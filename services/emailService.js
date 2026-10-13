import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { getSettings, getMasterResume } from './storageService.js';
import { generateResumePDF } from './pdfService.js';

/**
 * Builds an RFC 2822 compliant MIME message string including HTML and Base64 PDF attachment.
 */
function buildMimeMessage({ from, to, replyTo, subject, htmlBody, pdfBuffer, pdfFilename }) {
  const boundary = '----=_NextPart_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ''
  ].filter(Boolean).join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    ''
  ].join('\r\n');

  const attachmentPart = [
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    pdfBuffer.toString('base64'),
    ''
  ].join('\r\n');

  const closing = `--${boundary}--`;

  return [headers, htmlPart, attachmentPart, closing].join('\r\n');
}

/**
 * Encodes a string into URL-safe base64 (base64url) format required by Gmail API.
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendTailoredResumeEmail({ to, subject, htmlContent, tailoredData }) {
  try {
    const settings = await getSettings();
    const masterResume = await getMasterResume();

    const senderName = process.env.SENDER_NAME || settings?.senderName || 'Ashutosh Kumar';
    const senderEmail = process.env.SENDER_EMAIL || settings?.senderEmail || 'kumarasutosh2014@gmail.com';

    // Check if custom uploaded PDF resume exists
    const customPdfPath = path.resolve(process.cwd(), 'uploads', 'my_resume.pdf');
    let pdfBuffer = null;
    let attachmentSource = '';

    if (fs.existsSync(customPdfPath)) {
      pdfBuffer = fs.readFileSync(customPdfPath);
      attachmentSource = 'Custom Uploaded PDF Resume';
      console.log(`[Email Service] Using Custom Uploaded PDF Resume from ${customPdfPath}`);
    } else {
      pdfBuffer = await generateResumePDF(masterResume, tailoredData || {});
      attachmentSource = 'Generated PDF Resume';
      console.log(`[Email Service] Using Generated PDF Resume`);
    }

    const gmailClientId = process.env.GMAIL_CLIENT_ID || '';
    const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET || '';
    const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN || '';

    // --- PRIMARY: Official Gmail REST API via OAuth2 (No SMTP port blocks, goes directly to Primary Inbox) ---
    if (gmailClientId && gmailClientSecret && gmailRefreshToken) {
      console.log(`[Email Service] Using Official Gmail REST API to send email to ${to}`);

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

      const mimeString = buildMimeMessage({
        from: `${senderName} <${senderEmail}>`,
        to,
        replyTo: senderEmail,
        subject,
        htmlBody: htmlContent,
        pdfBuffer,
        pdfFilename: 'Ashutosh_Kumar_Resume.pdf'
      });

      const raw = base64UrlEncode(mimeString);

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
      message: `Simulation Mode: Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN on Render to send live emails.`,
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
