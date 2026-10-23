import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJobDescription, parseRequiredYears, resumeYears, scoreResume } from '../shared/atsScorer.js';
import { extractSkills } from '../shared/keywords.js';
import { tailorAndScore } from '../services/atsService.js';
import { PROFILE, FRONTEND_JD } from './fixtures.js';

const labels = (skills) => skills.map((s) => s.label).sort();

test('word boundaries: "email" is not AI, "javascript" is not Java, "React Native" is not React', () => {
  assert.deepEqual(labels(extractSkills('Please email us. JavaScript only.')), ['JavaScript']);
  assert.deepEqual(labels(extractSkills('React Native developer')), ['React Native']);
});

test('JD analysis splits required vs nice-to-have', () => {
  const jd = analyzeJobDescription(FRONTEND_JD, 'Frontend Developer (ReactJS)');
  assert.deepEqual(labels(jd.required), ['Jest', 'React.js', 'Redux', 'Tailwind CSS', 'TypeScript']);
  assert.deepEqual(labels(jd.preferred), ['GraphQL', 'Next.js']);
  assert.equal(jd.requiredYears, 2);
});

test('required years parsing', () => {
  assert.equal(parseRequiredYears('Minimum 3+ years of experience in React'), 3);
  assert.equal(parseRequiredYears('2-4 years experience as a developer'), 2);
  assert.equal(parseRequiredYears('Founded 12 years ago. Great perks.'), null);
});

test('resume years merges overlapping roles', () => {
  const y = resumeYears([{ period: 'Jan 2020 - Dec 2021' }, { period: 'Jun 2021 - Dec 2022' }]);
  assert.equal(y, 3);
});

test('no JD -> no score (never a made-up number)', () => {
  const r = scoreResume({ jobDescription: '', targetRole: '', resume: { full: '', bullets: [], roles: [], headline: '' } });
  assert.equal(r.score, null);
});

test('score moves with the resume, not just the JD', () => {
  const jdText = 'Requirements: React.js, TypeScript, Redux, GraphQL, Kafka. 2+ years of experience.';
  const base = { headline: 'Frontend Developer', roles: ['Software Developer'], skills: [], education: [] };
  const strong = { ...base, bullets: ['React.js, TypeScript, Redux and GraphQL dashboards. Kafka consumers.'] };
  const weak = { ...base, bullets: ['Built websites.'] };
  strong.full = strong.bullets.join(' ') + ' ' + strong.headline;
  weak.full = weak.bullets.join(' ') + ' ' + weak.headline;
  const profile = { email: 'a@b.c', phone: '1', linkedin: 'x', experience: [{ period: 'Jan 2020 - Present' }] };
  const pdf = { pages: 1, bodyPt: 10.5 };
  const s1 = scoreResume({ jobDescription: jdText, targetRole: 'Frontend Developer', resume: strong, profile, pdf });
  const s2 = scoreResume({ jobDescription: jdText, targetRole: 'Frontend Developer', resume: weak, profile, pdf });
  assert.ok(s1.score > s2.score, `${s1.score} should beat ${s2.score}`);
  assert.deepEqual(s2.keywords.required.missing.sort(), ['GraphQL', 'Kafka', 'React.js', 'Redux', 'TypeScript']);
  assert.equal(s1.breakdown.find((b) => b.key === 'hardSkills').score, 100);
});

test('end to end: tailored PDF mirrors JD spelling and is scored on printed text', async () => {
  const { report, pdf } = await tailorAndScore(PROFILE, { jobDescription: FRONTEND_JD, targetRole: 'Frontend Developer' });
  assert.ok(pdf.length > 1000);
  assert.equal(report.pdf.pages, 1);
  assert.ok(report.keywords.required.matched.includes('React.js'));
  assert.ok(report.keywords.required.missing.includes('Jest'), 'Jest is not on the resume and must not be invented');
  assert.ok(report.keywords.preferred.missing.includes('GraphQL'));
  assert.ok(report.score > 0 && report.score <= 100);
});

test('incomplete profile is rejected, not silently scored', async () => {
  await assert.rejects(() => tailorAndScore({ fullName: 'X' }, { jobDescription: FRONTEND_JD }), /incomplete/);
});

test('heading with inline content still counts its skills', () => {
  const jd = analyzeJobDescription('Requirements: React.js, TypeScript\nNice to have: GraphQL', '');
  assert.deepEqual(labels(jd.required), ['React.js', 'TypeScript']);
  assert.deepEqual(labels(jd.preferred), ['GraphQL']);
});

test('JD without known skills is flagged low confidence', () => {
  const r = scoreResume({
    jobDescription: 'We want a passionate team player.', targetRole: 'Developer',
    resume: { headline: 'Developer', roles: [], bullets: [], skills: [], education: [], full: 'Developer' },
    profile: { email: 'a', phone: 'b', linkedin: 'c', experience: [] }, pdf: { pages: 1, bodyPt: 10.5 }
  });
  assert.equal(r.confidence, 'low');
});

test('spelling mirror rewrites whole skill names only', async () => {
  const { generateResumePDFWithMeta } = await import('../services/pdfService.js');
  const profile = structuredClone(PROFILE);
  profile.skills[0].items.push('React Testing Library');
  const r = await generateResumePDFWithMeta(profile, { jobDescription: 'Must know ReactJS and Tailwind CSS', targetRole: 'Frontend Developer' });
  const skills = r.rendered.skills.join(' | ');
  assert.match(skills, /ReactJS/);
  assert.match(skills, /React Testing Library/);
  assert.doesNotMatch(skills, /Tailwind CSS CSS|ReactJS Testing/);
});

test('tailor result reports what changed', async () => {
  const profile = structuredClone(PROFILE);
  // Put the React bullet last so ranking has to move it up for a React JD.
  profile.experience[0].highlights.reverse();
  const { changes } = await tailorAndScore(profile, { jobDescription: 'Requirements: ReactJS, Redux', targetRole: 'Frontend Developer' });
  assert.deepEqual(changes.spelling, [{ from: 'React.js', to: 'ReactJS' }]);
  assert.ok(changes.rolesReordered.includes('Acme Mobility'));
  assert.equal(changes.pages, 1);
  assert.ok(changes.emphasised.includes('Redux'));
});
