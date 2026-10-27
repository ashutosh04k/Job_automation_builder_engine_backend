// backend/shared/atsScorer.js
// ATS match score: compares what the JD asks for against the text that is
// actually printed on the generated resume. Pure functions, no I/O.
//
// What it measures (and only this):
//   hardSkills – named tools in the JD found on the resume (required 2x, nice-to-have 1x;
//                "A or B" needs one of them; a skill only in the Skills list counts 60%)
//   jdTerms    – practices, domain and other terms the JD asks for (state management,
//                design system, code reviews, payments, XSS...)
//   softSkills – communication, collaboration... shown by the resume's wording
//   title      – target role terms in the resume headline / job titles
//   experience – years on the resume vs years asked (internships count half)
//   education  – degree level and field, if the JD asks for one
//   impact     – share of bullets with a measurable result (numbers, %)
//   format     – parse-safety checks (1 page, readable font, contact details, dated roles)
//
// It does NOT know a specific employer's ATS configuration. No tool does; treat
// the number as "how well this resume covers this JD", with the details shown.

import { extractSkills, findSkillSpans } from './keywords.js';
import { matchJdTerms } from './jdTerms.js';

export const SCORER_VERSION = 3;

const WEIGHTS = {
  hardSkills: 40, jdTerms: 15, softSkills: 5, title: 10, experience: 10, education: 5, impact: 10, format: 5
};
const REQUIRED_WEIGHT = 2;
const PREFERRED_WEIGHT = 1;
const LISTED_ONLY_CREDIT = 0.6; // skill in the Skills list but in no bullet
const IMPACT_TARGET = 0.5;      // half the bullets with a number = full marks
const INTERN_RE = /\b(intern|internship|trainee|apprentice)\b/i;

const PREFERRED_CUES = /\b(nice[\s-]to[\s-]have|good[\s-]to[\s-]have|preferred|bonus|a plus|is a plus|plus point|desirable|optional|familiarity with|exposure to)\b/i;
// A heading may carry content on the same line ("Requirements: React, Node").
// Group 2 is whatever follows the heading word (and an optional short label + colon).
const PREFERRED_HEADING = /^\s*[-*•]?\s*(nice[\s-]to[\s-]have|good[\s-]to[\s-]have|preferred|bonus|desirable)\b\s*(?:[a-z ]{0,30}?:)?\s*(.*)$/i;
const REQUIRED_HEADING = /^\s*[-*•]?\s*(requirements?|required|must[\s-]have|qualifications?|what you(?:'|’)ll need|skills?|responsibilities|tech stack)\b\s*(?:[a-z ]{0,30}?:)?\s*(.*)$/i;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
};

// ---------------------------------------------------------------------------
// Job description analysis
// ---------------------------------------------------------------------------

/**
 * Split JD skills into required vs preferred. A skill is "preferred" only if
 * every mention of it sits in a nice-to-have line or section.
 */
export function analyzeJobDescription(jobDescription = '', targetRole = '') {
  const jd = String(jobDescription || '');
  const lines = jd.split(/\r?\n|(?<=[.;])\s+/).map((l) => l.trim()).filter(Boolean);

  const requiredHits = new Set();
  const preferredHits = new Set();
  const alternatives = [];
  let section = 'required';

  for (const line of lines) {
    let body = line;
    const pref = line.match(PREFERRED_HEADING);
    const req = !pref && line.match(REQUIRED_HEADING);
    if (pref) { section = 'preferred'; body = pref[2] || ''; }
    else if (req) { section = 'required'; body = req[2] || ''; }
    if (!body.trim()) continue;

    const isPreferred = section === 'preferred' || PREFERRED_CUES.test(body);
    for (const skill of extractSkills(body)) {
      (isPreferred ? preferredHits : requiredHits).add(skill);
    }
    // "Redux Toolkit or Zustand", "Webpack/Vite": either one satisfies the JD.
    const spans = findSkillSpans(body);
    for (let i = 1; i < spans.length; i++) {
      const between = body.slice(spans[i - 1].end, spans[i].start);
      if (/^\s*(?:or|\/|and\/or)\s*$/i.test(between) && spans[i - 1].skill !== spans[i].skill) {
        alternatives.push([spans[i - 1].skill, spans[i].skill]);
      }
    }
  }
  // Skills in the job title are always required.
  extractSkills(targetRole).forEach((s) => requiredHits.add(s));

  const required = [...requiredHits];
  const preferred = [...preferredHits].filter((s) => !requiredHits.has(s));

  // Merge alternative pairs into groups: [[Redux, Zustand], [Webpack, Vite]].
  const groupOf = new Map();
  for (const [a, b] of alternatives) {
    const g = groupOf.get(a) || groupOf.get(b) || new Set();
    g.add(a); g.add(b);
    groupOf.set(a, g); groupOf.set(b, g);
  }
  const toGroups = (skills) => {
    const seen = new Set();
    const out = [];
    for (const s of skills) {
      if (seen.has(s)) continue;
      const members = [...(groupOf.get(s) || [s])].filter((x) => skills.includes(x));
      members.forEach((x) => seen.add(x));
      out.push(members);
    }
    return out;
  };

  return {
    required,
    preferred,
    requiredGroups: toGroups(required),
    preferredGroups: toGroups(preferred),
    requiredYears: parseRequiredYears(jd),
    degree: parseDegreeRequirement(jd)
  };
}

/** "3+ years of experience", "2-4 years", "minimum 5 yrs" -> lowest number asked for, or null. */
export function parseRequiredYears(jd = '') {
  const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b(?:[^.\n]{0,40}?\b(?:experience|exp)\b)?/gi;
  const found = [];
  let m;
  while ((m = re.exec(jd))) {
    const tail = jd.slice(m.index, m.index + m[0].length + 40).toLowerCase();
    if (!/experience|exp\b|developer|engineer|working|professional/.test(tail)) continue;
    const n = Number(m[1]);
    if (n > 0 && n <= 25) found.push(n);
  }
  return found.length ? Math.min(...found) : null;
}

/** Does the JD ask for a degree, and in which field? null if it doesn't mention one. */
export function parseDegreeRequirement(jd = '') {
  const t = String(jd);
  const level = /\b(bachelor'?s?|b\.?\s?tech|b\.?\s?e\.?(?=\s|\/|,)|b\.?\s?sc|bca|undergraduate degree|degree in|graduate degree|master'?s?|m\.?\s?tech|mca|engineering degree)\b/i.test(t);
  if (!level) return null;
  const field = /\b(computer science|computer engineering|information technology|software engineering|\bcs\b|\bcse\b|related field|related discipline)\b/i.test(t);
  return { level: true, field };
}

const DEGREE_RE = /\b(bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|bca|mca|master|m\.?\s?tech|m\.?\s?sc|ph\.?\s?d|degree)\b/i;
const CS_FIELD_RE = /\b(computer|information technology|software|\bit\b|cse|electronics|data science)\b/i;
const HAS_RESULT = /(\d+(?:\.\d+)?\s*(?:%|x\b|k\+?|\+|ms\b|s\b|sec|min|hours?|days?|users|orders|records|customers|clients)|\b\d{2,}(?:,\d{3})*\b(?!\s*-\s*\d{4})|\$\s?\d)/i;
const isYearOnly = (b) => (b.match(/\d+/g) || []).every((n) => /^(19|20)\d{2}$/.test(n));

// ---------------------------------------------------------------------------
// Resume analysis
// ---------------------------------------------------------------------------

function parseMonth(token = '', isEnd = false) {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (/present|current|now|till date|ongoing/.test(t)) {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  }
  const year = t.match(/(19|20)\d{2}/);
  if (!year) return null;
  const mon = t.match(/[a-z]{3,}/);
  const month = mon && MONTHS[mon[0].slice(0, 4)] !== undefined ? MONTHS[mon[0].slice(0, 4)]
    : mon && MONTHS[mon[0].slice(0, 3)] !== undefined ? MONTHS[mon[0].slice(0, 3)]
    : (isEnd ? 11 : 0);
  return Number(year[0]) * 12 + month;
}

/** Total years across experience periods, overlapping ranges merged. */
export function resumeYears(experience = []) {
  const ranges = [];
  for (const e of experience || []) {
    const [a, b] = String(e?.period || '').split(/\s*(?:-|–|—|to)\s*/i);
    const start = parseMonth(a || '');
    const end = parseMonth(b || '', true) ?? start;
    if (start !== null && end !== null && end >= start) ranges.push([start, end + 1]);
  }
  if (!ranges.length) return null;
  ranges.sort((x, y) => x[0] - y[0]);
  let months = 0;
  let [cs, ce] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else { months += ce - cs; [cs, ce] = [s, e]; }
  }
  months += ce - cs;
  return Math.round((months / 12) * 10) / 10;
}

/** Years of experience with internships counted at half. */
export function weightedYears(experience = []) {
  const list = experience || [];
  const isIntern = (e) => INTERN_RE.test(`${e?.role || ''} ${e?.company || ''}`);
  const full = resumeYears(list.filter((e) => !isIntern(e))) || 0;
  const intern = resumeYears(list.filter(isIntern)) || 0;
  if (!full && !intern) return resumeYears(list);
  return Math.round((full + intern / 2) * 10) / 10;
}

const normalizeTitle = (t = '') => String(t).toLowerCase()
  .replace(/front[\s-]?end/g, 'frontend')
  .replace(/back[\s-]?end/g, 'backend')
  .replace(/full[\s-]?stack/g, 'fullstack')
  .replace(/\bsde\b/g, 'software engineer');

const TITLE_NOISE = new Set([
  'developer', 'engineer', 'software', 'sr', 'senior', 'junior', 'jr', 'lead', 'principal', 'staff',
  'associate', 'intern', 'i', 'ii', 'iii', 'iv', 'the', 'and', 'of', 'for', 'with', 'a', 'an', 'in',
  'remote', 'hybrid', 'onsite', 'sde', 'sde1', 'sde2', 'level', 'role', 'position', 'mid'
]);

function titleTerms(role = '') {
  return [...new Set(normalizeTitle(role).split(/[^a-z0-9+#.]+/).filter((w) => w && !TITLE_NOISE.has(w)))];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const pct = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * @param {object} p
 * @param {string} p.jobDescription
 * @param {string} p.targetRole
 * @param {{ headline: string, roles: string[], bullets: string[], skills: string[], education: string[], full: string }} p.resume
 *        Text that is actually printed on the resume.
 * @param {{ email?: string, phone?: string, linkedin?: string, experience?: object[] }} p.profile
 * @param {{ pages: number, bodyPt: number, trimmed: boolean }} p.pdf
 */
export function scoreResume({ jobDescription = '', targetRole = '', companyName = '', resume, profile = {}, pdf = {} }) {
  if (!String(jobDescription).trim() && !String(targetRole).trim()) {
    return { score: null, reason: 'Add a job description to get a match score.', version: SCORER_VERSION };
  }

  const jd = analyzeJobDescription(jobDescription, targetRole);
  const resumeSkills = new Set(extractSkills(resume.full));
  const evidenceSkills = new Set(extractSkills(resume.bullets.join(' \n ')));

  // --- hard skills ------------------------------------------------------------
  // Credit per JD group: 1 if shown in a bullet, 0.6 if only listed, 0 if absent.
  const credit = (s) => (evidenceSkills.has(s) ? 1 : resumeSkills.has(s) ? LISTED_ONLY_CREDIT : 0);
  const groupLabel = (g) => g.map((s) => s.label).join(' / ');
  const classify = (groups) => ({
    matched: groups.filter((g) => g.some((s) => resumeSkills.has(s))).map(groupLabel),
    missing: groups.filter((g) => !g.some((s) => resumeSkills.has(s))).map(groupLabel)
  });
  const required = classify(jd.requiredGroups);
  const preferred = classify(jd.preferredGroups);
  const listedOnly = [...jd.required, ...jd.preferred]
    .filter((s) => resumeSkills.has(s) && !evidenceSkills.has(s))
    .map((s) => s.label);

  const groupCredit = (g) => Math.max(...g.map(credit));
  const totalWeight = jd.requiredGroups.length * REQUIRED_WEIGHT + jd.preferredGroups.length * PREFERRED_WEIGHT;
  const gotWeight = jd.requiredGroups.reduce((n, g) => n + groupCredit(g) * REQUIRED_WEIGHT, 0)
    + jd.preferredGroups.reduce((n, g) => n + groupCredit(g) * PREFERRED_WEIGHT, 0);
  const keywordScore = totalWeight ? pct((gotWeight / totalWeight) * 100) : null;

  // --- other JD terms + soft skills --------------------------------------------
  const terms = matchJdTerms(jobDescription, resume.full, { companyName });
  const otherTerms = [...terms.concepts, ...terms.acronyms];
  const termScore = otherTerms.length ? pct((otherTerms.filter((t) => t.matched).length / otherTerms.length) * 100) : null;
  const softScore = terms.soft.length ? pct((terms.soft.filter((t) => t.matched).length / terms.soft.length) * 100) : null;
  const split = (list) => ({ matched: list.filter((t) => t.matched).map((t) => t.label), missing: list.filter((t) => !t.matched).map((t) => t.label) });

  // --- impact -------------------------------------------------------------------
  const bullets = (resume.bullets || []).filter(Boolean);
  const withResult = bullets.filter((b) => HAS_RESULT.test(b) && !isYearOnly(b)).length;
  const impactScore = bullets.length ? pct(Math.min(1, withResult / bullets.length / IMPACT_TARGET) * 100) : null;

  // --- education ----------------------------------------------------------------
  let educationScore = null;
  const eduText = (resume.education || []).join(' ');
  if (jd.degree) {
    const hasDegree = DEGREE_RE.test(eduText);
    const fieldOk = !jd.degree.field || CS_FIELD_RE.test(eduText);
    educationScore = (hasDegree ? 70 : 0) + (hasDegree && fieldOk ? 30 : 0);
  }

  // --- title ----------------------------------------------------------------
  // Half for the headline, half for a real job title. The tailored headline
  // always repeats the target role, so on its own it would always score 100.
  const wanted = titleTerms(targetRole);
  const hitsIn = (text) => {
    const t = normalizeTitle(text);
    return wanted.filter((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.+#]/g, '\\$&')}([^a-z0-9]|$)`).test(t));
  };
  const headHits = hitsIn(resume.headline || '');
  const roleHits = hitsIn((resume.roles || []).join(' | '));
  const titleHits = [...new Set([...headHits, ...roleHits])];
  let titleScore = null;
  if (String(targetRole).trim()) {
    titleScore = wanted.length
      ? pct(((headHits.length + roleHits.length) / (2 * wanted.length)) * 100)
      : (/(developer|engineer)/.test(normalizeTitle([resume.headline, ...(resume.roles || [])].join(' '))) ? 100 : 50);
  }

  // --- experience -----------------------------------------------------------
  const haveYears = weightedYears(profile.experience);
  let experienceScore = null;
  if (jd.requiredYears && haveYears !== null) {
    experienceScore = pct(Math.min(1, haveYears / jd.requiredYears) * 100);
  }

  // --- format ---------------------------------------------------------------
  const checks = [
    { id: 'one_page', label: 'Fits on one page', weight: 3, passed: pdf.pages === 1, detail: `${pdf.pages ?? '?'} page(s)` },
    { id: 'font_size', label: 'Body text is 10pt or larger', weight: 2, passed: (pdf.bodyPt || 0) >= 10, detail: `${pdf.bodyPt ?? '?'}pt` },
    { id: 'email', label: 'Email address present', weight: 2, passed: Boolean(profile.email) },
    { id: 'phone', label: 'Phone number present', weight: 2, passed: Boolean(profile.phone) },
    { id: 'linkedin', label: 'LinkedIn URL present', weight: 1, passed: Boolean(profile.linkedin) },
    {
      id: 'dates', label: 'Every role has dates', weight: 2,
      passed: (profile.experience || []).every((e) => String(e?.period || '').trim())
    },
    { id: 'text_pdf', label: 'Text-based PDF with standard section headings', weight: 1, passed: true }
  ];
  const fTotal = checks.reduce((n, c) => n + c.weight, 0);
  const formatScore = pct((checks.filter((c) => c.passed).reduce((n, c) => n + c.weight, 0) / fTotal) * 100);

  // --- combine (drop parts we can't measure, re-weight the rest) -------------
  const parts = [
    { key: 'hardSkills', label: 'Hard skills', score: keywordScore,
      detail: totalWeight
        ? `${required.matched.length}/${jd.requiredGroups.length} required, ${preferred.matched.length}/${jd.preferredGroups.length} nice-to-have${listedOnly.length ? `; ${listedOnly.length} only in Skills list (partial credit)` : ''}`
        : 'No recognisable tools in the JD' },
    { key: 'jdTerms', label: 'Other JD terms', score: termScore,
      detail: otherTerms.length ? `${otherTerms.filter((t) => t.matched).length}/${otherTerms.length} practices / domain terms` : 'None found in the JD' },
    { key: 'softSkills', label: 'Soft skills', score: softScore,
      detail: terms.soft.length ? `${terms.soft.filter((t) => t.matched).length}/${terms.soft.length} shown in bullets` : 'JD does not ask for any' },
    { key: 'title', label: 'Job title match', score: titleScore,
      detail: wanted.length
        ? `${wanted.join(', ')}: ${headHits.length ? 'in headline' : 'not in headline'}, ${roleHits.length ? 'in a past job title' : 'not in any past job title'}`
        : 'Generic title' },
    { key: 'experience', label: 'Years of experience', score: experienceScore,
      detail: jd.requiredYears ? `JD asks ${jd.requiredYears}+ yrs, resume shows ${haveYears ?? 'unknown'} (internships count half)` : 'JD does not state years' },
    { key: 'education', label: 'Education', score: educationScore,
      detail: jd.degree ? `JD asks for a degree${jd.degree.field ? ' in CS or a related field' : ''}` : 'JD does not ask for a degree' },
    { key: 'impact', label: 'Measurable results', score: impactScore,
      detail: bullets.length ? `${withResult}/${bullets.length} bullets have a number or % result` : 'No bullets' },
    { key: 'format', label: 'ATS-safe format', score: formatScore,
      detail: `${checks.filter((c) => c.passed).length}/${checks.length} checks passed` }
  ];
  const measured = parts.filter((p) => p.score !== null);
  const wSum = measured.reduce((n, p) => n + WEIGHTS[p.key], 0);
  const breakdown = parts.map((p) => ({
    ...p,
    weight: p.score === null ? 0 : Math.round((WEIGHTS[p.key] / wSum) * 100)
  }));
  const score = pct(measured.reduce((n, p) => n + p.score * WEIGHTS[p.key], 0) / wSum);

  // --- suggestions (never "add a skill you don't have") ----------------------
  const suggestions = [];
  if (required.missing.length) {
    suggestions.push(`Missing required skills: ${required.missing.join(', ')}. If you have real experience with any of these, add a bullet that shows it to your master resume.`);
  }
  if (preferred.missing.length) {
    suggestions.push(`Missing nice-to-have skills: ${preferred.missing.join(', ')}.`);
  }
  const missingTerms = otherTerms.filter((t) => !t.matched).map((t) => t.label);
  if (missingTerms.length) {
    suggestions.push(`The JD also asks for: ${missingTerms.join(', ')}. If you have done these, say so in a bullet using the JD's words.`);
  }
  const missingSoft = terms.soft.filter((t) => !t.matched).map((t) => t.label);
  if (missingSoft.length) {
    suggestions.push(`Soft skills the JD mentions that no bullet shows: ${missingSoft.join(', ')} (e.g. "collaborated with design and product to…").`);
  }
  if (impactScore !== null && impactScore < 100) {
    suggestions.push(`Only ${withResult} of ${bullets.length} bullets have a measurable result. Add numbers where true (%, time saved, users, volume).`);
  }
  if (educationScore !== null && educationScore < 100) {
    suggestions.push('The JD asks for a degree' + (jd.degree.field ? ' in CS or a related field' : '') + '; make sure your Education section states it clearly.');
  }
  if (listedOnly.length) {
    suggestions.push(`Only in your Skills list, not in any bullet: ${listedOnly.join(', ')}. A bullet showing where you used them reads stronger to recruiters.`);
  }
  if (experienceScore !== null && experienceScore < 100) {
    suggestions.push(`The JD asks for ${jd.requiredYears}+ years; your dated roles add up to ${haveYears}.`);
  }
  if (titleScore !== null && titleScore < 100 && wanted.length) {
    const notInRoles = wanted.filter((w) => !roleHits.includes(w));
    suggestions.push(notInRoles.length && headHits.length
      ? `"${notInRoles.join(', ')}" is only in your headline. If a past role really was that (e.g. Software Developer (Frontend)), name it that way in Master Resume.`
      : `Title terms not on your resume: ${wanted.filter((w) => !titleHits.includes(w)).join(', ')}.`);
  }
  checks.filter((c) => !c.passed).forEach((c) => suggestions.push(`Format: ${c.label.toLowerCase()} — currently failing.`));
  if (pdf.trimmed) {
    suggestions.push('Some lower-ranked bullets were left out to keep one page. They are the ones least related to this JD.');
  }

  // Without JD skills the number rests on title + format only: say so.
  const confidence = keywordScore === null ? 'low' : (jd.requiredGroups.length + jd.preferredGroups.length) < 4 ? 'medium' : 'high';
  if (confidence === 'low') {
    suggestions.unshift('No recognisable tools found in the job description, so this score leaves out hard skills. Paste the full JD for a real match score.');
  }

  return {
    score,
    confidence,
    label: score >= 80 ? 'Strong' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Low',
    breakdown,
    keywords: { required, preferred, listedOnly, terms: split(otherTerms), soft: split(terms.soft) },
    impact: { withResult, bullets: bullets.length },
    experience: { requiredYears: jd.requiredYears, resumeYears: haveYears },
    checks: checks.map(({ weight, ...c }) => c),
    suggestions,
    pdf: { pages: pdf.pages, bodyPt: pdf.bodyPt, trimmed: Boolean(pdf.trimmed) },
    version: SCORER_VERSION
  };
}
