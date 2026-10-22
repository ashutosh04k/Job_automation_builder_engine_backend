import cron from 'node-cron';
import {
  getJobTargets,
  getMasterResume,
  getEmailTemplate,
  getSettings,
  createLogEntry,
  updateJobTarget
} from './storageService.js';
import { generateTailoredResume } from './resumeTailorService.js';
import { sendTailoredResumeEmail } from './emailService.js';
import { resolveRole, resolveCompany } from '../shared/jobMeta.js';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *';
const CRON_TZ = process.env.CRON_TZ || 'Asia/Kolkata';
const DAILY_SEND_LIMIT = Number(process.env.DAILY_SEND_LIMIT) || 15;   // per user, per run
const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS ?? 20000);       // gap between emails

let cronTask = null;
let isRunning = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send one target. Used by the daily run and by the manual "send now" button.
 * After a successful send the target is marked completed so the cron never
 * sends it again. Manual sends always go through.
 */
export async function processTargetExecution(target, triggeredBy = 'cron') {
  const userId = target.userId || null;
  try {
    const masterResume = await getMasterResume(userId);
    const emailTemplate = await getEmailTemplate(userId);

    const role = resolveRole(target.targetRole, target.jobDescription, masterResume?.title || 'Software Developer');
    const company = resolveCompany(target.companyName, target.jobDescription);

    const tailoredData = generateTailoredResume(
      masterResume, target.jobDescription, role, emailTemplate, company || 'your company'
    );
    // The PDF is tailored from these fields; without them it ignores the JD.
    tailoredData.targetRole = role;
    tailoredData.jobDescription = target.jobDescription || '';
    tailoredData.companyName = company;

    const apiBase = process.env.API_BASE_URL || '';
    let html = tailoredData.htmlTemplate || '';
    if (apiBase) {
      const pixel = `<img src="${apiBase}/api/track/open/${target._id}.png" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />`;
      html = html.includes('</body>') ? html.replace('</body>', `${pixel}</body>`) : html + pixel;
    }

    const result = await sendTailoredResumeEmail({
      to: target.email,
      subject: tailoredData.subjectLine,
      htmlContent: html,
      tailoredData,
      userId
    });

    const sentOk = result.success && !result.simulated;
    await updateJobTarget(target._id, {
      ...(sentOk ? {
        lastSentAt: new Date().toISOString(),
        totalSentCount: (target.totalSentCount || 0) + 1,
        status: 'completed'
      } : { status: 'error' })
    }, userId);

    await createLogEntry({
      targetId: target._id,
      recipientEmail: target.email,
      jobDescriptionSnippet: (target.jobDescription || '').substring(0, 120),
      status: result.success ? (result.simulated ? 'simulated' : 'success') : 'failed',
      triggeredBy,
      details: result.message
    }, userId);

    return {
      targetId: target._id,
      recipient: target.email,
      result,
      tailoredSummary: tailoredData.tailoredSummary,
      matchedKeywords: tailoredData.matchedKeywords
    };
  } catch (err) {
    console.error(`[Cron] Target ${target._id} failed:`, err.message);
    await updateJobTarget(target._id, { status: 'error' }, userId).catch(() => {});
    await createLogEntry({
      targetId: target._id,
      recipientEmail: target.email,
      jobDescriptionSnippet: (target.jobDescription || '').substring(0, 120),
      status: 'failed',
      triggeredBy,
      details: err.message
    }, userId);
    return { targetId: target._id, recipient: target.email, error: err.message };
  }
}

/** Targets the scheduler may send: active, not paused/completed, never sent. */
export function isEligibleForAutoSend(t) {
  return Boolean(t.isActive)
    && !['paused', 'completed'].includes(t.status)
    && !t.lastSentAt
    && !(t.totalSentCount > 0);
}

/**
 * Daily run. Sends each eligible target once, oldest first, at most
 * DAILY_SEND_LIMIT per user, respecting each user's enableCron setting.
 * Pass onlyUserId to run for a single user (manual trigger by a non-admin).
 */
export async function executeDaily9AMCronJob(triggeredBy = 'cron', { onlyUserId = null } = {}) {
  if (isRunning) {
    return { processedCount: 0, skipped: 'A run is already in progress.', timestamp: new Date(), results: [] };
  }
  isRunning = true;
  try {
    const all = onlyUserId
      ? await getJobTargets({ fetchAll: true }, onlyUserId)
      : await getJobTargets({ fetchAll: true });

    const byUser = new Map();
    all.filter(isEligibleForAutoSend)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .forEach((t) => {
        const key = String(t.userId || 'none');
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key).push(t);
      });

    const results = [];
    let first = true;
    for (const [key, targets] of byUser) {
      const userId = key === 'none' ? null : key;
      const settings = await getSettings(userId).catch(() => null);
      if (settings && settings.enableCron === false) continue;

      for (const target of targets.slice(0, DAILY_SEND_LIMIT)) {
        if (!first && SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
        first = false;
        results.push(await processTargetExecution(target, triggeredBy));
      }
    }

    console.log(`[Cron] ${triggeredBy} run sent ${results.length} email(s).`);
    return { processedCount: results.length, timestamp: new Date(), results };
  } finally {
    isRunning = false;
  }
}

export function initCronService() {
  if (process.env.ENABLE_CRON === 'false') {
    console.log('[Cron] Disabled via ENABLE_CRON=false');
    return null;
  }
  if (cronTask) cronTask.stop();
  cronTask = cron.schedule(CRON_SCHEDULE, () => {
    executeDaily9AMCronJob('cron').catch((e) => console.error('[Cron] Run failed:', e));
  }, { timezone: CRON_TZ });
  console.log(`[Cron] Scheduled "${CRON_SCHEDULE}" (${CRON_TZ}), limit ${DAILY_SEND_LIMIT}/user/day`);
  return cronTask;
}