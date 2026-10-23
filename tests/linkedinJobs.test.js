import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchPlan, parsePostedAgo, sanitizeScannedJob, linkedInSearchUrl } from '../shared/linkedinJobs.js';
import { PROFILE } from './fixtures.js';

test('search URL asks LinkedIn for the last N days, newest first', () => {
  const u = new URL(linkedInSearchUrl('Frontend Developer React', 'Gurugram, Haryana', 3));
  assert.equal(u.origin + u.pathname, 'https://www.linkedin.com/jobs/search/');
  assert.equal(u.searchParams.get('keywords'), 'Frontend Developer React');
  assert.equal(u.searchParams.get('f_TPR'), 'r259200');
  assert.equal(u.searchParams.get('sortBy'), 'DD');
});

test('search plan comes from the resume role and its most-used skills', () => {
  const plan = buildSearchPlan(PROFILE);
  assert.equal(plan.location, 'Gurugram, Haryana');
  assert.equal(plan.days, 3);
  assert.ok(plan.searches.length >= 2);
  assert.match(plan.searches[0].keywords, /Developer React$/);
  assert.ok(plan.searches.every((s) => s.url.includes('f_TPR=r259200')));
  assert.equal(new Set(plan.searches.map((s) => s.keywords)).size, plan.searches.length, 'no duplicate searches');
});

test('"x ago" text becomes a date', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  assert.equal(parsePostedAgo('3 days ago', now).toISOString(), '2026-10-20T12:00:00.000Z');
  assert.equal(parsePostedAgo('Reposted 2 weeks ago', now).toISOString(), '2026-10-09T12:00:00.000Z');
  assert.equal(parsePostedAgo('5 hours ago', now).toISOString(), '2026-10-23T07:00:00.000Z');
  assert.equal(parsePostedAgo('Just now', now).toISOString(), now.toISOString());
  assert.equal(parsePostedAgo('Promoted', now), null);
});

test('scanned jobs are cleaned; non-LinkedIn links and junk are dropped', () => {
  const ok = sanitizeScannedJob({
    jobId: '4012345678', title: '  Frontend   Developer ', company: 'Acme', postedTime: '2 days ago',
    jobUrl: 'https://www.linkedin.com/jobs/view/4012345678/?trk=abc', jobDescription: 'x'.repeat(50), isEasyApply: true
  });
  assert.equal(ok.title, 'Frontend Developer');
  assert.equal(ok.jobUrl, 'https://www.linkedin.com/jobs/view/4012345678/');
  assert.equal(ok.applyType, 'easy_apply');
  assert.ok(ok.postedAt);
  assert.equal(sanitizeScannedJob({ jobId: '4012345678', title: 'Dev', jobUrl: 'javascript:alert(1)' }).jobUrl, 'https://www.linkedin.com/jobs/view/4012345678/');
  assert.equal(sanitizeScannedJob({ jobId: 'li_1_abc', title: 'Dev' }), null);
  assert.equal(sanitizeScannedJob({ jobId: '4012345678', title: '' }), null);
});
