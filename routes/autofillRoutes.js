import express from 'express';
import AutoFillProfile from '../models/AutoFillProfile.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';
import { getMasterResume } from '../services/storageService.js';

const router = express.Router();

const RULE_TEMPLATES = [
  {
    id: 'first_name',
    category: 'Contact',
    question: 'First Name',
    keywords: ['first name', 'fname', 'given name', 'forename'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'last_name',
    category: 'Contact',
    question: 'Last Name',
    keywords: ['last name', 'lname', 'surname', 'family name'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'full_name',
    category: 'Contact',
    question: 'Full Name',
    keywords: ['full name', 'applicant name', 'candidate name', 'your name'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'email',
    category: 'Contact',
    question: 'Email ID',
    keywords: ['email id', 'email', 'e-mail', 'email address', 'electronic mail'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'phone',
    category: 'Contact',
    question: 'Contact Number',
    keywords: ['contact number', 'phone', 'mobile', 'cell', 'telephone', 'phone number', 'contact no'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'linkedin',
    category: 'Links',
    question: 'Linkedin URL',
    keywords: ['linkedin url', 'linkedin', 'linked-in', 'linkedin profile'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'github',
    category: 'Links',
    question: 'GitHub URL',
    keywords: ['github url', 'github', 'git-hub', 'github profile'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'portfolio',
    category: 'Links',
    question: 'Portfolio / Website URL',
    keywords: ['portfolio', 'portfolio url', 'website', 'personal website', 'personal url'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'resume_link',
    category: 'Links',
    question: 'Resume Link / Google Drive URL',
    keywords: ['resume link', 'resume url', 'cv link', 'cv url', 'link to resume', 'google drive resume'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'experience',
    category: 'Experience',
    question: 'Total years of experience',
    keywords: ['total years of experience', 'years experience', 'total experience', 'yoe', 'experience years', 'work experience'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'current_title',
    category: 'Experience',
    question: 'Current Job Title / Role',
    keywords: ['job title', 'current role', 'current title', 'headline', 'position'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'current_company',
    category: 'Experience',
    question: 'Current Company / Employer',
    keywords: ['current company', 'employer', 'present company', 'organization'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'notice_period',
    category: 'Experience',
    question: 'Notice Period / Availability',
    keywords: ['notice period', 'notice', 'availability', 'how soon can you start'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'city',
    category: 'Contact',
    question: 'Current City / Location',
    keywords: ['city', 'current city', 'location', 'current location'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'country',
    category: 'Contact',
    question: 'Country',
    keywords: ['country', 'nationality'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'degree',
    category: 'Education',
    question: 'Highest Degree / Qualification',
    keywords: ['degree', 'highest qualification', 'education level', 'major'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'school',
    category: 'Education',
    question: 'University / College',
    keywords: ['school', 'university', 'college', 'institution'],
    answer: '',
    type: 'text',
    isDefault: true
  },
  {
    id: 'skills',
    category: 'Experience',
    question: 'Key Skills & Technologies',
    keywords: ['skills', 'key skills', 'technologies', 'tech stack'],
    answer: '',
    type: 'textarea',
    isDefault: true
  },
  {
    id: 'cover_letter',
    category: 'Custom Q&A',
    question: 'Cover Letter / Elevator Pitch / Why should we hire you?',
    keywords: ['cover letter', 'pitch', 'why hire', 'why should we hire you', 'additional info', 'message to hiring'],
    answer: '',
    type: 'textarea',
    isDefault: true
  },
  {
    id: 'work_auth',
    category: 'Custom Q&A',
    question: 'Are you legally authorized to work in this country?',
    keywords: ['authorized to work', 'legally authorized', 'eligible to work'],
    answer: '',
    type: 'select',
    isDefault: true
  },
  {
    id: 'sponsorship',
    category: 'Custom Q&A',
    question: 'Will you now or in the future require visa sponsorship?',
    keywords: ['require sponsorship', 'visa sponsorship', 'need sponsorship'],
    answer: '',
    type: 'select',
    isDefault: true
  },
  {
    id: 'relocation',
    category: 'Custom Q&A',
    question: 'Are you willing to relocate?',
    keywords: ['relocate', 'willing to relocate', 'relocation'],
    answer: '',
    type: 'text',
    isDefault: true
  }
];

export const DEFAULT_QA_RULES = RULE_TEMPLATES.map((r) => ({ ...r, answer: '' }));

// Fill answers from the user's own profile. Anything we can't derive stays
// blank so the extension skips it instead of typing a wrong value.
async function getDefaultsForUser(user) {
  if (!user) return DEFAULT_QA_RULES;
  let m = {};
  try {
    m = (await getMasterResume(user._id || user.id || null)) || {};
  } catch {
    m = {};
  }
  const fullName = (m.fullName || user.name || '').trim();
  const [firstName = '', ...rest] = fullName.split(/\s+/);
  const latestJob = (m.experience || [])[0] || {};
  const edu = (m.education || [])[0] || {};
  const skills = (m.skills || []).flatMap((g) => g.items || []).slice(0, 15).join(', ');

  const answers = {
    first_name: firstName,
    last_name: rest.join(' '),
    full_name: fullName,
    email: m.email || user.email || '',
    phone: m.phone || '',
    linkedin: m.linkedin || '',
    github: m.github || '',
    portfolio: m.website || '',
    resume_link: m.resumeUrl || m.website || '',
    current_title: latestJob.role || '',
    current_company: /present|current/i.test(latestJob.period || '') ? latestJob.company || '' : '',
    city: m.location || '',
    degree: edu.degree || '',
    school: edu.institution || '',
    skills,
    cover_letter: m.summary || ''
  };

  return DEFAULT_QA_RULES.map((r) => (r.id in answers ? { ...r, answer: answers[r.id] } : r));
}

/**
 * GET /api/autofill
 * Returns all Q&A autofill rules for the user (or default rules)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    if (req.userId) {
      let profile = await AutoFillProfile.findOne({ userId: req.userId });
      if (!profile || !profile.rules || profile.rules.length === 0) {
        const initialRules = await getDefaultsForUser(req.user);
        profile = new AutoFillProfile({
          userId: req.userId,
          rules: initialRules
        });
        await profile.save();
      }
      return res.json({ success: true, data: profile.rules, isCustomized: true });
    }

    // Unauthenticated fallback: return standard rules
    return res.json({ success: true, data: DEFAULT_QA_RULES, isCustomized: false });
  } catch (err) {
    console.error('[AutoFill Route Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/autofill
 * Save or update Q&A rules for authenticated user
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, error: 'Rules must be an array of questions and answers.' });
    }

    let profile = await AutoFillProfile.findOne({ userId: req.userId });
    if (!profile) {
      profile = new AutoFillProfile({ userId: req.userId, rules });
    } else {
      profile.rules = rules;
    }

    await profile.save();
    return res.json({ success: true, data: profile.rules, message: 'Q&A rules updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/autofill/reset
 * Reset Q&A rules to defaults for the user
 */
router.post('/reset', requireAuth, async (req, res) => {
  try {
    const freshRules = await getDefaultsForUser(req.user);
    let profile = await AutoFillProfile.findOne({ userId: req.userId });
    if (profile) {
      profile.rules = freshRules;
      await profile.save();
    }
    return res.json({ success: true, data: freshRules, message: 'Reset to default Q&A rules.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
