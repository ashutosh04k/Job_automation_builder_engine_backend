import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getSettings, getMasterResume } from './storageService.js';
import { generateResumePDF } from './pdfService.js';

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

    const resendApiKey = process.env.RESEND_API_KEY || '';

    // --- PRIMARY: Resend HTTP API (works on Render free tier) ---
    if (resendApiKey && resendApiKey !== 'your_resend_api_key_here') {
      console.log(`[Email Service] Using Resend HTTP API to send email to ${to}`);
      const resend = new Resend(resendApiKey);

      // Use verified email/domain from env, fallback to Resend test address
      const fromAddress = process.env.RESEND_FROM_EMAIL || `${senderName} <onboarding@resend.dev>`;
      // Always set reply-to as user's actual Gmail so recruiters can reply to you directly
      const replyTo = process.env.SENDER_EMAIL || senderEmail;

      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: [to],
        reply_to: replyTo,
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: 'Ashutosh_Kumar_Resume.pdf',
            content: pdfBuffer.toString('base64')
          }
        ]
      });

      if (error) {
        console.error(`[Resend ERROR] Failed to send email:`, error);
        return {
          success: false,
          simulated: false,
          error: error.message,
          message: `Resend API error: ${error.message}`
        };
      }

      console.log(`[Email Service LIVE via Resend] Sent email to ${to}. ID: ${data.id}`);
      return {
        success: true,
        simulated: false,
        messageId: data.id,
        message: `🎉 Email + ${attachmentSource} sent successfully to ${to} via Resend!`
      };
    }

    // --- FALLBACK: Nodemailer SMTP (for local dev) ---
    const host = process.env.SMTP_HOST || settings?.smtpHost || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || settings?.smtpPort || '587');
    const user = (process.env.SMTP_USER || settings?.smtpUser || '').trim();
    const rawPass = (process.env.SMTP_PASS || settings?.smtpPass || '').trim();
    const pass = rawPass.replace(/\s+/g, '');

    // No valid credentials at all — simulate
    if (!user || !pass || rawPass === '••••••••••••') {
      console.log(`[Email Service SIMULATION] Email + PDF (${attachmentSource}) prepared for: ${to}`);
      return {
        success: true,
        simulated: true,
        message: `Simulation Mode: No RESEND_API_KEY set. Email + ${attachmentSource} prepared for ${to}.`,
        previewRecipient: to,
        subject
      };
    }

    console.log(`[Email Service] Using Nodemailer SMTP fallback to send email to ${to}`);

    const isGmail = host === 'smtp.gmail.com' || user.endsWith('@gmail.com');

    const transporter = isGmail
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
          family: 4,
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000
        })
      : nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
          family: 4,
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000
        });

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

    console.log(`[Email Service LIVE via SMTP] Sent email with ${attachmentSource} to ${to}. Message ID: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
      message: `🎉 Email + ${attachmentSource} sent successfully to ${to}!`
    };

  } catch (error) {
    console.error(`[Email Service ERROR] Failed to send email to ${to}:`, error.message);

    let friendlyErrorMessage = error.message;
    if (error.message.includes('535-5.7.8') || error.message.includes('Username and Password not accepted')) {
      friendlyErrorMessage = 'Gmail rejected login credentials. Ensure 2FA & App Password are active.';
    } else if (error.message.includes('Connection timeout') || error.message.includes('ETIMEDOUT')) {
      friendlyErrorMessage = 'SMTP connection timed out. Set RESEND_API_KEY env variable on Render to bypass this.';
    }

    return {
      success: false,
      simulated: false,
      error: error.message,
      message: `Email sending failed: ${friendlyErrorMessage}`
    };
  }
}
