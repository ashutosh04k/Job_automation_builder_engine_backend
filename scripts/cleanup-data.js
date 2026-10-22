/**
 * One-off production data cleanup. Dry run by default.
 *
 *   node scripts/cleanup-data.js            # report only
 *   node scripts/cleanup-data.js --apply    # write changes (MongoDB if MONGO_URI connects, plus data_store/*.json)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import JobTarget from '../models/JobTarget.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import { cleanCompanyName } from '../shared/jobMeta.js';

const APPLY = process.argv.includes('--apply');
const TEST_COMPANIES = new Set(['tech corp', 'sdfb', 'testing', 'test']);
const DATA_DIR = path.resolve(process.cwd(), 'data_store');

function plan(targets, ownEmails) {
  const del = [], updates = [];
  const seen = new Map();
  const sorted = [...targets].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  for (const t of sorted) {
    const id = String(t._id);
    const company = (t.companyName || '').trim();
    const email = (t.email || '').trim().toLowerCase();

    const owner = String(t.userId || 'none');

    if (TEST_COMPANIES.has(company.toLowerCase()) || ownEmails.has(email)) {
      del.push({ id, why: `test target (${company} -> ${email})` });
      continue;
    }

    const set = {};
    const cleaned = cleanCompanyName(company);
    if (cleaned && cleaned !== company) set.companyName = cleaned;
    if ((t.totalSentCount > 0 || t.lastSentAt) && t.status !== 'completed') set.status = 'completed';

    const key = `${owner}|${email}`;
    if (seen.has(key)) {
      if (t.isActive) set.isActive = false;
      if (!set.status && t.status !== 'completed') set.status = 'paused';
    } else {
      seen.set(key, id);
    }
    if (Object.keys(set).length) updates.push({ id, set, label: `${company} <${email}>` });
  }
  return { del, updates };
}

function report(source, { del, updates }) {
  console.log(`\n=== ${source} ===`);
  del.forEach((d) => console.log(`  DELETE ${d.id}  ${d.why}`));
  updates.forEach((u) => console.log(`  UPDATE ${u.id}  ${u.label}  ${JSON.stringify(u.set)}`));
  console.log(`  -> ${del.length} delete(s), ${updates.length} update(s)`);
}

async function cleanMongo() {
  if (!process.env.MONGO_URI) return console.log('\n(MONGO_URI not set — skipping MongoDB)');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  } catch (e) {
    return console.log(`\n(MongoDB not reachable — skipping: ${e.message})`);
  }
  const users = await User.find({}, { email: 1 }).lean();
  const ownEmails = new Set(users.map((u) => (u.email || '').toLowerCase()).filter(Boolean));
  const targets = await JobTarget.find({}).lean();
  const p = plan(targets, ownEmails);
  report(`MongoDB: ${targets.length} targets`, p);

  const withPass = await Settings.countDocuments({ smtpPass: { $nin: ['', null] } });
  console.log(`  -> ${withPass} settings doc(s) with a stored smtpPass will be cleared`);

  if (APPLY) {
    if (p.del.length) await JobTarget.deleteMany({ _id: { $in: p.del.map((d) => d.id) } });
    for (const u of p.updates) await JobTarget.updateOne({ _id: u.id }, { $set: u.set });
    await Settings.updateMany({}, { $set: { smtpPass: '' } });
    console.log('  ✅ MongoDB updated');
  }
  await mongoose.disconnect();
}

function cleanJson() {
  const file = path.join(DATA_DIR, 'job_targets.json');
  if (!fs.existsSync(file)) return console.log('\n(no data_store/job_targets.json)');
  const targets = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ownEmails = new Set([(process.env.PRIMARY_USER_EMAIL || '').toLowerCase()].filter(Boolean));
  const p = plan(targets, ownEmails);
  report(`JSON store: ${targets.length} targets`, p);

  if (APPLY) {
    const delIds = new Set(p.del.map((d) => d.id));
    const upd = new Map(p.updates.map((u) => [u.id, u.set]));
    const next = targets.filter((t) => !delIds.has(String(t._id))).map((t) => ({ ...t, ...(upd.get(String(t._id)) || {}) }));
    fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
    fs.writeFileSync(file, JSON.stringify(next, null, 2));

    const sFile = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(sFile)) {
      const s = JSON.parse(fs.readFileSync(sFile, 'utf8'));
      if (s.smtpPass) { s.smtpPass = ''; fs.writeFileSync(sFile, JSON.stringify(s, null, 2)); }
    }
    console.log('  ✅ JSON store updated (backup written next to it)');
  }
}

console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)');
cleanJson();
await cleanMongo();
