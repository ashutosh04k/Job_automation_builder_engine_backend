import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAdditions, additionTargets } from '../shared/resumeAdditions.js';
import { tailorAndScore } from '../services/atsService.js';
import { PROFILE } from './fixtures.js';

const JD = {
  targetRole: 'Frontend Developer',
  jobDescription: 'Requirements: React.js, Redux, GraphQL, Cypress. 2+ years of experience. You will do code reviews.'
};

test('skill mode adds a visible item to the matching Skills group, once', () => {
  const { update, added, errors } = applyAdditions(PROFILE, [
    { term: 'GraphQL', mode: 'skill' },
    { term: 'Cypress', mode: 'skill' },
    { term: 'graphql', mode: 'skill' } // duplicate, ignored
  ]);
  assert.deepEqual(errors, []);
  assert.ok(update.skills.find((g) => g.category === 'Backend').items.includes('GraphQL'));
  assert.ok(update.skills.find((g) => g.category === 'Additional Skills').items.includes('Cypress'));
  assert.equal(added.length, 2);
});

test('bullet mode needs a target, a sensible length, and the term itself', () => {
  const bad = applyAdditions(PROFILE, [
    { term: 'GraphQL', mode: 'bullet', bullet: 'Built a schema for the dashboard data layer', target: 'exp:0' },
    { term: 'Cypress', mode: 'bullet', bullet: 'Wrote Cypress tests', target: 'exp:9' },
    { term: 'Code reviews', mode: 'bullet', bullet: 'short', target: 'exp:0' }
  ]);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /mention it/);

  const ok = applyAdditions(PROFILE, [
    { term: 'GraphQL', mode: 'bullet', bullet: '• Built a GraphQL API layer for the fleet dashboard used by 300 dispatchers', target: 'exp:0' },
    { term: 'Code reviews', mode: 'bullet', bullet: 'Reviewed pull requests for 4 developers and set lint rules', target: 'exp:1' }
  ]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.update.experience[0].highlights.at(-1), 'Built a GraphQL API layer for the fleet dashboard used by 300 dispatchers');
  assert.equal(PROFILE.experience[0].highlights.length, 3, 'input is not mutated');
});

test('adding what you really have raises the score; bullets beat the Skills list', async () => {
  const before = (await tailorAndScore(PROFILE, JD)).report;
  const asSkill = applyAdditions(PROFILE, [{ term: 'GraphQL', mode: 'skill' }]).update;
  const asBullet = applyAdditions(PROFILE, [{ term: 'GraphQL', mode: 'bullet', bullet: 'Built a GraphQL API layer for the fleet dashboard', target: 'exp:0' }]).update;
  const s1 = (await tailorAndScore({ ...PROFILE, ...asSkill }, JD)).report;
  const s2 = (await tailorAndScore({ ...PROFILE, ...asBullet }, JD)).report;
  assert.ok(before.keywords.required.missing.includes('GraphQL'));
  assert.ok(!s1.keywords.required.missing.includes('GraphQL'));
  assert.ok(s1.score > before.score, `${s1.score} > ${before.score}`);
  assert.ok(s2.score > s1.score, `${s2.score} > ${s1.score}`);
});

test('targets list roles then projects', () => {
  assert.deepEqual(additionTargets(PROFILE).map((t) => t.key), ['exp:0', 'exp:1', 'proj:0']);
});
