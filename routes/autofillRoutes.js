import express from 'express';
import AutoFillProfile from '../models/AutoFillProfile.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

export const DEFAULT_QA_RULES = [
  {
    id: 'first_name',
    category: 'Contact',
    question: 'First Name',
    keywords: ['first name', 'fname', 'given name', 'forename'],
    answer: 'Ashutosh',
    type: 'text',
    isDefault: true
  },
  {
    id: 'last_name',
    category: 'Contact',
    question: 'Last Name',
    keywords: ['last name', 'lname', 'surname', 'family name'],
    answer: 'Kumar',
    type: 'text',
    isDefault: true
  },
  {
    id: 'full_name',
    category: 'Contact',
    question: 'Full Name',
    keywords: ['full name', 'applicant name', 'candidate name', 'your name'],
    answer: 'Ashutosh Kumar',
    type: 'text',
    isDefault: true
  },
  {
    id: 'email',
    category: 'Contact',
    question: 'Email ID',
    keywords: ['email id', 'email', 'e-mail', 'email address', 'electronic mail'],
    answer: 'kumarasutosh2014@gmail.com',
    type: 'text',
    isDefault: true
  },
  {
    id: 'phone',
    category: 'Contact',
    question: 'Contact Number',
    keywords: ['contact number', 'phone', 'mobile', 'cell', 'telephone', 'phone number', 'contact no'],
    answer: '8521975695',
    type: 'text',
    isDefault: true
  },
  {
    id: 'linkedin',
    category: 'Links',
    question: 'Linkedin URL',
    keywords: ['linkedin url', 'linkedin', 'linked-in', 'linkedin profile'],
    answer: 'https://www.linkedin.com/in/ashutosh-kumar-sde',
    type: 'text',
    isDefault: true
  },
  {
    id: 'github',
    category: 'Links',
    question: 'GitHub URL',
    keywords: ['github url', 'github', 'git-hub', 'github profile'],
    answer: 'https://github.com/ashutosh04k',
    type: 'text',
    isDefault: true
  },
  {
    id: 'portfolio',
    category: 'Links',
    question: 'Portfolio / Website URL',
    keywords: ['portfolio', 'portfolio url', 'website', 'personal website', 'personal url'],
    answer: 'https://ashutosh-portfolio-8x6q.onrender.com/',
    type: 'text',
    isDefault: true
  },
  {
    id: 'experience',
    category: 'Experience',
    question: 'Total years of experience',
    keywords: ['total years of experience', 'years experience', 'total experience', 'yoe', 'experience years', 'work experience'],
    answer: '3.5',
    type: 'text',
    isDefault: true
  },
  {
    id: 'current_title',
    category: 'Experience',
    question: 'Current Job Title / Role',
    keywords: ['job title', 'current role', 'current title', 'headline', 'position'],
    answer: 'Full Stack Developer',
    type: 'text',
    isDefault: true
  },
  {
    id: 'current_company',
    category: 'Experience',
    question: 'Current Company / Employer',
    keywords: ['current company', 'employer', 'present company', 'organization'],
    answer: 'Tech Corp',
    type: 'text',
    isDefault: true
  },
  {
    id: 'notice_period',
    category: 'Experience',
    question: 'Notice Period / Availability',
    keywords: ['notice period', 'notice', 'availability', 'how soon can you start'],
    answer: 'Immediate / 15 Days',
    type: 'text',
    isDefault: true
  },
  {
    id: 'city',
    category: 'Contact',
    question: 'Current City / Location',
    keywords: ['city', 'current city', 'location', 'current location'],
    answer: 'Bengaluru',
    type: 'text',
    isDefault: true
  },
  {
    id: 'country',
    category: 'Contact',
    question: 'Country',
    keywords: ['country', 'nationality'],
    answer: 'India',
    type: 'text',
    isDefault: true
  },
  {
    id: 'degree',
    category: 'Education',
    question: 'Highest Degree / Qualification',
    keywords: ['degree', 'highest qualification', 'education level', 'major'],
    answer: 'Bachelor of Technology (B.Tech)',
    type: 'text',
    isDefault: true
  },
  {
    id: 'school',
    category: 'Education',
    question: 'University / College',
    keywords: ['school', 'university', 'college', 'institution'],
    answer: 'VTU',
    type: 'text',
    isDefault: true
  },
  {
    id: 'skills',
    category: 'Experience',
    question: 'Key Skills & Technologies',
    keywords: ['skills', 'key skills', 'technologies', 'tech stack'],
    answer: 'React.js, Next.js, TypeScript, Node.js, Express.js, MongoDB, Redux, REST APIs, WebSockets, Tailwind CSS, Material UI, AWS, Docker, CI/CD',
    type: 'textarea',
    isDefault: true
  },
  {
    id: 'cover_letter',
    category: 'Custom Q&A',
    question: 'Cover Letter / Elevator Pitch / Why should we hire you?',
    keywords: ['cover letter', 'pitch', 'why hire', 'why should we hire you', 'additional info', 'message to hiring'],
    answer: 'I am a Full Stack Developer with 3+ years of experience building scalable production applications with React.js, Next.js, TypeScript, Node.js, and MongoDB.',
    type: 'textarea',
    isDefault: true
  },
  {
    id: 'work_auth',
    category: 'Custom Q&A',
    question: 'Are you legally authorized to work in this country?',
    keywords: ['authorized to work', 'legally authorized', 'eligible to work'],
    answer: 'Yes',
    type: 'select',
    isDefault: true
  },
  {
    id: 'sponsorship',
    category: 'Custom Q&A',
    question: 'Will you now or in the future require visa sponsorship?',
    keywords: ['require sponsorship', 'visa sponsorship', 'need sponsorship'],
    answer: 'No',
    type: 'select',
    isDefault: true
  },
  {
    id: 'relocation',
    category: 'Custom Q&A',
    question: 'Are you willing to relocate?',
    keywords: ['relocate', 'willing to relocate', 'relocation'],
    answer: 'Yes, open to relocation',
    type: 'text',
    isDefault: true
  }
];

function getDefaultsForUser(user) {
  if (!user) return DEFAULT_QA_RULES;
  const nameParts = (user.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Ashutosh';
  const lastName = nameParts.slice(1).join(' ') || 'Kumar';

  return DEFAULT_QA_RULES.map(r => {
    if (r.id === 'first_name') return { ...r, answer: firstName };
    if (r.id === 'last_name') return { ...r, answer: lastName };
    if (r.id === 'full_name') return { ...r, answer: user.name || 'Ashutosh Kumar' };
    if (r.id === 'email') return { ...r, answer: user.email || 'kumarasutosh2014@gmail.com' };
    return r;
  });
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
        const initialRules = getDefaultsForUser(req.user);
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
    const freshRules = getDefaultsForUser(req.user);
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
