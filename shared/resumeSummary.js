// backend/shared/resumeSummary.js
// Tailored headline title and 2-sentence professional summary, built ONLY from
// facts already in the master resume (dated roles, bullets, skills list, the
// user's own summary) and worded the way the JD words them. Nothing is invented:
// a skill or practice appears here only if the resume already shows it.
// Pure functions, no I/O.

import { extractSkills, hasSkill } from './keywords.js';
import { jdConcepts, conceptHits } from './jdTerms.js';

const DOMAIN_LABELS = new Set(['Payments', 'Fintech', 'E-commerce', 'Logistics', 'Healthcare', 'EdTech', 'SaaS']);
const SENIORITY = /\b(?:senior|sr\.?|junior|jr\.?|lead|principal|staff|head|chief|associate|trainee|intern|entry[\s-]level|mid[\s-]level|i{1,3}|iv|[1-4])\b/gi;
const ROLE_WORD = /\b(developer|engineer|programmer)\b/i;
const FOCUS_IN_TITLE = /\b(front[\s-]?end|back[\s-]?end|full[\s-]?stack|mobile|android|ios|web|ui|devops|data|ml|ai|cloud|platform|qa|test)\b/i;

const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const titleCase = (s) => s.replace(/\b([a-z])([a-z]*)/g, (_, a, b) => a.toUpperCase() + b)
  .replace(/\bFront[\s-]?End\b/i, 'Frontend').replace(/\bBack[\s-]?End\b/i, 'Backend').replace(/\bFull[\s-]?Stack\b/i, 'Full Stack')
  .replace(/\bIos\b/, 'iOS').replace(/\bUi\b/, 'UI').replace(/\bQa\b/, 'QA').replace(/\bMl\b/, 'ML').replace(/\bAi\b/, 'AI');

/**
 * The JD's job title as it can honestly head this resume, or null.
 * "Senior Frontend Engineer (React) - Remote" -> "Frontend Engineer" (if the resume shows React).
 * Seniority words are dropped (the resume's dates speak for that); a title naming a tool
 * the resume does not show ("Python Developer" with no Python) is not used.
 * @param {string} targetRole
 * @param {string} resumeText everything the master resume says (bullets, skills, summary)
 */
export function honestTitle(targetRole = '', resumeText = '') {
  let t = String(targetRole || '')
    .split(/\s+[-–—|]\s+|\s*\|\s*|,|\s+at\s+|\s+@\s+/i)[0]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bSDE\b/gi, 'Software Engineer')
    .replace(SENIORITY, ' ')
    .replace(/[-/]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || !ROLE_WORD.test(t) || t.split(' ').length > 5) return null;
  const tools = extractSkills(t);
  if (tools.some((s) => !hasSkill(resumeText, s))) return null;
  return titleCase(t);
}

/** Does this headline title already say the focus (frontend, backend, mobile...)? */
export const titleHasFocus = (title = '') => FOCUS_IN_TITLE.test(title) || extractSkills(title).length > 0;

function lowerLabel(label) {
  // "Integration / E2E testing" -> "integration and E2E testing"; keeps acronyms.
  return label.replace(/\s*\/\s*/g, ' and ')
    .split(' ')
    .map((w) => (/[A-Z].*[A-Z]|\d/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

function yearsPhrase(years) {
  if (!years || years < 1) return '';
  const n = Math.floor(years);
  return `${n}+ year${n === 1 ? '' : 's'}`;
}

/**
 * @param {object} p
 * @param {string} p.title          headline title ("Frontend Engineer")
 * @param {number|null} p.years     dated experience (internships half)
 * @param {'frontend'|'backend'|'fullstack'} p.focus
 * @param {object[]} p.skills       JD skills the resume shows, most important first
 * @param {(s: string) => string} p.spell  JD spelling of a skill label
 * @param {string} p.jd
 * @param {string} p.evidence       bullets + the user's own summary (what counts as shown)
 * @returns {string} '' when there is nothing JD-specific to say
 */
export function buildTailoredSummary({ title, years, focus, skills = [], spell = (s) => s, jd = '', evidence = '' }) {
  if (!String(jd).trim() || !skills.length) return '';
  const shown = jdConcepts(jd).filter((c) => conceptHits(evidence, [c]) > 0);
  const domains = shown.filter((c) => DOMAIN_LABELS.has(c.label)).map((c) => c.label === 'SaaS' ? 'SaaS' : c.label.toLowerCase()).slice(0, 2);
  const practices = shown.filter((c) => !DOMAIN_LABELS.has(c.label)).map((c) => lowerLabel(c.label)).slice(0, 4);

  const what = {
    frontend: 'responsive web applications',
    backend: 'backend services and APIs',
    fullstack: 'full-stack web applications'
  }[focus] || 'web applications';
  const yrs = yearsPhrase(years);
  const tools = joinList(skills.slice(0, 6).map((s) => spell(s.label)));
  const first = `${title}${yrs ? ` with ${yrs} of experience` : ''} building ${what}${domains.length ? ` for ${joinList(domains)}` : ''} with ${tools}.`;
  const second = practices.length ? ` Experienced in ${joinList(practices)}.` : '';
  return first + second;
}
