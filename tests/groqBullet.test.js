import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBullet, smartBulletFallback, generateBulletWithGroq } from '../services/groqBulletService.js';
import { termShownIn } from '../shared/jdTerms.js';
import { PROFILE } from './fixtures.js';

test('sanitizeBullet cleans bullets, fixes weak starts, and guarantees term inclusion', () => {
  const raw = '  • "worked on building user interfaces with CSS3"  ';
  const cleaned = sanitizeBullet(raw, 'CSS3');
  assert.ok(!cleaned.startsWith('•'));
  assert.ok(!cleaned.startsWith('"'));
  assert.ok(!cleaned.toLowerCase().startsWith('worked on'), 'weak start should be replaced');
  assert.ok(cleaned.endsWith('.'));
  assert.ok(termShownIn('CSS3', cleaned));
  assert.ok(cleaned.length >= 15 && cleaned.length <= 220);
});

test('sanitizeBullet truncates excessively long bullets to 220 chars without broken words', () => {
  const longText = 'Engineered ' + 'scalable components '.repeat(25) + 'using Python.';
  const cleaned = sanitizeBullet(longText, 'Python');
  assert.ok(cleaned.length <= 220);
  assert.ok(cleaned.endsWith('.'));
  assert.ok(termShownIn('Python', cleaned));
});

test('smartBulletFallback builds valid, metric-backed ATS bullets for different skill groups', () => {
  const bFrontend = smartBulletFallback({ term: 'CSS3', targetEntry: { role: 'Software Developer', company: 'Togopool' } });
  assert.ok(termShownIn('CSS3', bFrontend));
  assert.ok(bFrontend.length >= 15 && bFrontend.length <= 220);
  assert.match(bFrontend, /Togopool/);

  const bBackend = smartBulletFallback({ term: 'Docker', targetEntry: { role: 'Backend Engineer', company: 'Acme' } });
  assert.ok(termShownIn('Docker', bBackend));
  assert.ok(bBackend.length >= 15 && bBackend.length <= 220);
});

test('generateBulletWithGroq falls back gracefully to template when apiKey is absent', async () => {
  const res = await generateBulletWithGroq({
    master: PROFILE,
    term: 'Redux',
    target: 'exp:0',
    targetRole: 'Frontend Developer',
    companyName: 'Acme Corp'
  });

  assert.equal(res.provider, 'template');
  assert.ok(res.bullet);
  assert.ok(termShownIn('Redux', res.bullet));
  assert.ok(res.bullet.length >= 15 && res.bullet.length <= 220);
});
