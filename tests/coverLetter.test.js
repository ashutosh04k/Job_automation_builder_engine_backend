import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverLetter, parseCoverLetterText } from '../shared/coverLetter.js';
import { renderCoverLetterPdf } from '../services/coverLetterPdf.js';
import { PROFILE, FRONTEND_JD } from './fixtures.js';

test('cover letter uses the role, company and real resume achievements', () => {
  const l = buildCoverLetter(PROFILE, { jobDescription: FRONTEND_JD, targetRole: 'Frontend Developer', companyName: 'Acme' });
  assert.equal(l.greeting, 'Dear Acme Hiring Team,');
  assert.match(l.paragraphs[0], /Frontend Developer position at Acme/);
  assert.match(l.text, /I built a React\.js dashboard with Redux/); // a real bullet, first person
  assert.ok(!/Jest/.test(l.paragraphs[0]), 'never claims a JD skill the resume does not show');
  assert.ok(!l.matchedSkills.includes('Jest'));
  assert.deepEqual(l.signature, ['Sincerely,', 'Test Candidate']);
});

test('works without a company or job description', () => {
  const l = buildCoverLetter(PROFILE, {});
  assert.equal(l.greeting, 'Dear Hiring Manager,');
  assert.ok(l.paragraphs.length >= 3);
});

test('edited text becomes a one-page PDF', async () => {
  const blocks = parseCoverLetterText('Dear Team,\n\nPara one.\n\n\nPara two.\n\nSincerely,\nMe').paragraphs;
  assert.deepEqual(blocks, ['Dear Team,', 'Para one.', 'Para two.', 'Sincerely,\nMe']);
  const pdf = await renderCoverLetterPdf(PROFILE, { date: '1 Jan 2026', paragraphs: blocks });
  assert.equal(pdf.slice(0, 4).toString(), '%PDF');
});
