import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJobDescription, scoreResume, weightedYears, parseDegreeRequirement } from '../shared/atsScorer.js';
import { matchJdTerms, unknownAcronyms } from '../shared/jdTerms.js';

const profile = { email: 'a@b.c', phone: '1', linkedin: 'x', experience: [{ role: 'Software Developer', period: 'Jan 2020 - Present' }] };
const pdf = { pages: 1, bodyPt: 10.5 };
const resumeOf = (bullets, extra = {}) => {
  const r = { headline: 'Software Developer | Frontend Developer', roles: ['Software Developer at Acme'], skills: [], education: [], bullets, ...extra };
  r.full = [r.headline, ...r.roles, ...r.bullets, ...r.skills, ...r.education].join('\n');
  return r;
};
const part = (report, key) => report.breakdown.find((b) => b.key === key);

test('"A or B" in the JD is satisfied by either one', () => {
  const jd = analyzeJobDescription('Requirements: React.js, Redux or Zustand, Webpack/Vite');
  assert.deepEqual(jd.requiredGroups.map((g) => g.map((s) => s.label).join(' / ')), ['React.js', 'Redux / Zustand', 'Webpack / Vite']);
  const r = scoreResume({ jobDescription: 'Requirements: React.js, Redux or Zustand', targetRole: '', resume: resumeOf(['Built React.js apps with Zustand.']), profile, pdf });
  assert.deepEqual(r.keywords.required.missing, []);
});

test('a skill only in the Skills list gets partial credit', () => {
  const jd = 'Requirements: React.js, TypeScript';
  const inBullet = scoreResume({ jobDescription: jd, targetRole: '', resume: resumeOf(['Built React.js and TypeScript apps.']), profile, pdf });
  const listed = scoreResume({ jobDescription: jd, targetRole: '', resume: resumeOf(['Built React.js apps.'], { skills: ['Languages: TypeScript'] }), profile, pdf });
  assert.equal(part(inBullet, 'hardSkills').score, 100);
  assert.equal(part(listed, 'hardSkills').score, 80);
  assert.deepEqual(listed.keywords.listedOnly, ['TypeScript']);
});

test('practices, domain terms and unknown acronyms in the JD are counted', () => {
  const jd = 'Own state management, contribute to our design system, do code reviews. Fintech experience. Knowledge of GDPR. CI/CD pipelines.';
  const t = matchJdTerms(jd, 'Restructured client state with Redux. Built a component library.');
  assert.deepEqual(t.concepts.map((c) => [c.label, c.matched]), [
    ['State management', true], ['Design system', true], ['Code reviews', false], ['Fintech', false]
  ]);
  assert.deepEqual(unknownAcronyms(jd), ['GDPR']); // not "CI" / "CD" from CI/CD
});

test('measurable results: share of bullets with numbers', () => {
  const r = scoreResume({ jobDescription: 'Requirements: React.js', targetRole: '', profile, pdf,
    resume: resumeOf(['Cut load time by 45% in React.js.', 'Built React.js forms.', 'Served 10k+ users.', 'Wrote docs in 2023.']) });
  assert.deepEqual(r.impact, { withResult: 2, bullets: 4 });
  assert.equal(part(r, 'impact').score, 100); // 50% of bullets = full marks
});

test('internships count half toward years of experience', () => {
  assert.equal(weightedYears([
    { role: 'Software Developer', period: 'Jan 2022 - Dec 2023' },
    { role: 'Software Developer - Intern', period: 'Jan 2021 - Dec 2021' }
  ]), 2.5);
});

test('title: headline alone gives half, a matching past job title gives the rest', () => {
  const jd = 'Requirements: React.js';
  const headlineOnly = scoreResume({ jobDescription: jd, targetRole: 'Frontend Developer', resume: resumeOf(['React.js']), profile, pdf });
  const both = scoreResume({ jobDescription: jd, targetRole: 'Frontend Developer', profile, pdf,
    resume: resumeOf(['React.js'], { roles: ['Frontend Developer at Acme'] }) });
  assert.equal(part(headlineOnly, 'title').score, 50);
  assert.equal(part(both, 'title').score, 100);
});

test('education is scored only when the JD asks for a degree', () => {
  assert.equal(parseDegreeRequirement('We value curiosity.'), null);
  assert.deepEqual(parseDegreeRequirement("Bachelor's degree in Computer Science or related field"), { level: true, field: true });
  const r = scoreResume({ jobDescription: "Requirements: React.js. Bachelor's degree in Computer Science.", targetRole: '', profile, pdf,
    resume: resumeOf(['React.js'], { education: ['B.Tech Computer Science Example University'] }) });
  assert.equal(part(r, 'education').score, 100);
});
