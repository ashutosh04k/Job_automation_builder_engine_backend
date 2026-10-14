import express from 'express';
import mongoose from 'mongoose';
import JobTarget from '../models/JobTarget.js';
import { createLogEntry, isMongoConnected } from '../services/storageService.js';

const router = express.Router();

// 1x1 Transparent PNG binary buffer
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAAElFTkSuQmCC',
  'base64'
);

/**
 * GET /api/track/open/:targetId.png
 * Stealth 1x1 transparent image endpoint to record email opens
 */
router.get('/open/:targetId', async (req, res) => {
  try {
    const rawTargetId = req.params.targetId;
    const cleanTargetId = rawTargetId.replace(/\.(png|gif|jpg|jpeg)$/i, '');

    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || 'Unknown client';

    // Set anti-caching headers so every email open hits this endpoint
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': TRANSPARENT_PNG.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff'
    });

    if (isMongoConnected() && mongoose.Types.ObjectId.isValid(cleanTargetId)) {
      const target = await JobTarget.findById(cleanTargetId);

      if (target) {
        const isFirstOpen = !target.isOpened;
        const newCount = (target.openCount || 0) + 1;

        target.isOpened = true;
        if (!target.openedAt) target.openedAt = new Date();
        target.lastOpenedAt = new Date();
        target.openCount = newCount;
        target.lastOpenedIp = clientIp;
        target.lastOpenedUserAgent = userAgent;

        await target.save();

        // Create an audit log record for the recruiter's open event
        await createLogEntry(
          {
            targetId: target._id,
            recipientEmail: target.email,
            jobDescriptionSnippet: `Role: ${target.targetRole} @ ${target.companyName}`,
            status: 'opened',
            triggeredBy: 'recruiter',
            details: `🎉 Recruiter opened email! (Total opens: ${newCount}) [Client: ${userAgent.substring(0, 50)}]`
          },
          target.userId || null
        );

        console.log(`[Email Tracker] Open recorded for target ${target.email} (Open #${newCount}) from IP: ${clientIp}`);
      }
    }

    return res.end(TRANSPARENT_PNG);

  } catch (err) {
    console.error('[Email Tracker Error]:', err.message);
    // Always serve the 1x1 image so the recipient's mail client does not show broken image icon
    return res.end(TRANSPARENT_PNG);
  }
});

/**
 * GET /api/track/click/:targetId
 * Unblockable click tracker for portfolio, resume, or social links
 */
router.get('/click/:targetId', async (req, res) => {
  const { url } = req.query;
  const rawTargetId = req.params.targetId;
  const cleanTargetId = rawTargetId.replace(/\.(png|gif|jpg|jpeg)$/i, '');

  const fallbackUrl = 'https://ashutosh-portfolio-8x6q.onrender.com/';
  const destination = url ? decodeURIComponent(url) : fallbackUrl;

  try {
    if (isMongoConnected() && mongoose.Types.ObjectId.isValid(cleanTargetId)) {
      const target = await JobTarget.findById(cleanTargetId);

      if (target) {
        const newClicks = (target.clickCount || 0) + 1;
        target.clickedAt = new Date();
        target.clickCount = newClicks;
        await target.save();

        await createLogEntry(
          {
            targetId: target._id,
            recipientEmail: target.email,
            jobDescriptionSnippet: `Role: ${target.targetRole} @ ${target.companyName}`,
            status: 'clicked',
            triggeredBy: 'recruiter',
            details: `🔥 Recruiter clicked portfolio/resume link! (${destination})`
          },
          target.userId || null
        );

        console.log(`[Link Tracker] Click recorded for target ${target.email} -> ${destination}`);
      }
    }
  } catch (err) {
    console.error('[Link Tracker Error]:', err.message);
  }

  // Redirect to original destination
  return res.redirect(destination);
});

export default router;
