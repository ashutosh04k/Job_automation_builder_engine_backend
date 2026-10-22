import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import targetRoutes from './routes/targetRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import trackRoutes from './routes/trackRoutes.js';
import autofillRoutes from './routes/autofillRoutes.js';
import discoveredJobRoutes from './routes/discoveredJobRoutes.js';
import { initCronService } from './services/cronService.js';
import { getJobTargets, migrateOrphanRecordsToUser } from './services/storageService.js';
import User from './models/User.js';

const app = express();
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/resume_cron_db';

// Middleware
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? {
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://'))
} : undefined));
app.use(express.json({ limit: '10mb' }));

// Healthcheck Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'MERN Resume Automation Backend (Multi-Tenant)',
    cronEnabled: process.env.ENABLE_CRON !== 'false',
    dbState: mongoose.connection.readyState === 1 ? 'MongoDB Atlas Connected' : 'Persistent Disk Storage (JSON)',
    timestamp: new Date()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/template', templateRoutes);
app.use('/api/track', trackRoutes);
app.use('/api/autofill', autofillRoutes);
app.use('/api/discovered-jobs', discoveredJobRoutes);

// Serve Frontend Static Build in Production on Render (only if dist exists)
const __dirname = path.resolve();
const distPath = path.join(__dirname, '../frontend/dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Start Server with Dual Persistence & Graceful Error Handling
async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be set (32+ chars). Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }

  try {
    console.log(`Connecting to MongoDB Atlas at: ${MONGO_URI.substring(0, 35)}...`);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000 // 10 seconds for reliable Atlas connection
    });
    console.log('✅ MongoDB Database connected successfully.');

    // Seed or locate primary admin account & run multi-tenant migration
    try {
      const adminEmail = (process.env.PRIMARY_USER_EMAIL || '').trim().toLowerCase();
      let primaryUser = adminEmail ? await User.findOne({ email: adminEmail }) : null;
      if (!primaryUser && adminEmail && process.env.PRIMARY_USER_PASSWORD) {
        primaryUser = new User({
          name: process.env.PRIMARY_USER_NAME || 'Admin',
          email: adminEmail,
          password: process.env.PRIMARY_USER_PASSWORD,
          role: 'admin',
          senderName: process.env.PRIMARY_USER_NAME || '',
          senderEmail: adminEmail
        });
        await primaryUser.save();
        console.log(`✅ Initialized primary admin account: ${adminEmail}`);
      } else if (!primaryUser) {
        console.warn('⚠️ PRIMARY_USER_EMAIL / PRIMARY_USER_PASSWORD not set — skipping admin seeding.');
      }

      if (primaryUser) await migrateOrphanRecordsToUser(primaryUser._id);
    } catch (migErr) {
      console.warn('⚠️ Primary user seeding/migration notice:', migErr.message);
    }

  } catch (err) {
    console.warn('⚠️ Could not connect to MongoDB Atlas immediately. Operating with persistent disk fallback.');
    console.warn(`Error: ${err.message}`);
  }

  // Pre-load and sync targets on startup
  try {
    const result = await getJobTargets({ fetchAll: true });
    const count = Array.isArray(result) ? result.length : (result?.data?.length ?? 0);
    console.log(`📦 Loaded ${count} job target(s) across database/disk store.`);
  } catch (e) {
    console.warn('Target pre-load warning:', e.message);
  }

  // Initialize Cron Service (9 AM Daily)
  initCronService();

  const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Multi-Tenant AutoResume Server running on http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error: Port ${PORT} is already in use by another running process.`);
      console.error(`👉 To free port ${PORT}, run:  lsof -ti :${PORT} | xargs kill -9\n`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer();
