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
import { buildSearchPlan, sanitizeScannedJob, MIN_JD_FOR_SCORE, DEFAULT_DAYS } from '../shared/linkedinJobs.js';

const MAX_BATCH = 60;

/** Score a job against the master resume, only when it has a real description. */
async function scoreJob(master, job) {
  if ((job.jobDescription || '').length < MIN_JD_FOR_SCORE) return { atsScore: null, missingSkills: [] };
  const report = await safeScore(master, { jobDescription: job.jobDescription, targetRole: job.title });
  return {
    atsScore: report?.score ?? null,
    missingSkills: (report?.keywords?.required?.missing || []).slice(0, 8)
  };
}

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
    const sort = req.query.sort === 'score' ? 'score' : 'recent';
    const maxDays = Number(req.query.maxDays) || 0;

    const userId = req.userId || null;
    const result = await getDiscoveredJobs({ page, limit, search, applyType, status, fetchAll, sort, maxDays }, userId);

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
 * GET /api/discovered-jobs/search-plan?days=3
 * LinkedIn searches that fit the master resume (role + most-used skills), last N days.
 */
router.get('/search-plan', async (req, res) => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || DEFAULT_DAYS));
    const master = await getMasterResume(req.userId || null);
    return res.json({ success: true, data: buildSearchPlan(master || {}, { days }) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/discovered-jobs/batch
 * Jobs the extension read from the user's LinkedIn search (with full descriptions).
 * Each is scored against the master resume; jobs without a real description stay unscored.
 */
router.post('/batch', async (req, res) => {
  try {
    const { jobs } = req.body || {};
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or empty jobs array provided.' });
    }
    const clean = jobs.slice(0, MAX_BATCH).map((j) => sanitizeScannedJob(j)).filter(Boolean);
    if (!clean.length) {
      return res.status(400).json({ success: false, error: 'None of these looked like LinkedIn jobs (missing job ID or title).' });
    }

    const userId = req.userId || null;
    const master = await getMasterResume(userId);
    const scored = [];
    for (const job of clean) scored.push({ ...job, ...(await scoreJob(master, job)) });
    const result = await saveDiscoveredJobsBatch(scored, userId);

    const top = scored
      .filter((j) => typeof j.atsScore === 'number')
      .sort((a, b) => b.atsScore - a.atsScore)
      .slice(0, 5)
      .map((j) => ({ jobId: j.jobId, title: j.title, company: j.company, atsScore: j.atsScore }));
    const unscored = scored.filter((j) => j.atsScore === null).length;

    return res.json({
      success: true,
      message: `Saved ${result.totalCount} job(s): ${result.insertedCount} new, ${result.updatedCount} updated.${unscored ? ` ${unscored} had no full description and are not scored.` : ''}`,
      ...result,
      skipped: jobs.length - clean.length,
      unscored,
      top
    });
  } catch (err) {
    console.error('[Discovered Jobs Batch Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/discovered-jobs/rescore
 * Re-score every saved job against the current master resume. Jobs without a
 * real description get no score (this also clears the old placeholder 85s).
 */
router.post('/rescore', async (req, res) => {
  try {
    const userId = req.userId || null;
    const master = await getMasterResume(userId);
    const { data } = await getDiscoveredJobs({ fetchAll: true }, userId);
    let scored = 0;
    for (const job of data) {
      const s = await scoreJob(master, job);
      if (s.atsScore !== null) scored += 1;
      if (s.atsScore !== job.atsScore || String(s.missingSkills) !== String(job.missingSkills || [])) {
        await updateDiscoveredJob(job._id, s, userId);
      }
    }
    return res.json({ success: true, message: `Rescored ${data.length} job(s); ${scored} have a full description and a score.`, total: data.length, scored });
  } catch (err) {
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
