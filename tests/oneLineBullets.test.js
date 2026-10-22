import test from 'node:test';
import assert from 'node:assert/strict';
import { tightenWording, generateResumePDFWithMeta } from '../services/pdfService.js';
import { PROFILE } from './fixtures.js';

test('shorter wording keeps meaning and capitalisation', () => {
  assert.equal(tightenWording('Successfully utilized React in order to cut load time by approximately 40 percent'),
    'Used React to cut load time by ~40%');
  assert.equal(tightenWording('Built APIs as well as dashboards'), 'Built APIs and dashboards');
  assert.equal(tightenWording('Built a React dashboard.'), 'Built a React dashboard.');
});

test('a bullet a few words too long is shortened to one line; short bullets are untouched', async () => {
  const long = 'Successfully utilized React and Redux in order to build a live dispatcher dashboard that was used by more than 300 dispatchers across 12 cities';
  const master = { ...PROFILE, experience: [{ ...PROFILE.experience[0], highlights: [long, 'Built a small tool.'] }] };
  const r = await generateResumePDFWithMeta(master, { targetRole: 'Frontend Developer', jobDescription: 'React, Redux' });
  const bullets = r.rendered.bullets;
  assert.ok(bullets.includes('Built a small tool.'));
  assert.ok(bullets.some((b) => b.startsWith('Used React and Redux to build')));
  assert.ok(r.content.changes.lines.shortened >= 1);
});

test('spelling mirror only respells the same skill name', async () => {
  const master = {
    ...PROFILE,
    experience: [{ ...PROFILE.experience[0], highlights: ['Deployed on AWS EC2 with a Node JS API and ReactJS UI.'] }]
  };
  const r = await generateResumePDFWithMeta(master, { targetRole: 'Developer', jobDescription: 'Must know React.js, Node.js and AWS' });
  assert.ok(r.rendered.bullets.includes('Deployed on AWS EC2 with a Node.js API and React.js UI.'));
});
