import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import JobTarget from '../models/JobTarget.js';
import MasterResume from '../models/MasterResume.js';
import Settings from '../models/Settings.js';
import LogEntry from '../models/LogEntry.js';

const DATA_DIR = path.resolve(process.cwd(), 'data_store');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(filename) {
  return path.join(DATA_DIR, `${filename}.json`);
}

function readJsonFile(filename, defaultValue) {
  const filePath = getFilePath(filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return defaultValue;
  }
}

function writeJsonFile(filename, data) {
  const filePath = getFilePath(filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export const isMongoConnected = () => mongoose.connection.readyState === 1;

// --- JOB TARGETS STORAGE WITH PAGINATION SUPPORT ---
export async function getJobTargets(options = {}) {
  const page = parseInt(options.page || 1, 10);
  const limit = parseInt(options.limit || 5, 10);
  const search = (options.search || '').trim().toLowerCase();
  const fetchAll = options.fetchAll === true;

  const localTargets = readJsonFile('job_targets', []);
  let allTargets = [];

  if (isMongoConnected()) {
    try {
      const mongoTargets = await JobTarget.find().sort({ createdAt: -1 });
      
      // Sync local targets to Mongo if any local target is missing from Mongo
      for (const local of localTargets) {
        const existsInMongo = mongoTargets.some(m => 
          m._id?.toString() === local._id?.toString() || 
          (m.email === local.email && m.jobDescription === local.jobDescription)
        );
        if (!existsInMongo) {
          try {
            const newDoc = new JobTarget({
              email: local.email,
              jobDescription: local.jobDescription,
              targetRole: local.targetRole,
              companyName: local.companyName,
              cronSchedule: local.cronSchedule || '0 9 * * *',
              isActive: local.isActive !== undefined ? local.isActive : true,
              status: local.status || 'active',
              totalSentCount: local.totalSentCount || 0,
              lastSentAt: local.lastSentAt || null
            });
            await newDoc.save();
            mongoTargets.unshift(newDoc);
          } catch (e) {
            console.error('Target sync warning:', e.message);
          }
        }
      }
      
      // Update local file cache with latest Mongo data
      const plainMongoTargets = mongoTargets.map(doc => doc.toObject());
      writeJsonFile('job_targets', plainMongoTargets);
      allTargets = plainMongoTargets;
    } catch (err) {
      console.warn('Mongo fetch warning, using disk storage:', err.message);
      allTargets = localTargets;
    }
  } else {
    allTargets = localTargets;
  }

  // Sort by createdAt descending
  allTargets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Search Filtering
  if (search) {
    allTargets = allTargets.filter(t => 
      (t.email || '').toLowerCase().includes(search) ||
      (t.targetRole || '').toLowerCase().includes(search) ||
      (t.companyName || '').toLowerCase().includes(search) ||
      (t.jobDescription || '').toLowerCase().includes(search)
    );
  }

  // If internal service requests all targets (e.g. Cron Scheduler), return plain array
  if (fetchAll) {
    return allTargets;
  }

  // Calculate Pagination Metadata
  const total = allTargets.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * limit;
  const paginatedData = allTargets.slice(startIndex, startIndex + limit);

  return {
    data: paginatedData,
    total,
    page: currentPage,
    limit,
    totalPages,
    hasPrevPage: currentPage > 1,
    hasNextPage: currentPage < totalPages
  };
}

export async function createJobTarget(data) {
  let createdDoc = null;
  const targetId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

  const newTargetObj = {
    _id: targetId,
    email: data.email,
    jobDescription: data.jobDescription,
    targetRole: data.targetRole || 'Software Engineer',
    companyName: data.companyName || 'Target Company',
    cronSchedule: '0 9 * * *',
    isActive: true,
    status: 'active',
    totalSentCount: 0,
    lastSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isMongoConnected()) {
    try {
      const mongoDoc = new JobTarget({
        email: data.email,
        jobDescription: data.jobDescription,
        targetRole: data.targetRole || 'Software Engineer',
        companyName: data.companyName || 'Target Company',
        cronSchedule: '0 9 * * *',
        isActive: true,
        status: 'active',
        totalSentCount: 0,
        lastSentAt: null
      });
      await mongoDoc.save();
      createdDoc = mongoDoc;
      newTargetObj._id = mongoDoc._id.toString();
    } catch (err) {
      console.error('Mongo save error, relying on disk fallback:', err.message);
    }
  }

  const localTargets = readJsonFile('job_targets', []);
  localTargets.unshift(newTargetObj);
  writeJsonFile('job_targets', localTargets);

  return createdDoc || newTargetObj;
}

export async function updateJobTarget(id, updateData) {
  let updatedDoc = null;

  if (isMongoConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        updatedDoc = await JobTarget.findByIdAndUpdate(id, updateData, { new: true });
      }
    } catch (err) {
      console.warn('Mongo update warning:', err.message);
    }
  }

  const localTargets = readJsonFile('job_targets', []);
  const idx = localTargets.findIndex(t => t._id?.toString() === id?.toString());
  if (idx !== -1) {
    localTargets[idx] = {
      ...localTargets[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    writeJsonFile('job_targets', localTargets);
    if (!updatedDoc) updatedDoc = localTargets[idx];
  }

  return updatedDoc;
}

export async function deleteJobTarget(id) {
  let deletedFromMongo = false;

  if (isMongoConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await JobTarget.findByIdAndDelete(id);
        deletedFromMongo = true;
      }
    } catch (err) {
      console.warn('Mongo delete warning:', err.message);
    }
  }

  let localTargets = readJsonFile('job_targets', []);
  const initialLen = localTargets.length;
  localTargets = localTargets.filter(t => t._id?.toString() !== id?.toString());
  writeJsonFile('job_targets', localTargets);

  return deletedFromMongo || localTargets.length < initialLen;
}

export async function getJobTargetById(id) {
  if (isMongoConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const doc = await JobTarget.findById(id);
        if (doc) return doc;
      }
    } catch (err) {
      console.warn('Mongo findById warning:', err.message);
    }
  }
  const localTargets = readJsonFile('job_targets', []);
  return localTargets.find(t => t._id?.toString() === id?.toString()) || null;
}

// --- MASTER RESUME STORAGE ---
export async function getMasterResume() {
  const defaultMaster = {
    fullName: 'Ashutosh Kumar',
    email: 'kumarasutosh2014@gmail.com',
    phone: '8521975695',
    location: 'Gurgaon, Haryana',
    title: 'Software Developer | Full Stack Developer',
    summary: 'Full Stack Software Developer with 3+ years of experience building scalable web applications, REST APIs, real-time systems, CRM platforms, and data-intensive workflows using React.js, Node.js, MongoDB, TypeScript, AWS, and Docker.',
    website: 'https://ashutosh-portfolio-8x6q.onrender.com/',
    linkedin: 'https://www.linkedin.com/in/ashutosh-kumar-sde',
    github: 'https://github.com/ashutosh04k',
    skills: [
      { category: 'Frontend', items: ['React.js', 'Next.js', 'JavaScript', 'TypeScript', 'Redux', 'RTK Query', 'HTML5/CSS3', 'Tailwind CSS'] },
      { category: 'Backend & Databases', items: ['Node.js', 'Express.js', 'REST APIs', 'WebSockets', 'MongoDB', 'SQL', 'Mongoose'] },
      { category: 'Cloud & DevOps', items: ['AWS', 'EC2', 'S3', 'Docker', 'GitHub Actions', 'CI/CD', 'Nginx', 'Firebase'] },
      { category: 'Testing & Engineering', items: ['Jest', 'React Testing Library', 'API Testing', 'RBAC', 'Performance Optimization', 'DSA', 'OOP'] }
    ],
    experience: [
      {
        company: 'Togopool Pvt Ltd',
        role: 'Software Developer',
        period: 'July 2025 - Present',
        location: 'India',
        highlights: [
          'Engineered a full-stack order-import workflow mapping bulk data to application schemas, validating records, processing 200k+ orders per upload, and triggering route optimization for driver assignment.',
          'Built real-time notification workflows using Firebase and Service Workers for push delivery and event-driven updates.',
          'Integrated Stripe payment workflows into client booking systems, handling checkout, secure card capture, and payment confirmation.',
          'Developed a full-stack corporate management panel for a taxi client, integrating booking workflows, driver operations, real-time tracking, RBAC, and backend APIs.',
          'Implemented real-time driver and vehicle tracking using Google Maps with live location updates.',
          'Improved navigation performance by 25% through asset splitting, route-level lazy loading, and optimized bundle delivery.',
          'Contributed to an AI-powered code generation platform using LLM-driven scaffolding and component generation.'
        ]
      },
      {
        company: '100acress',
        role: 'Software Developer',
        period: 'October 2024 - June 2025',
        location: 'India',
        highlights: [
          'Architected a CRM lead-management module with auto-allocation, status tracking, priority management, and automatic reassignment of inactive leads to upper management.',
          'Developed Node.js REST APIs for CRM workflows, implementing lead allocation, status updates, and role-based business logic.',
          'Automated deployments using GitHub Actions, Docker, and AWS, replacing manual releases with a CI/CD pipeline.',
          'Managed application deployment on AWS EC2 with Nginx, configuring production environments and reverse-proxy routing.',
          'Restructured client state using Redux and RTK Query, eliminating stale-cache issues and improving API data synchronization.',
          'Optimized large datasets using virtualization and memoization, reducing application load times by 45%.'
        ]
      },
      {
        company: 'TawglUp',
        role: 'Software Developer Intern',
        period: 'January 2024 - September 2024',
        location: 'India',
        highlights: [
          'Built an interactive interview chat and dashboard using WebSockets for real-time messaging and client updates.',
          'Developed a real-time notification service using WebSockets, implementing backend event handling for server-to-client interview status updates.'
        ]
      }
    ],
    education: [
      {
        degree: 'Bachelor of Computer Science',
        institution: 'J.I.E.T Jodhpur',
        period: '2019 - 2023',
        score: 'SGPA: 8.5/10'
      }
    ],
    projects: [
      {
        name: 'Real Estate SaaS Platform',
        technologies: ['React.js', 'Node.js', 'Express.js', 'MongoDB', 'AWS'],
        highlights: [
          'Built a full-stack property platform with React/Next.js, Node/Express, MongoDB, and dynamic admin management.',
          'Implemented dynamic SEO configuration through an admin panel, managing metadata, slugs, and page settings without code changes.',
          'Improved on-page SEO and load performance with server-side rendering, raising Lighthouse score from 27 to 73.',
          'Deployed on AWS EC2 with Nginx reverse proxy, SSL, and caching, serving 10k+ users.'
        ]
      },
      {
        name: 'E-commerce Platform',
        technologies: ['React.js', 'Node.js', 'Express.js', 'MongoDB'],
        highlights: [
          'Built an e-commerce platform covering products, cart, checkout, and order management.',
          'Developed backend APIs for product management and admin workflows across customer and admin applications.',
          'Implemented payment, delivery tracking, and inventory management with synchronized stock updates.'
        ]
      }
    ]
  };

  if (isMongoConnected()) {
    try {
      let master = await MasterResume.findOne();
      if (!master) {
        master = new MasterResume(defaultMaster);
        await master.save();
      }
      return master;
    } catch (err) {
      console.warn('Mongo MasterResume warning:', err.message);
    }
  }

  return readJsonFile('master_resume', defaultMaster);
}

export async function saveMasterResume(data) {
  if (isMongoConnected()) {
    try {
      let master = await MasterResume.findOne();
      if (!master) {
        master = new MasterResume(data);
      } else {
        Object.assign(master, data);
      }
      await master.save();
    } catch (err) {
      console.warn('Mongo MasterResume save warning:', err.message);
    }
  }
  writeJsonFile('master_resume', data);
  return data;
}

// --- SETTINGS STORAGE ---
export async function getSettings() {
  const defaultSettings = {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'kumarasutosh2014@gmail.com',
    smtpPass: 'pylsdzasipezfrju',
    senderName: 'Ashutosh kumar',
    senderEmail: 'kumarasutosh2014@gmail.com',
    cronTime: '0 9 * * *',
    enableCron: true
  };

  if (isMongoConnected()) {
    try {
      let s = await Settings.findOne();
      if (!s) {
        s = new Settings(defaultSettings);
        await s.save();
      }
      return s;
    } catch (err) {
      console.warn('Mongo Settings warning:', err.message);
    }
  }
  return readJsonFile('settings', defaultSettings);
}

export async function saveSettings(data) {
  if (isMongoConnected()) {
    try {
      let s = await Settings.findOne();
      if (!s) {
        s = new Settings(data);
      } else {
        Object.assign(s, data);
      }
      await s.save();
    } catch (err) {
      console.warn('Mongo Settings save warning:', err.message);
    }
  }
  const current = readJsonFile('settings', {});
  const updated = { ...current, ...data };
  writeJsonFile('settings', updated);
  return updated;
}

// --- LOGS STORAGE ---
export async function createLogEntry(logData) {
  const newLogObj = {
    _id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    ...logData,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  if (isMongoConnected()) {
    try {
      const log = new LogEntry(logData);
      await log.save();
      newLogObj._id = log._id.toString();
    } catch (err) {
      console.warn('Mongo LogEntry save warning:', err.message);
    }
  }

  const logs = readJsonFile('logs', []);
  logs.unshift(newLogObj);
  writeJsonFile('logs', logs.slice(0, 100));
  return newLogObj;
}

export async function getLogs() {
  if (isMongoConnected()) {
    try {
      return await LogEntry.find().sort({ createdAt: -1 }).limit(100);
    } catch (err) {
      console.warn('Mongo LogEntry fetch warning:', err.message);
    }
  }
  return readJsonFile('logs', []);
}
