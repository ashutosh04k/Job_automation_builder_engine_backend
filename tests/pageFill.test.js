import test from 'node:test';
import assert from 'node:assert/strict';
import { generateResumePDFWithMeta } from '../services/pdfService.js';
import { extractPdfLines } from '../services/pdfTextService.js';
import { parseResumeLines } from '../shared/resumeParser.js';
import { buildLongResumePdf } from './longResumeFixture.js';
import { PROFILE } from './fixtures.js';

const JD = { targetRole: 'Frontend Developer', jobDescription: 'Requirements: React, TypeScript, Redux, Jest. Nice to have: Next.js' };

test('when content has to be cut, the page is filled to the bottom', async () => {
  const { draft } = parseResumeLines((await extractPdfLines(await buildLongResumePdf())).lines);
  const r = await generateResumePDFWithMeta(draft, JD);
  assert.equal(r.pages, 1);
  assert.ok(r.content.changes.condensed.bulletsLeftOut > 0);
  assert.ok(r.content.changes.fill.pagePercent >= 95, `page only ${r.content.changes.fill.pagePercent}% full`);
});

test('a short resume keeps everything, spreads out a little, and reports how full the page is', async () => {
  const r = await generateResumePDFWithMeta(PROFILE, JD);
  const { fill } = r.content.changes;
  assert.equal(r.pages, 1);
  assert.equal(fill.everythingIncluded, true);
  assert.ok(fill.spacingAdded > 0);
  assert.ok(fill.pagePercent < 95);
});

test('tightened bullets keep the spaces around bold skills', async () => {
  const b = 'Restructured client state with Redux and RTK Query, eliminating stale-cache bugs that showed agents wrong listing data on busy days'; // ~1% too long: printed tightened
  const master = { ...PROFILE, experience: [{ ...PROFILE.experience[0], highlights: [b] }] };
  const r = await generateResumePDFWithMeta(master, JD);
  const { lines } = await extractPdfLines(r.buffer);
  assert.ok(lines.some((l) => l.text.includes('with Redux and RTK') && l.text.endsWith('busy days')));
});
