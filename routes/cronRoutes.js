// External trigger for the daily run.
// Hosts that sleep when idle (e.g. Render free/starter web services) are not
// running at 9 AM, so the in-process node-cron never fires. A scheduler outside
// the app (Render Cron Job, GitHub Actions, cron-job.org...) calls this instead:
//
//   POST /api/cron/run   header:  x-cron-secret: <CRON_SECRET>
//
// The request wakes the server; the run continues in the background.
import express from 'express';
import crypto from 'crypto';
import { executeDaily9AMCronJob } from '../services/cronService.js';

const router = express.Router();

function secretMatches(given = '') {
  const expected = process.env.CRON_SECRET || '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return expected.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/run', async (req, res) => {
  if (!process.env.CRON_SECRET) {
    return res.status(503).json({ success: false, error: 'External trigger is not configured (set CRON_SECRET).' });
  }
  if (!secretMatches(req.get('x-cron-secret'))) {
    return res.status(401).json({ success: false, error: 'Invalid cron secret.' });
  }
  try {
    const summary = await executeDaily9AMCronJob('cron', { background: true });
    res.status(202).json({ success: true, message: summary.message, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
