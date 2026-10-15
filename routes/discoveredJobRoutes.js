import express from 'express';
import {
  getDiscoveredJobs,
  saveDiscoveredJobsBatch,
  updateDiscoveredJob,
  deleteDiscoveredJob,
  createJobTarget
} from '../services/storageService.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Use optionalAuth so that if token is sent by extension or web portal, req.userId is populated
router.use(optionalAuth);

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
    const result = await saveDiscoveredJobsBatch(jobs, userId);

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

    const recipientEmail = email || `careers@${(job.company || 'company').toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

    const newTarget = await createJobTarget({
      email: recipientEmail,
      jobDescription: job.jobDescription || `${job.title} at ${job.company}. Location: ${job.location || 'Remote'}. Job URL: ${job.jobUrl || ''}`,
      targetRole: job.title || 'Software Developer',
      companyName: job.company || 'Company'
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
