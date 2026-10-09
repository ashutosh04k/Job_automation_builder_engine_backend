import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { getSettings, getMasterResume } from './storageService.js';
import { generateResumePDF } from './pdfService.js';

export async function sendTailoredResumeEmail({ to, subject, htmlContent, tailoredData }) {
  try {
    const settings = await getSettings();
    const masterResume = await getMasterResume();
    
    const host = process.env.SMTP_HOST || settings?.smtpHost || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || settings?.smtpPort || '587');
    const user = (process.env.SMTP_USER || settings?.smtpUser || '').trim();
    const rawPass = (process.env.SMTP_PASS || settings?.smtpPass || '').trim();
    const pass = rawPass.replace(/\s+/g, '');

    const senderEmail = process.env.SENDER_EMAIL || settings?.senderEmail || user || 'kumarasutosh2014@gmail.com';
    const senderName = process.env.SENDER_NAME || settings?.senderName || 'Ashutosh Kumar';

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

    // Check if valid credentials exist
    if (!user || !pass || rawPass === '••••••••••••') {
      console.log(`[Email Service SIMULATION] Email + PDF (${attachmentSource}) prepared for: ${to}`);
      return {
        success: true,
        simulated: true,
        message: `Simulation Mode: Email + ${attachmentSource} prepared for ${to}.`,
        previewRecipient: to,
        subject
      };
    }

    // Create Nodemailer Transport
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Send Email with Attached PDF
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject,
      html: htmlContent,
      attachments: [
        {
          filename: 'Ashutosh_Kumar_Resume.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    console.log(`[Email Service LIVE] Sent email with ${attachmentSource} attached to ${to}. Message ID: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
      message: `🎉 Email + ${attachmentSource} attached & sent successfully to ${to}!`
    };

  } catch (error) {
    console.error(`[Email Service ERROR] Failed to send email to ${to}:`, error.message);
    
    let friendlyErrorMessage = error.message;
    if (error.message.includes('535-5.7.8') || error.message.includes('Username and Password not accepted')) {
      friendlyErrorMessage = 'Gmail rejected login credentials. Ensure 2FA & App Password are active.';
    }

    return {
      success: false,
      simulated: false,
      error: error.message,
      message: `Email sending failed: ${friendlyErrorMessage}`
    };
  }
}
