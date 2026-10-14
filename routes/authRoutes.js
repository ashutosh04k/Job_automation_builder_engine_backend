import express from 'express';
import User from '../models/User.js';
import MasterResume from '../models/MasterResume.js';
import Settings from '../models/Settings.js';
import { requireAuth, generateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new job seeker account
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check existing
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email address already exists. Please log in.'
      });
    }

    // Create user
    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      password,
      senderName: name.trim(),
      senderEmail: cleanEmail
    });

    await user.save();

    // Initialize user's personal Master Resume
    const defaultResume = new MasterResume({
      userId: user._id,
      fullName: user.name,
      email: user.email,
      title: 'Full Stack Developer',
      summary: 'Results-driven software developer building scalable, production-ready web applications.',
      skills: [
        { category: 'Frontend', items: ['React.js', 'JavaScript', 'TypeScript', 'Tailwind CSS'] },
        { category: 'Backend', items: ['Node.js', 'Express.js', 'REST APIs', 'MongoDB', 'SQL'] },
        { category: 'DevOps & Tools', items: ['Git', 'Docker', 'AWS', 'CI/CD'] }
      ]
    });
    await defaultResume.save();

    // Generate JWT token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Log in with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        senderName: user.senderName,
        senderEmail: user.senderEmail
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        senderName: req.user.senderName,
        senderEmail: req.user.senderEmail,
        hasCustomPdf: !!req.user.customPdfFilename,
        hasGmailOAuth: !!req.user.gmailRefreshToken
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/auth/profile
 * Update user credentials / sender info
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, senderName, senderEmail, gmailClientId, gmailClientSecret, gmailRefreshToken } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (senderName !== undefined) user.senderName = senderName.trim();
    if (senderEmail !== undefined) user.senderEmail = senderEmail.trim();
    if (gmailClientId !== undefined) user.gmailClientId = gmailClientId.trim();
    if (gmailClientSecret !== undefined) user.gmailClientSecret = gmailClientSecret.trim();
    if (gmailRefreshToken !== undefined) user.gmailRefreshToken = gmailRefreshToken.trim();

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        senderName: user.senderName,
        senderEmail: user.senderEmail,
        hasGmailOAuth: !!user.gmailRefreshToken
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
