import express from 'express';
import {
  getDiscoveredJobs,
  saveDiscoveredJobsBatch,
  updateDiscoveredJob,
  deleteDiscoveredJob,
  createJobTarget
} from '../services/storageService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { cleanCompanyName } from '../shared/jobMeta.js';
import { getMasterResume } from '../services/storageService.js';
import { safeScore } from '../services/atsService.js';

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/discovered-jobs
 * Query params: page, limit, search, applyType, status, all
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const search = req.query.search || '';
    const applyType = req.query.applyType || 'all';
    const status = req.query.status || 'all';
    const fetchAll = req.query.all === 'true';

    const userId = req.userId || null;
    const result = await getDiscoveredJobs({ page, limit, search, applyType, status, fetchAll }, userId);

    if (fetchAll) {
      return res.json({
        success: true,
        data: result.data || result,
        counts: result.counts || { all: (result.data || result).length, easyApply: 0, external: 0 }
      });
    }

    return res.json({
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasPrevPage: result.hasPrevPage,
      hasNextPage: result.hasNextPage,
      counts: result.counts || { all: result.total, easyApply: 0, external: 0 }
    });
  } catch (err) {
    console.error('[Discovered Jobs GET Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/discovered-jobs/batch
 * Bulk ingestion of jobs scraped from LinkedIn search results via the Chrome extension
 */
router.post('/batch', async (req, res) => {
  try {
    const { jobs } = req.body;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or empty jobs array provided.'
      });
    }

    const userId = req.userId || null;
    // Score only jobs that came with a real description (search-result cards usually don't).
    const master = await getMasterResume(userId);
    const scored = [];
    for (const job of jobs.slice(0, 100)) {
      const jd = job.jobDescription || '';
      const report = jd.trim()
        ? await safeScore(master, { jobDescription: jd, targetRole: job.title || job.jobTitle || '' })
        : null;
      scored.push({ ...job, atsScore: report?.score ?? null });
    }
    const result = await saveDiscoveredJobsBatch(scored, userId);

    return res.json({
      success: true,
      message: `Successfully processed ${result.totalCount} jobs (${result.easyApplyCount} Easy Apply, ${result.externalCount} External Apply).`,
      ...result
    });
  } catch (err) {
    console.error('[Discovered Jobs Batch Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/discovered-jobs/:id
 * Update status (e.g., 'applied', 'queued', 'archived') or notes
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId || null;
    const updated = await updateDiscoveredJob(id, req.body, userId);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Discovered job not found.' });
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Discovered Jobs PUT Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/discovered-jobs/:id
 * Remove discovered job
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId || null;
    await deleteDiscoveredJob(id, userId);

    return res.json({ success: true, message: 'Discovered job deleted successfully.' });
  } catch (err) {
    console.error('[Discovered Jobs DELETE Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/discovered-jobs/:id/queue-target
 * Move a discovered job to the 9 AM automation queue (JobTarget)
 */
router.post('/:id/queue-target', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const userId = req.userId || null;

    // Get discovered jobs to find this record
    const result = await getDiscoveredJobs({ fetchAll: true }, userId);
    const jobs = result.data || result;
    const job = jobs.find(j => String(j._id) === String(id) || String(j.jobId) === String(id));

    if (!job) {
      return res.status(404).json({ success: false, error: 'Discovered job not found.' });
    }

    // Never guess an address: guessed emails bounce and damage sender reputation.
    const recipientEmail = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return res.status(400).json({ success: false, error: 'A valid recruiter email is required to queue this job.' });
    }

    const jobDescription = job.jobDescription || `${job.title} at ${job.company}. Location: ${job.location || 'Remote'}. Job URL: ${job.jobUrl || ''}`;
    const targetRole = job.title || 'Software Developer';
    const report = await safeScore(await getMasterResume(userId), { jobDescription, targetRole });

    const newTarget = await createJobTarget({
      email: recipientEmail,
      jobDescription,
      targetRole,
      companyName: cleanCompanyName(job.company) || 'Target Company',
      atsScore: report?.score ?? null
    }, userId);

    // Update status of discovered job to 'queued'
    await updateDiscoveredJob(id, { status: 'queued' }, userId);

    return res.json({
      success: true,
      message: `Successfully queued "${job.title}" at "${job.company}" for 9 AM outreach automation!`,
      data: newTarget
    });
  } catch (err) {
    console.error('[Discovered Jobs Queue Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
