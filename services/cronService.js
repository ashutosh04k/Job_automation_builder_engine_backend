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
// Optional single follow-up: resend a target N days after the first email (0 = never resend).
const FOLLOW_UP_AFTER_DAYS = Math.max(0, Number(process.env.FOLLOW_UP_AFTER_DAYS) || 0);
const MAX_SENDS_PER_TARGET = FOLLOW_UP_AFTER_DAYS > 0 ? Math.max(2, Number(process.env.MAX_SENDS_PER_TARGET) || 2) : 1;
const DAY_MS = 24 * 60 * 60 * 1000;

let cronTask = null;
let isRunning = false;
const serverStartedAt = new Date();
let lastRun = null; // { triggeredBy, startedAt, finishedAt, queued, sent, failed, counts }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send one target. Used by the daily run and by the manual "send now" button.
 * After a successful send the count goes up; once a target has had all its
 * emails it is marked completed and the daily run skips it. Manual sends always go through.
 */
export async function processTargetExecution(target, triggeredBy = 'cron', { followUp = false } = {}) {
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

    const apiBase = (process.env.API_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://resume-backend-api-pvx4.onrender.com').replace(/\/+$/, '');
    let html = tailoredData.htmlTemplate || '';
    if (apiBase && target?._id) {
      const pixel = `<img src="${apiBase}/api/track/open/${target._id}.png" width="1" height="1" border="0" alt="" style="width:1px!important;height:1px!important;min-width:1px;min-height:1px;border:0;outline:none;display:block;" />`;
      html = html.includes('</body>') ? html.replace('</body>', `${pixel}</body>`) : html + pixel;

      // Wrap external links in click tracking so clicking portfolio/LinkedIn also records the email open
      html = html.replace(/<a\s+([^>]*?)href="((?!mailto:)[^"]+)"([^>]*)>/gi, (match, prefix, url, suffix) => {
        if (url.includes('/api/track/click/')) return match;
        const trackedUrl = `${apiBase}/api/track/click/${target._id}?url=${encodeURIComponent(url)}`;
        return `<a ${prefix}href="${trackedUrl}"${suffix}>`;
      });
    }

    const result = await sendTailoredResumeEmail({
      to: target.email,
      subject: followUp ? `Following up: ${tailoredData.subjectLine}` : tailoredData.subjectLine,
      htmlContent: html,
      tailoredData,
      userId
    });

    const sentOk = result.success && !result.simulated;
    const sentCount = sentCountOf(target) + 1;
    await updateJobTarget(target._id, {
      ...(sentOk ? {
        lastSentAt: new Date().toISOString(),
        totalSentCount: sentCount,
        // 'completed' once it has had all its emails (1, or 2 with follow-ups on)
        status: sentCount >= MAX_SENDS_PER_TARGET ? 'completed' : 'active'
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

const sentCountOf = (t) => Number(t.totalSentCount) || (t.lastSentAt ? 1 : 0);

/**
 * Why the scheduler would or would not email this target today:
 *   'new'            never emailed -> send
 *   'followUp'       emailed once, follow-up is due -> send
 *   'alreadySent'    has had all its emails
 *   'waitingFollowUp' follow-up not due yet
 *   'paused' | 'inactive' | 'noEmail'
 */
export function autoSendStatus(t, now = Date.now()) {
  if (!t.isActive) return 'inactive';
  if (t.status === 'paused') return 'paused';
  if (!String(t.email || '').trim()) return 'noEmail';
  const sent = sentCountOf(t);
  if (sent === 0) return 'new';
  if (sent >= MAX_SENDS_PER_TARGET) return 'alreadySent';
  const due = t.lastSentAt && now - new Date(t.lastSentAt).getTime() >= FOLLOW_UP_AFTER_DAYS * DAY_MS;
  return due ? 'followUp' : 'waitingFollowUp';
}

/** Targets the scheduler may send today. */
export function isEligibleForAutoSend(t, now = Date.now()) {
  return ['new', 'followUp'].includes(autoSendStatus(t, now));
}

/**
 * Who would be emailed now, and why everyone else is skipped.
 * Never-emailed targets go first (oldest first), then due follow-ups; at most
 * DAILY_SEND_LIMIT per user; users with daily emails off in Settings are skipped.
 */
export async function planDailyRun({ onlyUserId = null } = {}) {
  const all = onlyUserId
    ? await getJobTargets({ fetchAll: true }, onlyUserId)
    : await getJobTargets({ fetchAll: true });
  const now = Date.now();
  const counts = {
    total: all.length, new: 0, followUp: 0, alreadySent: 0, waitingFollowUp: 0,
    paused: 0, inactive: 0, noEmail: 0, dailyEmailsOff: 0, overDailyLimit: 0, toSend: 0
  };

  const byUser = new Map();
  for (const t of all) {
    const st = autoSendStatus(t, now);
    counts[st] += 1;
    if (st !== 'new' && st !== 'followUp') continue;
    const key = String(t.userId || 'none');
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push({ target: t, followUp: st === 'followUp' });
  }

  const batches = [];
  for (const [key, items] of byUser) {
    const userId = key === 'none' ? null : key;
    const settings = await getSettings(userId).catch(() => null);
    if (settings && settings.enableCron === false) { counts.dailyEmailsOff += items.length; continue; }
    items.sort((a, b) => Number(a.followUp) - Number(b.followUp)
      || new Date(a.target.createdAt || 0) - new Date(b.target.createdAt || 0));
    const today = items.slice(0, DAILY_SEND_LIMIT);
    counts.overDailyLimit += items.length - today.length;
    counts.toSend += today.length;
    batches.push(...today);
  }
  return { batches, counts };
}

/** One sentence on why nothing (or only some) will be sent. */
export function explainPlan(counts) {
  if (!counts.total) return 'You have no job targets yet.';
  const parts = [];
  if (counts.alreadySent) parts.push(`${counts.alreadySent} already emailed${FOLLOW_UP_AFTER_DAYS ? ' (follow-up done too)' : ''}`);
  if (counts.waitingFollowUp) parts.push(`${counts.waitingFollowUp} waiting for their ${FOLLOW_UP_AFTER_DAYS}-day follow-up`);
  if (counts.paused) parts.push(`${counts.paused} paused`);
  if (counts.inactive) parts.push(`${counts.inactive} switched off`);
  if (counts.noEmail) parts.push(`${counts.noEmail} without an email address`);
  if (counts.dailyEmailsOff) parts.push(`${counts.dailyEmailsOff} skipped because daily emails are off in Settings`);
  if (counts.overDailyLimit) parts.push(`${counts.overDailyLimit} left for the next run (limit ${DAILY_SEND_LIMIT} per day)`);
  const head = counts.toSend
    ? `Sending ${counts.toSend} of ${counts.total} target(s)`
    : `Nothing to send: none of your ${counts.total} target(s) is due`;
  return parts.length ? `${head}. Skipped: ${parts.join(', ')}.` : `${head}.`;
}

async function sendBatches(batches, triggeredBy, run) {
  for (let i = 0; i < batches.length; i++) {
    if (i > 0 && SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
    const out = await processTargetExecution(batches[i].target, triggeredBy, { followUp: batches[i].followUp });
    if (out.error || (out.result && !out.result.success)) run.failed += 1; else run.sent += 1;
    run.results.push(out);
  }
}

/**
 * Daily run. Pass onlyUserId to run for a single user (manual trigger by a non-admin).
 * With background: true it returns right away (emails go out with a delay between
 * them, which can take minutes) and the results land in Logs.
 */
export async function executeDaily9AMCronJob(triggeredBy = 'cron', { onlyUserId = null, background = false } = {}) {
  if (isRunning) {
    return { processedCount: 0, queued: 0, running: true, message: 'A run is already in progress. Check Logs in a few minutes.', lastRun: publicRun(lastRun), timestamp: new Date(), results: [] };
  }
  isRunning = true;
  let plan;
  try {
    plan = await planDailyRun({ onlyUserId });
  } catch (err) {
    isRunning = false;
    throw err;
  }
  const run = { triggeredBy, startedAt: new Date(), finishedAt: null, queued: plan.batches.length, sent: 0, failed: 0, counts: plan.counts, results: [] };
  lastRun = run;
  const message = explainPlan(plan.counts);
  console.log(`[Cron] ${triggeredBy} run: ${message}`);

  const work = sendBatches(plan.batches, triggeredBy, run)
    .catch((e) => console.error('[Cron] Run failed:', e))
    .finally(() => {
      run.finishedAt = new Date();
      isRunning = false;
      console.log(`[Cron] ${triggeredBy} run finished: ${run.sent} sent, ${run.failed} failed.`);
    });

  const minutes = Math.ceil((Math.max(0, plan.batches.length - 1) * SEND_DELAY_MS) / 60000);
  if (background) {
    return { processedCount: 0, queued: plan.batches.length, estimatedMinutes: minutes, counts: plan.counts, message, timestamp: run.startedAt, results: [] };
  }
  await work;
  return { processedCount: run.sent + run.failed, queued: plan.batches.length, sent: run.sent, failed: run.failed, counts: plan.counts, message, timestamp: run.startedAt, results: run.results };
}

const publicRun = (r) => (r ? {
  triggeredBy: r.triggeredBy, startedAt: r.startedAt, finishedAt: r.finishedAt,
  queued: r.queued, sent: r.sent, failed: r.failed, counts: r.counts
} : null);

/** What the scheduler is set to, whether it has run since the server started, and what is due now. */
export async function getCronStatus({ onlyUserId = null } = {}) {
  const { counts } = await planDailyRun({ onlyUserId });
  return {
    enabled: process.env.ENABLE_CRON !== 'false',
    schedule: CRON_SCHEDULE,
    timezone: CRON_TZ,
    dailyLimit: DAILY_SEND_LIMIT,
    followUpAfterDays: FOLLOW_UP_AFTER_DAYS,
    externalTrigger: Boolean(process.env.CRON_SECRET),
    serverStartedAt,
    running: isRunning,
    lastRun: publicRun(lastRun),
    dueNow: counts,
    message: explainPlan(counts)
  };
}

export function initCronService() {
  if (process.env.ENABLE_CRON === 'false') {
    console.log('[Cron] Disabled via ENABLE_CRON=false');
    return null;
  }
  if (cronTask) cronTask.stop();
  cronTask = cron.schedule(CRON_SCHEDULE, () => {
    executeDaily9AMCronJob('cron', { background: true }).catch((e) => console.error('[Cron] Run failed:', e));
  }, { timezone: CRON_TZ });
  console.log(`[Cron] Scheduled "${CRON_SCHEDULE}" (${CRON_TZ}), limit ${DAILY_SEND_LIMIT}/user/day`);
  return cronTask;
}
