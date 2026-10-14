import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import targetRoutes from './routes/targetRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import trackRoutes from './routes/trackRoutes.js';
import { initCronService } from './services/cronService.js';
import { getJobTargets, migrateOrphanRecordsToUser } from './services/storageService.js';
import User from './models/User.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/resume_cron_db';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Healthcheck Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'MERN Resume Automation Backend (Multi-Tenant)',
    cronSchedule: '0 9 * * * (9:00 AM Daily)',
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
  try {
    console.log(`Connecting to MongoDB Atlas at: ${MONGO_URI.substring(0, 35)}...`);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000 // 10 seconds for reliable Atlas connection
    });
    console.log('✅ MongoDB Database connected successfully.');

    // Seed or locate primary admin account & run multi-tenant migration
    try {
      let primaryUser = await User.findOne({ email: 'kumarasutosh2014@gmail.com' });
      if (!primaryUser) {
        primaryUser = new User({
          name: 'Ashutosh Kumar',
          email: 'kumarasutosh2014@gmail.com',
          password: process.env.PRIMARY_USER_PASSWORD || 'Ashutosh@2026',
          role: 'admin',
          senderName: 'Ashutosh Kumar',
          senderEmail: 'kumarasutosh2014@gmail.com'
        });
        await primaryUser.save();
        console.log('✅ Initialized primary admin account: kumarasutosh2014@gmail.com');
      }

      await migrateOrphanRecordsToUser(primaryUser._id);
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
    console.log(`⏰ Daily Cron Job active: Scheduled for 9:00 AM Every Morning`);
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
