import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfLines } from '../services/pdfTextService.js';
import { parseResumeLines, splitRoleCompany } from '../shared/resumeParser.js';
import { generateResumePDF } from '../services/pdfService.js';
import { tailorAndScore } from '../services/atsService.js';
import { masterResumeVersion } from '../services/storageService.js';
import { buildLongResumePdf } from './longResumeFixture.js';
import { PROFILE } from './fixtures.js';

const parsePdf = async (buf) => parseResumeLines((await extractPdfLines(buf)).lines);

test('role/company split handles common header formats', () => {
  assert.deepEqual(splitRoleCompany('Software Developer at Acme'), { role: 'Software Developer', company: 'Acme', location: '' });
  assert.deepEqual(splitRoleCompany('Acme Corp | Senior Engineer | Remote'), { role: 'Senior Engineer', company: 'Acme Corp', location: 'Remote' });
});

test('parses our own one-page layout back into the same structure', async () => {
  const { draft, warnings } = await parsePdf(await generateResumePDF(PROFILE, {}));
  assert.equal(draft.fullName, 'Test Candidate');
  assert.equal(draft.email, 'candidate@example.com');
  assert.equal(draft.experience.length, 2);
  assert.equal(draft.experience[0].company, 'Acme Mobility');
  assert.equal(draft.experience[0].period, 'July 2025 - Present');
  assert.equal(draft.experience[0].highlights.length, 3);
  assert.ok(draft.skills.some((g) => g.items.includes('Node.js')));
  assert.equal(draft.education[0].institution, 'Example University');
  assert.deepEqual(warnings, []);
});

test('parses a 2-page resume in a different layout', async () => {
  const { draft, warnings, unparsed } = await parsePdf(await buildLongResumePdf());
  assert.equal(draft.fullName, 'Priya Sharma');
  assert.equal(draft.phone, '+91 98765 43210');
  assert.match(draft.linkedin, /linkedin\.com\/in\/priya-sharma-dev/);
  assert.match(draft.summary, /^Frontend engineer with 6 years/);
  assert.deepEqual(draft.experience.map((e) => [e.role, e.company, e.period]), [
    ['Senior Frontend Engineer', 'Acme Mobility Pvt Ltd', '07/2023 - Present'],
    ['Software Engineer', 'Beta Realty', '01/2021 - 06/2023'],
    ['Frontend Developer', 'Gamma Labs', '06/2019 - 12/2020'],
    ['Software Engineering Intern', 'Delta Soft', '01/2019 - 05/2019']
  ]);
  assert.deepEqual(draft.experience.map((e) => e.highlights.length), [8, 7, 6, 4]);
  // wrapped lines are joined into one bullet
  assert.ok(draft.experience[0].highlights.every((b) => /[.)]$/.test(b)));
  assert.deepEqual(draft.skills.map((g) => g.category), ['Languages', 'Frontend', 'Backend', 'Cloud & Tools']);
  assert.deepEqual(draft.projects.map((p) => [p.name, p.link]), [
    ['Fleet Tracker', 'https://github.com/priya/fleet-tracker'],
    ['Recipe Planner', '']
  ]);
  assert.equal(draft.education.length, 2);
  assert.equal(draft.education[0].score, 'CGPA 8.2/10');
  assert.equal(draft.certifications.length, 2);
  assert.equal(draft.achievements.length, 2);
  assert.deepEqual(unparsed, ['English, Hindi, Kannada']);
  assert.deepEqual(warnings, []);
});

test('a 2-page master resume becomes a one-page tailored resume', async () => {
  const { draft } = await parsePdf(await buildLongResumePdf());
  const { report, changes } = await tailorAndScore(draft, {
    targetRole: 'Frontend Developer',
    jobDescription: 'Requirements: React, TypeScript, Redux, Jest. Nice to have: Next.js'
  });
  assert.equal(changes.pages, 1);
  assert.ok(changes.bodyPt >= 10);
  assert.equal(changes.condensed.fromPages, 2);
  assert.ok(changes.condensed.bulletsLeftOut > 0);
  assert.ok(report.score !== null);
});

test('resume version changes when content changes, not on metadata', () => {
  const a = { fullName: 'A', experience: [{ company: 'X', highlights: ['one'] }], updatedAt: '2026-01-01' };
  const b = { ...a, updatedAt: '2026-02-02' };
  const c = { ...a, experience: [{ company: 'X', highlights: ['one', 'two'] }] };
  assert.equal(masterResumeVersion(a), masterResumeVersion(b));
  assert.notEqual(masterResumeVersion(a), masterResumeVersion(c));
});
