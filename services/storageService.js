import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import JobTarget from '../models/JobTarget.js';
import MasterResume from '../models/MasterResume.js';
import Settings from '../models/Settings.js';
import LogEntry from '../models/LogEntry.js';
import User from '../models/User.js';
import EmailTemplate from '../models/EmailTemplate.js';
import DiscoveredJob from '../models/DiscoveredJob.js';
import { extractSkills } from '../shared/keywords.js';
import { cleanCompanyName } from '../shared/jobMeta.js';
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

  // atsScore is stored when a target is created/rescored (services/atsService.js).
  // Missing means "not scored yet" — shown as "—", never a made-up number.

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

  const atsScore = typeof data.atsScore === 'number' ? data.atsScore : null;

  const newTargetObj = {
    _id: targetId,
    userId: userId ? userId.toString() : null,
    email: data.email,
    jobDescription: data.jobDescription || '',
    targetRole: data.targetRole || 'Software Engineer',
    companyName: data.companyName || 'Target Company',
    cronSchedule: '0 9 * * *',
    isActive: true,
    status: 'active',
    atsScore,
    totalSentCount: 0,
    lastSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isMongoConnected()) {
    try {
      const doc = new JobTarget({
        ...data,
        atsScore,
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
  return localTargets.find(t =>
    t._id?.toString() === id?.toString() &&
    (!userId || t.userId?.toString() === userId.toString())
  ) || null;
}

// --- MASTER RESUME STORAGE WITH USER-SCOPING ---
export async function getMasterResume(userId = null) {
  const defaultMaster = {
    fullName: '', email: '', phone: '', location: '', title: '', summary: '',
    website: '', resumeUrl: '', linkedin: '', github: '',
    skills: [], experience: [], education: [], projects: []
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
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: false,
    // Credentials are never stored as code defaults; per-user values come from Settings.
    smtpUser: '',
    smtpPass: '',
    senderName: '',
    senderEmail: '',
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

export async function getLogs(options = {}, userId = null) {
  let opts = options;
  let actualUserId = userId;
  if (typeof options === 'string' || (options && options._bsontype)) {
    actualUserId = options;
    opts = {};
  }
  const page = parseInt(opts.page || 1, 10);
  const limit = parseInt(opts.limit || 10, 10);
  const search = (opts.search || '').trim().toLowerCase();
  const status = (opts.status || '').trim().toLowerCase();
  const fetchAll = opts.fetchAll === true;

  if (isMongoConnected()) {
    try {
      const query = {};
      if (actualUserId) query.userId = actualUserId;
      if (status && status !== 'all') query.status = status;
      if (search) {
        query.$or = [
          { recipientEmail: { $regex: search, $options: 'i' } },
          { details: { $regex: search, $options: 'i' } },
          { jobDescriptionSnippet: { $regex: search, $options: 'i' } },
          { triggeredBy: { $regex: search, $options: 'i' } }
        ];
      }

      if (fetchAll) {
        const allDocs = await LogEntry.find(query).sort({ createdAt: -1 });
        return allDocs.map(d => (d.toObject ? d.toObject() : d));
      }

      const total = await LogEntry.countDocuments(query);
      const totalPages = Math.ceil(total / limit) || 1;
      const currentPage = Math.min(Math.max(1, page), totalPages);
      const skip = (currentPage - 1) * limit;

      const docs = await LogEntry.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return {
        data: docs.map(d => (d.toObject ? d.toObject() : d)),
        total,
        page: currentPage,
        limit,
        totalPages,
        hasPrevPage: currentPage > 1,
        hasNextPage: currentPage < totalPages
      };
    } catch (err) {
      console.warn('Mongo LogEntry fetch warning, falling back to disk:', err.message);
    }
  }

  // Disk storage fallback
  let logs = readJsonFile('logs', []);
  if (actualUserId) {
    logs = logs.filter(l => l.userId && l.userId.toString() === actualUserId.toString());
  }

  if (status && status !== 'all') {
    logs = logs.filter(l => (l.status || '').toLowerCase() === status);
  }

  if (search) {
    logs = logs.filter(l =>
      (l.recipientEmail || '').toLowerCase().includes(search) ||
      (l.details || '').toLowerCase().includes(search) ||
      (l.jobDescriptionSnippet || '').toLowerCase().includes(search) ||
      (l.triggeredBy || '').toLowerCase().includes(search)
    );
  }

  logs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (fetchAll) {
    return logs;
  }

  const total = logs.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * limit;
  const paginatedData = logs.slice(startIndex, startIndex + limit);

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

// --- DYNAMIC PER-USER EMAIL TEMPLATE STORAGE ---
export async function getEmailTemplate(userId = null) {
  const defaultSubject = 'Application for {{role}} at {{company}} || (3+ Years) | Open to {{role}} Roles';
  const defaultBody = `Hi Sir/Maam,

I hope you're doing well.

My name is {{name}}, and I'm a Full Stack Developer with over 3 years of experience building and shipping production applications. I came across your profile and wanted to reach out directly.

My core stack includes React.js, Next.js, TypeScript, Node.js, Express.js, and MongoDB, supported by hands-on experience with Redux, REST APIs, WebSockets, Tailwind CSS, Material UI, AWS, Docker, and CI/CD pipelines. I have delivered applications across SaaS, real estate, logistics, and CRM platforms, with a consistent focus on performance and clean, maintainable architecture.

I'm currently exploring {{role}} opportunities. I've attached my resume for your reference and would welcome the chance to connect if there is a suitable opening on your team, or if you know of a relevant role elsewhere.

LinkedIn: {{linkedin}}
GitHub: {{github}}
Portfolio: {{portfolio}}
Resume: {{resume}}

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
        // Only upgrade if subject is the legacy static string or empty
        if (!tpl.subject || tpl.subject.trim() === 'Full Stack Developer (3+ Years) | Open to Frontend / Full Stack Roles') {
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

// --- LINKEDIN DISCOVERED JOBS PIPELINE STORAGE ---

export async function getDiscoveredJobs(options = {}, userId = null) {
  const page = parseInt(options.page || 1, 10);
  const limit = parseInt(options.limit || 10, 10);
  const search = (options.search || '').trim().toLowerCase();
  const applyType = (options.applyType || 'all').trim().toLowerCase();
  const status = (options.status || 'all').trim().toLowerCase();
  const fetchAll = options.fetchAll === true;

  if (isMongoConnected()) {
    try {
      const baseQuery = {};
      if (userId) baseQuery.userId = userId;

      const [allCount, easyCount, externalCount] = await Promise.all([
        DiscoveredJob.countDocuments(baseQuery),
        DiscoveredJob.countDocuments({ ...baseQuery, applyType: 'easy_apply' }),
        DiscoveredJob.countDocuments({ ...baseQuery, applyType: 'external' })
      ]);

      const filterQuery = { ...baseQuery };
      if (applyType && applyType !== 'all') {
        filterQuery.applyType = applyType;
      }
      if (status && status !== 'all') {
        filterQuery.status = status;
      }
      if (search) {
        filterQuery.$or = [
          { title: { $regex: search, $options: 'i' } },
          { company: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } },
          { jobDescription: { $regex: search, $options: 'i' } }
        ];
      }

      if (fetchAll) {
        const allDocs = await DiscoveredJob.find(filterQuery).sort({ createdAt: -1 });
        return {
          data: allDocs.map(d => (d.toObject ? d.toObject() : d)),
          counts: { all: allCount, easyApply: easyCount, external: externalCount }
        };
      }

      const total = await DiscoveredJob.countDocuments(filterQuery);
      const totalPages = Math.ceil(total / limit) || 1;
      const currentPage = Math.min(Math.max(1, page), totalPages);
      const skip = (currentPage - 1) * limit;

      const docs = await DiscoveredJob.find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return {
        data: docs.map(d => (d.toObject ? d.toObject() : d)),
        total,
        page: currentPage,
        limit,
        totalPages,
        hasPrevPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
        counts: { all: allCount, easyApply: easyCount, external: externalCount }
      };
    } catch (err) {
      console.warn('Mongo DiscoveredJob fetch warning, falling back to disk:', err.message);
    }
  }

  // Disk fallback
  let all = readJsonFile('discovered_jobs', []);
  if (userId) {
    all = all.filter(j => j.userId && j.userId.toString() === userId.toString());
  }

  const allCount = all.length;
  const easyCount = all.filter(j => j.applyType === 'easy_apply').length;
  const externalCount = all.filter(j => j.applyType === 'external').length;

  let filtered = [...all];
  if (applyType && applyType !== 'all') {
    filtered = filtered.filter(j => j.applyType === applyType);
  }
  if (status && status !== 'all') {
    filtered = filtered.filter(j => j.status === status);
  }
  if (search) {
    filtered = filtered.filter(j =>
      (j.title || '').toLowerCase().includes(search) ||
      (j.company || '').toLowerCase().includes(search) ||
      (j.location || '').toLowerCase().includes(search) ||
      (j.jobDescription || '').toLowerCase().includes(search)
    );
  }

  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (fetchAll) {
    return { data: filtered, counts: { all: allCount, easyApply: easyCount, external: externalCount } };
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * limit;
  const paginatedData = filtered.slice(startIndex, startIndex + limit);

  return {
    data: paginatedData,
    total,
    page: currentPage,
    limit,
    totalPages,
    hasPrevPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
    counts: { all: allCount, easyApply: easyCount, external: externalCount }
  };
}

export async function saveDiscoveredJobsBatch(jobs = [], userId = null) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { insertedCount: 0, updatedCount: 0, totalCount: 0, easyApplyCount: 0, externalCount: 0 };
  }

  const processed = jobs.map(raw => {
    const isEasy = Boolean(raw.isEasyApply || raw.applyType === 'easy_apply');
    const roleTitle = (raw.title || raw.jobTitle || 'Software Developer').trim();
    const company = cleanCompanyName(raw.company || raw.companyName || '') || 'Unknown Company';
    const jd = raw.jobDescription || '';
    const atsScore = typeof raw.atsScore === 'number' ? raw.atsScore : null;

    return {
      userId: userId ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId) : undefined,
      jobId: String(raw.jobId || raw.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).trim(),
      title: roleTitle,
      company: company,
      location: (raw.location || '').trim(),
      jobUrl: raw.jobUrl || raw.url || `https://www.linkedin.com/jobs/view/${raw.jobId}/`,
      applyType: isEasy ? 'easy_apply' : 'external',
      isEasyApply: isEasy,
      postedTime: raw.postedTime || '',
      jobDescription: jd,
      atsScore,
      status: raw.status || 'new',
      updatedAt: new Date()
    };
  });

  let insertedCount = 0;
  let updatedCount = 0;

  if (isMongoConnected()) {
    try {
      for (const item of processed) {
        const filter = { jobId: item.jobId };
        if (userId) filter.userId = userId;

        const res = await DiscoveredJob.updateOne(
          filter,
          { $set: item, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );

        if (res.upsertedCount > 0) insertedCount++;
        else updatedCount++;
      }
    } catch (err) {
      console.warn('Mongo batch upsert warning:', err.message);
    }
  }

  // Also maintain disk store
  const local = readJsonFile('discovered_jobs', []);
  for (const item of processed) {
    const idx = local.findIndex(j => j.jobId === item.jobId && (!userId || String(j.userId) === String(userId)));
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...item };
    } else {
      local.unshift({
        _id: 'dj_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        createdAt: new Date().toISOString(),
        ...item
      });
    }
  }
  writeJsonFile('discovered_jobs', local.slice(0, 1000));

  const easyApplyCount = processed.filter(j => j.applyType === 'easy_apply').length;
  const externalCount = processed.length - easyApplyCount;

  return {
    insertedCount,
    updatedCount,
    totalCount: processed.length,
    easyApplyCount,
    externalCount
  };
}

export async function updateDiscoveredJob(id, updates = {}, userId = null) {
  if (isMongoConnected()) {
    try {
      const query = { _id: id };
      if (userId) query.userId = userId;
      const doc = await DiscoveredJob.findOneAndUpdate(query, { ...updates, updatedAt: new Date() }, { new: true });
      if (doc) return doc.toObject();
    } catch (err) {
      console.warn('Mongo DiscoveredJob update warning:', err.message);
    }
  }
  const local = readJsonFile('discovered_jobs', []);
  const idx = local.findIndex(j => (j._id === id || j.id === id) && (!userId || String(j.userId) === String(userId)));
  if (idx >= 0) {
    local[idx] = { ...local[idx], ...updates, updatedAt: new Date().toISOString() };
    writeJsonFile('discovered_jobs', local);
    return local[idx];
  }
  return null;
}

export async function deleteDiscoveredJob(id, userId = null) {
  if (isMongoConnected()) {
    try {
      const query = { _id: id };
      if (userId) query.userId = userId;
      await DiscoveredJob.deleteOne(query);
    } catch (err) {
      console.warn('Mongo DiscoveredJob delete warning:', err.message);
    }
  }
  const local = readJsonFile('discovered_jobs', []);
  const filtered = local.filter(j => !((j._id === id || j.id === id) && (!userId || String(j.userId) === String(userId))));
  writeJsonFile('discovered_jobs', filtered);
  return true;
}
