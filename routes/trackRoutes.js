import express from 'express';
import { 
  getJobTargetById, 
  updateJobTarget, 
  createLogEntry 
} from '../services/storageService.js';

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

    // Set anti-caching & cross-origin headers so every email open hits this endpoint without CORP blocks
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': TRANSPARENT_PNG.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });

    const target = await getJobTargetById(cleanTargetId);

    if (target) {
      const newCount = (target.openCount || 0) + 1;
      const now = new Date();

      await updateJobTarget(cleanTargetId, {
        isOpened: true,
        openedAt: target.openedAt || now,
        lastOpenedAt: now,
        openCount: newCount,
        lastOpenedIp: clientIp,
        lastOpenedUserAgent: userAgent
      }, target.userId || null);

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

  // Only redirect to http(s) URLs; anything else (javascript:, data:, missing) goes home.
  let destination = '/';
  try {
    const parsed = new URL(decodeURIComponent(url || ''));
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') destination = parsed.href;
  } catch {
    destination = '/';
  }

  try {
    const target = await getJobTargetById(cleanTargetId);

    if (target) {
      const newClicks = (target.clickCount || 0) + 1;
      const now = new Date();

      await updateJobTarget(cleanTargetId, {
        isOpened: true, // A link click confirms the email was opened
        openedAt: target.openedAt || now,
        lastOpenedAt: target.lastOpenedAt || now,
        openCount: target.openCount || 1,
        clickedAt: now,
        clickCount: newClicks
      }, target.userId || null);

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
  } catch (err) {
    console.error('[Link Tracker Error]:', err.message);
  }

  // Redirect to original destination
  return res.redirect(destination);
});

export default router;
