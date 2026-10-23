import test from 'node:test';
import assert from 'node:assert/strict';
import { autoSendStatus, isEligibleForAutoSend, explainPlan } from '../services/cronService.js';

const base = { email: 'hr@acme.com', isActive: true, status: 'active', totalSentCount: 0, lastSentAt: null };

test('who the daily run emails (follow-ups off by default)', () => {
  assert.equal(autoSendStatus(base), 'new');
  assert.equal(autoSendStatus({ ...base, status: 'error' }), 'new', 'a failed send is retried');
  assert.equal(autoSendStatus({ ...base, totalSentCount: 1, lastSentAt: '2026-01-01', status: 'completed' }), 'alreadySent');
  // legacy rows: emailed by the old daily cron, still marked "active"
  assert.equal(autoSendStatus({ ...base, totalSentCount: 9, lastSentAt: '2026-01-01' }), 'alreadySent');
  assert.equal(autoSendStatus({ ...base, lastSentAt: '2026-01-01' }), 'alreadySent');
  assert.equal(autoSendStatus({ ...base, status: 'paused' }), 'paused');
  assert.equal(autoSendStatus({ ...base, isActive: false }), 'inactive');
  assert.equal(autoSendStatus({ ...base, email: ' ' }), 'noEmail');
  assert.equal(isEligibleForAutoSend(base), true);
});

test('the run explains why nothing was sent', () => {
  const counts = { total: 21, new: 0, followUp: 0, alreadySent: 19, waitingFollowUp: 0, paused: 1, inactive: 1, noEmail: 0, dailyEmailsOff: 0, overDailyLimit: 0, toSend: 0 };
  assert.equal(explainPlan(counts), 'Nothing to send: none of your 21 target(s) is due. Skipped: 19 already emailed, 1 paused, 1 switched off.');
  assert.match(explainPlan({ ...counts, new: 3, toSend: 3 }), /^Sending 3 of 21 target\(s\)\./);
  assert.equal(explainPlan({ total: 0 }), 'You have no job targets yet.');
});
