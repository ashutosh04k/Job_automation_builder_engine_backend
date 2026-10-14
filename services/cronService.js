import cron from 'node-cron';
import { 
  getJobTargets, 
  getMasterResume, 
  createLogEntry, 
  updateJobTarget 
} from './storageService.js';
import { generateTailoredResume } from './resumeTailorService.js';
import { sendTailoredResumeEmail } from './emailService.js';

let cronTask = null;

export async function processTargetExecution(target, triggeredBy = 'cron') {
  try {
    const userId = target.userId || null;
    const masterResume = await getMasterResume(userId);

    const tailoredData = generateTailoredResume(
      masterResume,
      target.jobDescription,
      target.targetRole || 'Software Developer | Frontend / Full Stack'
    );

    const result = await sendTailoredResumeEmail({
      to: target.email,
      subject: tailoredData.subjectLine,
      htmlContent: tailoredData.htmlTemplate,
      tailoredData,
      userId
    });

    await updateJobTarget(target._id, {
      lastSentAt: new Date().toISOString(),
      totalSentCount: (target.totalSentCount || 0) + 1
    }, userId);

    await createLogEntry({
      targetId: target._id,
      recipientEmail: target.email,
      jobDescriptionSnippet: (target.jobDescription || '').substring(0, 120) + '...',
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
    console.error(`[Cron Process Error] Target ${target._id}:`, err);
    await createLogEntry({
      targetId: target._id,
      recipientEmail: target.email,
      jobDescriptionSnippet: target.jobDescription?.substring(0, 120),
      status: 'failed',
      triggeredBy,
      details: err.message
    }, target.userId || null);
    return { targetId: target._id, recipient: target.email, error: err.message };
  }
}

export async function executeDaily9AMCronJob(triggeredBy = 'cron') {
  console.log(`[Cron Job 9:00 AM] Running daily resume dispatch task at ${new Date().toISOString()}`);
  
  // Fetch all active targets across all registered users
  const allTargets = await getJobTargets({ fetchAll: true });
  const activeTargets = allTargets.filter(t => t.isActive);
  console.log(`[Cron Job 9:00 AM] Found ${activeTargets.length} active job target(s) across all users`);

  const results = [];
  for (const target of activeTargets) {
    const res = await processTargetExecution(target, triggeredBy);
    results.push(res);
  }

  return {
    processedCount: activeTargets.length,
    timestamp: new Date(),
    results
  };
}

export function initCronService() {
  const cronSchedule = '0 9 * * *'; // Every day at 9:00 AM
  
  console.log(`[Cron Service] Initializing daily cron scheduler: "${cronSchedule}" (9:00 AM Daily)`);
  
  if (cronTask) {
    cronTask.stop();
  }

  cronTask = cron.schedule(cronSchedule, async () => {
    await executeDaily9AMCronJob('cron');
  });

  return cronTask;
}
