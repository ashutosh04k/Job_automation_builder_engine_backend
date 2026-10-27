import { generateResumePDFWithMeta } from './pdfService.js';
import { scoreResume } from '../shared/atsScorer.js';
import { getMasterResume, getJobTargets, updateJobTarget } from './storageService.js';
import { resolveRole } from '../shared/jobMeta.js';

/**
 * Build the tailored resume for this JD and score the text it actually prints.
 * Returns { report, pdf } where pdf is the same buffer a download would give.
 * Throws if the master resume is incomplete (callers turn that into a 400).
 */
export async function tailorAndScore(masterResume, { jobDescription = '', targetRole = '', companyName = '' } = {}) {
  const result = await generateResumePDFWithMeta(masterResume, { jobDescription, targetRole, companyName });
  const m = result.content.m;
  const report = scoreResume({
    jobDescription,
    targetRole,
    companyName,
    resume: result.rendered,
    profile: { email: m.email, phone: m.phone, linkedin: m.linkedin, experience: m.experience },
    pdf: { pages: result.pages, bodyPt: result.bodyPt, trimmed: result.trimmed }
  });
  // What the tailored PDF will show under the name (for previews in the UI/extension).
  if (report.score !== null) report.headline = result.rendered.headline;
  const changes = { ...result.content.changes, trimmed: result.trimmed, pages: result.pages, bodyPt: result.bodyPt };
  return { report, pdf: result.buffer, changes };
}

/** Score only; returns null instead of throwing (for list views / background jobs). */
export async function safeScore(masterResume, job) {
  if (!String(job?.jobDescription || '').trim() && !String(job?.targetRole || '').trim()) return null;
  try {
    return (await tailorAndScore(masterResume, job)).report;
  } catch {
    return null;
  }
}

/** Recompute and store the score of every target a user owns (e.g. after editing the master resume). */
export async function rescoreUserTargets(userId) {
  const master = await getMasterResume(userId);
  const targets = await getJobTargets({ fetchAll: true }, userId);
  let updated = 0;
  for (const t of targets) {
    const report = await safeScore(master, {
      jobDescription: t.jobDescription,
      targetRole: resolveRole(t.targetRole, t.jobDescription, master?.title || '')
    });
    const atsScore = report?.score ?? null;
    if (atsScore !== t.atsScore) {
      await updateJobTarget(t._id, { atsScore }, userId);
      updated += 1;
    }
  }
  return { total: targets.length, updated };
}
