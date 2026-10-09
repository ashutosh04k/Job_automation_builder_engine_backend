import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import targetRoutes from './routes/targetRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { initCronService } from './services/cronService.js';
import { getJobTargets } from './services/storageService.js';

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
    service: 'MERN Resume Automation Backend',
    cronSchedule: '0 9 * * * (9:00 AM Daily)',
    dbState: mongoose.connection.readyState === 1 ? 'MongoDB Atlas Connected' : 'Persistent Disk Storage (JSON)',
    timestamp: new Date()
  });
});

// API Routes
app.use('/api/targets', targetRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/settings', settingsRoutes);

// Start Server with Dual Persistence & Graceful Error Handling
async function startServer() {
  try {
    console.log(`Connecting to MongoDB Atlas at: ${MONGO_URI.substring(0, 35)}...`);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000 // 10 seconds for reliable Atlas connection
    });
    console.log('✅ MongoDB Database connected successfully.');
  } catch (err) {
    console.warn('⚠️ Could not connect to MongoDB Atlas immediately. Operating with persistent disk fallback.');
    console.warn(`Error: ${err.message}`);
  }

  // Pre-load and sync targets on startup
  try {
    const activeTargets = await getJobTargets();
    console.log(`📦 Loaded ${activeTargets.length} job target(s) from database/disk store.`);
  } catch (e) {
    console.warn('Target pre-load warning:', e.message);
  }

  // Initialize Cron Service (9 AM Daily)
  initCronService();

  const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 MERN Resume Server running on http://localhost:${PORT}`);
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
