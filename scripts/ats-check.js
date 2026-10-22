/**
 * Score your master resume against a job description from the command line.
 *
 *   npm run ats:check -- path/to/jd.txt "Frontend Developer"
 *   npm run ats:check -- path/to/jd.txt "Frontend Developer" you@example.com
 *
 * Uses MongoDB when MONGO_URI connects (resume of the given email, or PRIMARY_USER_EMAIL),
 * otherwise data_store/master_resume.json. Writes the tailored PDF to ./ats-check.pdf.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import MasterResume from '../models/MasterResume.js';
import { tailorAndScore } from '../services/atsService.js';

const [jdPath, role = '', emailArg] = process.argv.slice(2);
if (!jdPath || !fs.existsSync(jdPath)) {
  console.error('Usage: npm run ats:check -- <jd.txt> "<Target Role>" [email]');
  process.exit(1);
}
const jobDescription = fs.readFileSync(jdPath, 'utf8');

async function loadMaster() {
  const email = (emailArg || process.env.PRIMARY_USER_EMAIL || '').toLowerCase();
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
      const user = email ? await User.findOne({ email }) : null;
      const doc = user ? await MasterResume.findOne({ userId: user._id }).lean() : null;
      if (doc) return { master: doc, source: `MongoDB (${email})` };
    } catch (e) {
      console.warn(`MongoDB unavailable (${e.message}); falling back to JSON store.`);
    }
  }
  const raw = JSON.parse(fs.readFileSync('data_store/master_resume.json', 'utf8'));
  return { master: Array.isArray(raw) ? raw[0] : raw, source: 'data_store/master_resume.json' };
}

const { master, source } = await loadMaster();
const { report, pdf } = await tailorAndScore(master, { jobDescription, targetRole: role });
fs.writeFileSync('ats-check.pdf', pdf);

console.log(`\nResume source: ${source}`);
if (report.score === null) {
  console.log(report.reason);
} else {
  console.log(`\nATS MATCH: ${report.score}/100 (${report.label}, confidence: ${report.confidence})`);
  console.log(`Headline : ${report.headline}\n`);
  report.breakdown.forEach((b) => console.log(`  ${b.label.padEnd(20)} ${String(b.score ?? '—').padStart(4)}  (${b.weight}%)  ${b.detail}`));
  const k = report.keywords;
  console.log(`\n  Required on resume : ${k.required.matched.join(', ') || '—'}`);
  console.log(`  Required MISSING   : ${k.required.missing.join(', ') || '—'}`);
  console.log(`  Nice-to-have missing: ${k.preferred.missing.join(', ') || '—'}`);
  console.log('\nSuggestions:');
  report.suggestions.forEach((s) => console.log(`  - ${s}`));
}
console.log('\nTailored PDF written to ./ats-check.pdf');
await mongoose.disconnect().catch(() => {});
