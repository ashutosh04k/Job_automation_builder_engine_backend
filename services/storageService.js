import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import JobTarget from '../models/JobTarget.js';
import MasterResume from '../models/MasterResume.js';
import Settings from '../models/Settings.js';
import LogEntry from '../models/LogEntry.js';
import User from '../models/User.js';
import EmailTemplate from '../models/EmailTemplate.js';

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

/**
 * Migration helper: Associates orphan records without userId to the primary user
 */
export async function migrateOrphanRecordsToUser(userId) {
  if (!userId) return;
  try {
    const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
    if (isMongoConnected()) {
      await JobTarget.updateMany({ $or: [{ userId: { $exists: false } }, { userId: null }] }, { $set: { userId: userObjId } });
      await MasterResume.updateMany({ $or: [{ userId: { $exists: false } }, { userId: null }] }, { $set: { userId: userObjId } });
      await LogEntry.updateMany({ $or: [{ userId: { $exists: false } }, { userId: null }] }, { $set: { userId: userObjId } });
      await Settings.updateMany({ $or: [{ userId: { $exists: false } }, { userId: null }] }, { $set: { userId: userObjId } });

      // Clean up non-primary tenant resumes that may have inherited owner's defaults
      await MasterResume.updateMany(
        {
          userId: { $ne: userObjId },
          github: 'https://github.com/ashutosh04k'
        },
        {
          $set: {
            phone: '',
            location: '',
            website: '',
            linkedin: '',
            github: ''
          }
        }
      );
    }

    // Also migrate local disk JSON targets
    const localTargets = readJsonFile('job_targets', []);
    let updatedLocal = false;
    for (const t of localTargets) {
      if (!t.userId) {
        t.userId = userId.toString();
        updatedLocal = true;
      }
    }
    if (updatedLocal) {
      writeJsonFile('job_targets', localTargets);
    }
    console.log(`[Multi-Tenant Migration] Assigned orphan records to primary user: ${userId}`);
  } catch (err) {
    console.warn('[Multi-Tenant Migration Warning]:', err.message);
  }
}

// --- JOB TARGETS STORAGE WITH USER-SCOPING & PAGINATION ---
export async function getJobTargets(options = {}, userId = null) {
  const page = parseInt(options.page || 1, 10);
  const limit = parseInt(options.limit || 5, 10);
  const search = (options.search || '').trim().toLowerCase();
  const fetchAll = options.fetchAll === true;

  const localTargets = readJsonFile('job_targets', []);
  let allTargets = [];

  if (isMongoConnected()) {
    try {
      const query = {};
      if (userId) {
        query.userId = userId;
      }

      const mongoTargets = await JobTarget.find(query).sort({ createdAt: -1 });
      const plainMongoTargets = mongoTargets.map(doc => doc.toObject());
      allTargets = plainMongoTargets;
    } catch (err) {
      console.warn('Mongo fetch warning, using disk storage:', err.message);
      allTargets = localTargets;
    }
  } else {
    allTargets = localTargets;
  }

  // Filter by userId if present
  if (userId) {
    allTargets = allTargets.filter(t => t.userId && t.userId.toString() === userId.toString());
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

  if (fetchAll) {
    return allTargets;
  }

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

export async function createJobTarget(data, userId = null) {
  let createdDoc = null;
  const targetId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

  const newTargetObj = {
    _id: targetId,
    userId: userId ? userId.toString() : null,
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
      const doc = new JobTarget({
        ...data,
        userId: userId || undefined
      });
      await doc.save();
      createdDoc = doc.toObject();
      newTargetObj._id = doc._id.toString();
    } catch (err) {
      console.warn('Mongo create warning, saving to disk:', err.message);
    }
  }

  const localTargets = readJsonFile('job_targets', []);
  localTargets.unshift(createdDoc || newTargetObj);
  writeJsonFile('job_targets', localTargets);

  return createdDoc || newTargetObj;
}

export async function updateJobTarget(id, data, userId = null) {
  let updatedDoc = null;

  if (isMongoConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const query = { _id: id };
        if (userId) query.userId = userId;

        const doc = await JobTarget.findOneAndUpdate(
          query,
          { ...data, updatedAt: new Date() },
          { new: true }
        );
        if (doc) updatedDoc = doc.toObject();
      }
    } catch (err) {
      console.warn('Mongo update warning:', err.message);
    }
  }

  let localTargets = readJsonFile('job_targets', []);
  const index = localTargets.findIndex(t => t._id?.toString() === id?.toString());
  if (index !== -1) {
    localTargets[index] = { ...localTargets[index], ...data, updatedAt: new Date().toISOString() };
    writeJsonFile('job_targets', localTargets);
    if (!updatedDoc) updatedDoc = localTargets[index];
  }

  return updatedDoc;
}

export async function deleteJobTarget(id, userId = null) {
  let deletedFromMongo = false;

  if (isMongoConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const query = { _id: id };
        if (userId) query.userId = userId;
        const res = await JobTarget.deleteOne(query);
        deletedFromMongo = res.deletedCount > 0;
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

export async function getJobTargetById(id, userId = null) {
  if (isMongoConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const query = { _id: id };
        if (userId) query.userId = userId;
        const doc = await JobTarget.findOne(query);
        if (doc) return doc;
      }
    } catch (err) {
      console.warn('Mongo findById warning:', err.message);
    }
  }
  const localTargets = readJsonFile('job_targets', []);
  return localTargets.find(t => t._id?.toString() === id?.toString()) || null;
}

// --- MASTER RESUME STORAGE WITH USER-SCOPING ---
export async function getMasterResume(userId = null) {
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
    experience: [],
    education: [],
    projects: []
  };

  if (isMongoConnected()) {
    try {
      if (userId) {
        let master = await MasterResume.findOne({ userId });
        
        // If user has no resume document yet, create a clean one for them
        if (!master) {
          const user = await User.findById(userId);
          master = new MasterResume({
            userId,
            fullName: user?.name || '',
            email: user?.email || '',
            phone: '',
            location: '',
            website: '',
            linkedin: '',
            github: '',
            title: 'Software Developer',
            summary: '',
            skills: []
          });
          await master.save();
        }

        return master.toObject();
      }

      // Legacy fallback if no userId
      let master = await MasterResume.findOne({});
      if (master) return master.toObject();
    } catch (err) {
      console.warn('Mongo MasterResume warning:', err.message);
    }
  }

  return readJsonFile('master_resume', defaultMaster);
}

export async function saveMasterResume(data, userId = null) {
  // Strip immutable fields from incoming update payload
  const { _id, userId: ignoredUserId, __v, createdAt, updatedAt, ...cleanData } = data || {};

  if (isMongoConnected()) {
    try {
      const query = userId ? { userId } : {};
      let master = await MasterResume.findOne(query);
      if (!master) {
        master = new MasterResume({ ...cleanData, userId: userId || undefined });
      } else {
        Object.assign(master, cleanData);
      }
      await master.save();
      return master.toObject();
    } catch (err) {
      console.warn('Mongo MasterResume save warning:', err.message);
    }
  }
  writeJsonFile('master_resume', data);
  return data;
}

// --- SETTINGS STORAGE WITH USER-SCOPING ---
export async function getSettings(userId = null) {
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
      const query = userId ? { userId } : {};
      let s = await Settings.findOne(query);
      if (!s) {
        s = new Settings({ ...defaultSettings, userId: userId || undefined });
        await s.save();
      }
      return s;
    } catch (err) {
      console.warn('Mongo Settings warning:', err.message);
    }
  }
  return readJsonFile('settings', defaultSettings);
}

export async function saveSettings(data, userId = null) {
  if (isMongoConnected()) {
    try {
      const query = userId ? { userId } : {};
      let s = await Settings.findOne(query);
      if (!s) {
        s = new Settings({ ...data, userId: userId || undefined });
      } else {
        Object.assign(s, data);
      }
      await s.save();
      return s;
    } catch (err) {
      console.warn('Mongo Settings save warning:', err.message);
    }
  }
  const current = readJsonFile('settings', {});
  const updated = { ...current, ...data };
  writeJsonFile('settings', updated);
  return updated;
}

// --- LOGS STORAGE WITH USER-SCOPING ---
export async function createLogEntry(logData, userId = null) {
  const newLogObj = {
    _id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    userId: userId ? userId.toString() : null,
    ...logData,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  if (isMongoConnected()) {
    try {
      const log = new LogEntry({
        ...logData,
        userId: userId || undefined
      });
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

export async function getLogs(userId = null) {
  if (isMongoConnected()) {
    try {
      const query = userId ? { userId } : {};
      return await LogEntry.find(query).sort({ createdAt: -1 }).limit(100);
    } catch (err) {
      console.warn('Mongo LogEntry fetch warning:', err.message);
    }
  }
  const logs = readJsonFile('logs', []);
  if (userId) {
    return logs.filter(l => l.userId && l.userId.toString() === userId.toString());
  }
  return logs;
}

// --- DYNAMIC PER-USER EMAIL TEMPLATE STORAGE ---
export async function getEmailTemplate(userId = null) {
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

  if (isMongoConnected() && userId) {
    try {
      let tpl = await EmailTemplate.findOne({ userId });
      if (!tpl) {
        tpl = new EmailTemplate({
          userId,
          subject: defaultSubject,
          body: defaultBody
        });
        await tpl.save();
      } else {
        let changed = false;
        if (!tpl.subject || tpl.subject.trim() === 'Full Stack Developer (3+ Years) | Open to Frontend / Full Stack Roles' || !tpl.subject.includes('{{role}}')) {
          tpl.subject = defaultSubject;
          changed = true;
        }
        if (tpl.body && tpl.body.includes('I\'m currently exploring Frontend and Full Stack Developer opportunities.')) {
          tpl.body = tpl.body.replace('I\'m currently exploring Frontend and Full Stack Developer opportunities.', 'I\'m currently exploring {{role}} opportunities.');
          changed = true;
        }
        if (changed) {
          await tpl.save();
        }
      }
      return tpl.toObject();
    } catch (err) {
      console.warn('Mongo EmailTemplate fetch warning:', err.message);
    }
  }

  return { subject: defaultSubject, body: defaultBody };
}

export async function saveEmailTemplate(data, userId = null) {
  const { subject, body } = data || {};
  if (isMongoConnected() && userId) {
    try {
      let tpl = await EmailTemplate.findOne({ userId });
      if (!tpl) {
        tpl = new EmailTemplate({ userId, subject, body });
      } else {
        if (subject !== undefined) tpl.subject = subject;
        if (body !== undefined) tpl.body = body;
      }
      await tpl.save();
      return tpl.toObject();
    } catch (err) {
      console.warn('Mongo EmailTemplate save warning:', err.message);
    }
  }
  return { subject, body };
}
