import express from 'express';
import { 
  getJobTargets, 
  createJobTarget, 
  updateJobTarget, 
  deleteJobTarget, 
  getJobTargetById 
} from '../services/storageService.js';
import { processTargetExecution, executeDaily9AMCronJob } from '../services/cronService.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply optionalAuth to all target routes
router.use(optionalAuth);

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

    if (!email || !jobDescription) {
      return res.status(400).json({ 
        success: false, 
        error: 'Both Email and Job Description are required.' 
      });
    }

    const userId = req.userId || null;
    const newTarget = await createJobTarget({
      email,
      jobDescription,
      targetRole: targetRole || 'Software Engineer',
      companyName: companyName || 'Target Company'
    }, userId);

    res.status(201).json({ 
      success: true, 
      message: 'Job Target saved! Daily 9:00 AM Cron Email dispatch active for ' + email, 
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

// POST trigger daily 9 AM batch cron manually
router.post('/trigger-all-cron', async (req, res) => {
  try {
    const summary = await executeDaily9AMCronJob('manual');
    res.json({ success: true, message: 'Daily 9 AM cron job triggered manually.', summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
