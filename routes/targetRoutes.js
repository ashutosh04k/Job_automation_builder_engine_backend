import express from 'express';
import { 
  getJobTargets, 
  createJobTarget, 
  updateJobTarget, 
  deleteJobTarget, 
  getJobTargetById 
} from '../services/storageService.js';
import { processTargetExecution, executeDaily9AMCronJob } from '../services/cronService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { cleanCompanyName, resolveRole } from '../shared/jobMeta.js';
import { getMasterResume } from '../services/storageService.js';
import { safeScore, rescoreUserTargets } from '../services/atsService.js';

const router = express.Router();

// Enforce authentication on all target routes
router.use(requireAuth);

// GET targets with backend pagination & optional user scoping
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '5', 10);
    const search = req.query.search || '';
    const fetchAll = req.query.all === 'true';

    const userId = req.userId || null;
    const result = await getJobTargets({ page, limit, search, fetchAll }, userId);

    if (fetchAll) {
      return res.json({ success: true, count: result.length, data: result });
    }

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasPrevPage: result.hasPrevPage,
      hasNextPage: result.hasNextPage
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST new target (Email + Job Description 2 Input Boxes)
router.post('/', async (req, res) => {
  try {
    const { email, jobDescription, targetRole, companyName } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipient Email is required.' 
      });
    }

    const userId = req.userId || null;
    const jd = (jobDescription || '').trim();
    const master = await getMasterResume(userId);
    const report = await safeScore(master, {
      jobDescription: jd,
      targetRole: resolveRole(targetRole, jd, master?.title || '')
    });

    const newTarget = await createJobTarget({
      email,
      jobDescription: jd,
      targetRole: targetRole || 'Software Engineer',
      companyName: cleanCompanyName(companyName) || 'Target Company',
      atsScore: report?.score ?? null
    }, userId);

    res.status(201).json({ 
      success: true, 
      message: `Job target saved. It will be emailed once in the next daily run to ${email}.`, 
      data: newTarget 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update target
router.put('/:id', async (req, res) => {
  try {
    const userId = req.userId || null;
    const target = await updateJobTarget(req.params.id, req.body, userId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Target not found' });
    }
    res.json({ success: true, message: 'Target updated', data: target });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE target
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || null;
    const success = await deleteJobTarget(req.params.id, userId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Target not found' });
    }
    res.json({ success: true, message: 'Target deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST trigger manual test send now
router.post('/:id/trigger', async (req, res) => {
  try {
    const userId = req.userId || null;
    const target = await getJobTargetById(req.params.id, userId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Target not found' });
    }
    const outcome = await processTargetExecution(target, 'manual');
    if (outcome.result && !outcome.result.success) {
      return res.status(500).json({
        success: false,
        error: outcome.result.message || outcome.result.error || 'Failed to dispatch email',
        outcome
      });
    }
    res.json({ success: true, message: `Email triggered for ${target.email}`, outcome });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST recompute ATS scores for all of this user's targets
router.post('/rescore', async (req, res) => {
  try {
    const summary = await rescoreUserTargets(req.userId);
    res.json({ success: true, message: `Rescored ${summary.total} target(s).`, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST trigger daily 9 AM batch cron manually
router.post('/trigger-all-cron', async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const summary = await executeDaily9AMCronJob('manual', { onlyUserId: isAdmin ? null : req.userId });
    res.json({ success: true, message: 'Daily 9 AM cron job triggered manually.', summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
