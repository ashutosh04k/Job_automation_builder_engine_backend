import express from 'express';
import { getEmailTemplate, saveEmailTemplate, getMasterResume } from '../services/storageService.js';
import { renderEmailTemplate } from '../services/resumeTailorService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce auth on all template routes
router.use(requireAuth);

/**
 * GET /api/template
 * Get current user's email template
 */
router.get('/', async (req, res) => {
  try {
    const template = await getEmailTemplate(req.userId);
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/template
 * Update user's dynamic email template
 */
router.post('/', async (req, res) => {
  try {
    const { subject, body } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ success: false, error: 'Both Subject and Message Body are required.' });
    }
    const updated = await saveEmailTemplate({ subject, body }, req.userId);
    res.json({ success: true, message: 'Email template saved successfully!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/template/preview
 * Generate a live preview of the rendered template using the user's master resume
 */
router.post('/preview', async (req, res) => {
  try {
    const { subject, body, targetRole, companyName } = req.body;
    const master = await getMasterResume(req.userId);

    const rendered = renderEmailTemplate(
      { subject, body },
      {
        masterResume: master,
        targetRole: targetRole || 'Full Stack Developer',
        companyName: companyName || 'Target Company'
      }
    );

    res.json({ success: true, data: rendered });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/template/reset
 * Reset user's template to default cold outreach message
 */
router.post('/reset', async (req, res) => {
  try {
    const defaultSubject = '{{role}} (3+ Years) | Open to {{role}} Roles';
    const defaultBody = `Hi Sir/Maam,

I hope you're doing well.

My name is {{name}}, and I'm a Full Stack Developer with over 3 years of experience building and shipping production applications. I came across your profile and wanted to reach out directly.

My core stack includes React.js, Next.js, TypeScript, Node.js, Express.js, and MongoDB, supported by hands-on experience with Redux, REST APIs, WebSockets, Tailwind CSS, Material UI, AWS, Docker, and CI/CD pipelines. I have delivered applications across SaaS, real estate, logistics, and CRM platforms, with a consistent focus on performance and clean, maintainable architecture.

I'm currently exploring {{role}} opportunities. I've attached my resume for your reference and would welcome the chance to connect if there is a suitable opening on your team, or if you know of a relevant role elsewhere.

LinkedIn: {{linkedin}}
GitHub: {{github}}
Portfolio: {{portfolio}}

Thank you for your time and consideration.

Best regards,
{{name}}
{{phone}} | {{email}}`;

    const reset = await saveEmailTemplate({ subject: defaultSubject, body: defaultBody }, req.userId);
    res.json({ success: true, message: 'Template reset to default pitch!', data: reset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
