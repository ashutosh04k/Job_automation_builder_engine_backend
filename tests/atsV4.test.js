import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanJobDescription } from '../shared/jdClean.js';
import { honestTitle, buildTailoredSummary } from '../shared/resumeSummary.js';
import { analyzeJobDescription, resumeYears, scoreResume } from '../shared/atsScorer.js';
import { extractSkills } from '../shared/keywords.js';

const page = `SAVED JOBS
Sign in
Back to search
Software Developer
R1553979
Apply now
Job Overview
Build REST APIs with Python and Node.js. Write unit tests and take part in code reviews.
Qualifications
- 2+ years of experience
Learn more
Similar Jobs
CRA II - Sponsor dedicated
Clinical Research Associate
We use cookies to improve your experience.
© 2026 Example Corp`;

test('page chrome, "Similar jobs" and the footer are removed from a copied JD', () => {
  const jd = cleanJobDescription(page);
  for (const gone of ['SAVED JOBS', 'Sign in', 'Apply now', 'R1553979', 'Learn more', 'CRA II', 'Clinical Research', 'cookies', '©']) {
    assert.ok(!jd.includes(gone), `${gone} should be removed`);
  }
  for (const kept of ['Software Developer', 'Build REST APIs with Python', 'Qualifications', '2+ years']) {
    assert.ok(jd.includes(kept), `${kept} should stay`);
  }
});

test('a clean JD passes through unchanged', () => {
  const jd = 'Requirements:\n- React.js and TypeScript\n- 3+ years of experience';
  assert.equal(cleanJobDescription(jd), jd);
});

test('"October 2024 - June 2025" counts as a date range ("to" inside October is not a separator)', () => {
  assert.equal(resumeYears([{ period: 'October 2024 - June 2025' }]), 0.8);
  assert.equal(resumeYears([{ period: 'Jan 2023 to Dec 2023' }]), 1);
});

test('the JD title heads the resume only when it honestly fits', () => {
  const resume = 'Built dashboards with React.js and Node.js';
  assert.equal(honestTitle('Senior Frontend Engineer (React) - Remote', resume), 'Frontend Engineer');
  assert.equal(honestTitle('SDE-2', resume), 'Software Engineer');
  assert.equal(honestTitle('Python Developer', resume), null);        // no Python on the resume
  assert.equal(honestTitle('Clinical Research Associate', resume), null); // not a developer role
});

test('skills named in the title or repeated in the JD weigh more', () => {
  const jd = 'Requirements: React.js, Redux. Build React.js apps. React.js testing with Jest.';
  const info = analyzeJobDescription(jd, 'React Developer');
  const [react] = extractSkills('React.js');
  const [redux] = extractSkills('Redux');
  assert.equal(info.importance.get(react), 2);  // in title (+0.5) and 3 mentions (+0.5)
  assert.equal(info.importance.get(redux), 1);
});

test('summary uses only skills given to it and practices the resume shows', () => {
  const skills = extractSkills('React.js, TypeScript, Node.js');
  const text = buildTailoredSummary({
    title: 'Frontend Engineer', years: 2.6, focus: 'fullstack', skills,
    jd: 'We need state management and code reviews in a payments product.',
    evidence: 'Restructured client state with Redux. Integrated Stripe checkout.'
  });
  assert.match(text, /^Frontend Engineer with 2\+ years of experience building full-stack web applications for payments with TypeScript, React\.js and Node\.js\./);
  assert.match(text, /Experienced in state management\./);
  assert.ok(!/code reviews/i.test(text)); // the resume does not show code reviews
  assert.equal(buildTailoredSummary({ title: 'X', skills, jd: '' }), ''); // no JD, no summary
});

test('opportunities say how many points each missing keyword is worth', () => {
  const resume = {
    headline: 'Software Developer', roles: ['Software Developer at Acme'],
    bullets: ['Built React.js dashboards used by 10k users'], skills: ['Frontend: React.js'], education: [],
    full: 'Software Developer\nBuilt React.js dashboards used by 10k users\nFrontend: React.js'
  };
  const r = scoreResume({
    jobDescription: 'Requirements: React.js, GraphQL. Nice to have: Storybook.',
    targetRole: 'Frontend Developer', resume,
    profile: { email: 'a@b.c', phone: '1', experience: [{ period: 'Jan 2023 - Present' }] },
    pdf: { pages: 1, bodyPt: 10.5 }
  });
  const opp = Object.fromEntries(r.keywords.opportunities.map((o) => [o.term, o]));
  assert.ok(opp.GraphQL.asBullet > opp.Storybook.asBullet); // required beats nice-to-have
  assert.ok(opp.GraphQL.asBullet > opp.GraphQL.asSkill);    // a bullet beats the Skills list
  assert.equal(r.keywords.opportunities[0].term, 'GraphQL');
});
