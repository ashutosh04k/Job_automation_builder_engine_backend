// backend/shared/coverLetter.js
// One-click cover letter built ONLY from the master resume and the job description:
// the role and company, the JD skills you really show, and your most relevant
// achievements reworded in the first person. Nothing is invented; the user can
// edit the text before downloading. Pure functions, no I/O.

import { extractSkills, countMatches } from './keywords.js';
import { analyzeJobDescription, weightedYears } from './atsScorer.js';
import { jdConcepts, conceptHits } from './jdTerms.js';

const NOT_HEADLINE = new Set([
  'Figma', 'Agile', 'Jira', 'Git', 'Web Performance', 'Accessibility', 'Responsive Design', 'SEO', 'RBAC',
  'Data Structures & Algorithms', 'OOP', 'Unit Testing', 'API Testing', 'Monitoring', 'System Design', 'CI/CD'
]);
const DOMAIN_LABELS = new Set(['Payments', 'Fintech', 'E-commerce', 'Logistics', 'Healthcare', 'EdTech', 'SaaS']);

const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const clean = (s = '') => String(s).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/** "Built a dashboard…" -> "built a dashboard…" (keeps acronyms like "AWS", "CI/CD"). */
function toFirstPerson(bullet = '') {
  const b = clean(bullet).replace(/[.;\s]+$/, '');
  if (!b) return '';
  const [first, ...rest] = b.split(' ');
  const keepCase = /^[A-Z0-9]{2,}/.test(first) || /[A-Z].*[A-Z]/.test(first.slice(1));
  return `${keepCase ? first : first[0].toLowerCase() + first.slice(1)}${rest.length ? ` ${rest.join(' ')}` : ''}`;
}

/** "3.4" years -> "3+ years", under a year -> '' */
function yearsPhrase(years) {
  if (!years || years < 1) return '';
  const n = Math.floor(years);
  return `${n}+ year${n === 1 ? '' : 's'}`;
}

/**
 * @param {object} master  master resume
 * @param {{ jobDescription?: string, targetRole?: string, companyName?: string, date?: Date }} job
 * @returns {{ greeting, paragraphs: string[], closing, signature: string[], text, matchedSkills: string[] }}
 */
export function buildCoverLetter(master = {}, { jobDescription = '', targetRole = '', companyName = '', date = new Date() } = {}) {
  const name = clean(master.fullName) || 'Applicant';
  const role = clean(targetRole) || clean(master.title).split(/\s*[|—–]\s*/)[0] || 'Software Developer';
  const company = clean(companyName);
  const title = clean(master.title).split(/\s*[|—–]\s*/)[0] || clean(master.experience?.[0]?.role) || 'Software Developer';

  const experience = (master.experience || []).filter((e) => (e.highlights || []).length);
  const allBullets = [
    ...experience.flatMap((e) => (e.highlights || []).map((h) => ({ text: clean(h), where: e }))),
    ...(master.projects || []).flatMap((p) => (p.highlights || []).map((h) => ({ text: clean(h), project: p })))
  ].filter((b) => b.text);
  const resumeText = [
    ...allBullets.map((b) => b.text),
    ...(master.skills || []).flatMap((g) => g.items || [])
  ].join('\n');

  // JD skills the resume really shows (required first), never ones it doesn't.
  const jd = analyzeJobDescription(jobDescription, targetRole);
  const have = new Set(extractSkills(resumeText));
  const matched = [...jd.required, ...jd.preferred].filter((s) => have.has(s)).map((s) => s.label);
  const fallbackSkills = extractSkills(allBullets.map((b) => b.text).join('\n')).map((s) => s.label);
  // Only things you build with read well in "building software with …".
  const buildable = (l) => !NOT_HEADLINE.has(l);
  const headlineSkills = (matched.filter(buildable).length ? matched : fallbackSkills).filter(buildable).slice(0, 3);

  // Most relevant achievements: JD skills + JD practices shown, a number is a bonus; one per role/project.
  const jdSkills = [...jd.required, ...jd.preferred];
  const concepts = jdConcepts(jobDescription);
  const scoreOf = (t) => countMatches(t, jdSkills) * 2 + conceptHits(t, concepts) + (/\d/.test(t) ? 0.5 : 0);
  const ranked = allBullets
    .map((b, i) => ({ ...b, i, score: scoreOf(b.text) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const picked = [];
  const used = new Set();
  for (const b of ranked) {
    const key = b.where ? `e:${b.where.company}${b.where.role}` : `p:${b.project.name}`;
    if (used.has(key)) continue;
    used.add(key);
    picked.push(b);
    if (picked.length === 3) break;
  }

  const years = yearsPhrase(weightedYears(master.experience || []));
  const skillsPart = headlineSkills.length ? ` with ${joinList(headlineSkills)}` : '';
  const opening = `I'm writing to apply for the ${role} position${company ? ` at ${company}` : ''}. `
    + `I'm a ${title}${years ? ` with ${years} of experience` : ''} building production software${skillsPart}`
    + (matched.length >= 3 ? ', which is much of what your posting asks for.' : '.');

  const current = experience[0];
  const sentences = picked.map((b, k) => {
    const what = toFirstPerson(b.text);
    if (b.project) return `In my project ${clean(b.project.name)}, I ${what}.`;
    const at = clean(b.where.company);
    if (b.where === current && k === 0) return `In my current role${at ? ` at ${at}` : ''}, I ${what}.`;
    return at ? `At ${at}, I ${what}.` : `I ${what}.`;
  });
  const evidence = sentences.join(' ');

  const reqMatched = jd.required.filter((s) => have.has(s)).map((s) => s.label);
  const domain = concepts.map((c) => c.label).find((l) => DOMAIN_LABELS.has(l));
  const fit = [
    reqMatched.length >= 2 ? `Your requirements for ${joinList(reqMatched.slice(0, 5))} match the tools I use in my day-to-day work.` : '',
    domain ? `Working on ${domain.toLowerCase()} products${company ? ` at ${company}` : ''} is a big part of what draws me to this role.` : '',
    `I care about clean, well-tested code and shipping features that make a measurable difference for users, and I'd bring that same ownership to ${company || 'your team'}.`
  ].filter(Boolean).join(' ');

  const closing = `I'd welcome the chance to discuss how I can contribute${company ? ` to ${company}` : ''}. Thank you for your time and consideration.`;
  const greeting = company ? `Dear ${company} Hiring Team,` : 'Dear Hiring Manager,';
  const signature = ['Sincerely,', name]; // contact details are in the letter's header
  const paragraphs = [opening, evidence, fit, closing].filter(Boolean);
  const dateLine = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    date: dateLine,
    greeting,
    paragraphs,
    signature,
    matchedSkills: matched,
    text: [greeting, '', ...paragraphs.flatMap((p) => [p, '']), ...signature].join('\n')
  };
}

/** Split edited text back into greeting / paragraphs / signature for the PDF. */
export function parseCoverLetterText(text = '') {
  const blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return { paragraphs: blocks };
}
