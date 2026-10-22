// backend/shared/atsScorer.js
// Real ATS match score: compares what the JD asks for against the text that is
// actually printed on the generated resume. Pure functions, no I/O.
//
// What it measures (and only this):
//   keywords   – JD skills found anywhere in the resume text (required weighted 2x, "nice to have" 1x)
//   title      – target role terms present in the resume subtitle / job titles
//   experience – years of experience on the resume vs years the JD asks for (only if the JD states it)
//   format     – parse-safety checks (1 page, readable font, contact details, dated roles)
//
// It does NOT know a specific employer's ATS configuration. No tool does; treat
// the number as "how well this resume covers this JD", with the details shown.

import { extractSkills } from './keywords.js';

export const SCORER_VERSION = 2;

const WEIGHTS = { keywords: 65, title: 15, experience: 10, format: 10 };
const REQUIRED_WEIGHT = 2;
const PREFERRED_WEIGHT = 1;

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
  }
  // Skills in the job title are always required.
  extractSkills(targetRole).forEach((s) => requiredHits.add(s));

  const required = [...requiredHits];
  const preferred = [...preferredHits].filter((s) => !requiredHits.has(s));

  return {
    required,
    preferred,
    requiredYears: parseRequiredYears(jd)
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
export function scoreResume({ jobDescription = '', targetRole = '', resume, profile = {}, pdf = {} }) {
  if (!String(jobDescription).trim() && !String(targetRole).trim()) {
    return { score: null, reason: 'Add a job description to get a match score.', version: SCORER_VERSION };
  }

  const jd = analyzeJobDescription(jobDescription, targetRole);
  const resumeSkills = new Set(extractSkills(resume.full));
  const evidenceSkills = new Set(extractSkills(resume.bullets.join(' \n ')));

  // --- keywords -------------------------------------------------------------
  const classify = (skills) => ({
    matched: skills.filter((s) => resumeSkills.has(s)).map((s) => s.label),
    missing: skills.filter((s) => !resumeSkills.has(s)).map((s) => s.label)
  });
  const required = classify(jd.required);
  const preferred = classify(jd.preferred);
  const listedOnly = [...jd.required, ...jd.preferred]
    .filter((s) => resumeSkills.has(s) && !evidenceSkills.has(s))
    .map((s) => s.label);

  const totalWeight = jd.required.length * REQUIRED_WEIGHT + jd.preferred.length * PREFERRED_WEIGHT;
  const gotWeight = required.matched.length * REQUIRED_WEIGHT + preferred.matched.length * PREFERRED_WEIGHT;
  const keywordScore = totalWeight ? pct((gotWeight / totalWeight) * 100) : null;

  // --- title ----------------------------------------------------------------
  const wanted = titleTerms(targetRole);
  const titleText = normalizeTitle([resume.headline, ...resume.roles].join(' '));
  const titleHits = wanted.filter((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.+#]/g, '\\$&')}([^a-z0-9]|$)`).test(titleText));
  let titleScore = null;
  if (String(targetRole).trim()) {
    titleScore = wanted.length
      ? pct((titleHits.length / wanted.length) * 100)
      : (/(developer|engineer)/.test(titleText) ? 100 : 50);
  }

  // --- experience -----------------------------------------------------------
  const haveYears = resumeYears(profile.experience);
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
    { key: 'keywords', label: 'Skill keywords', score: keywordScore,
      detail: totalWeight
        ? `${required.matched.length}/${jd.required.length} required, ${preferred.matched.length}/${jd.preferred.length} nice-to-have`
        : 'No recognisable skills in the JD' },
    { key: 'title', label: 'Job title match', score: titleScore,
      detail: wanted.length ? `${titleHits.length}/${wanted.length} title terms (${wanted.join(', ')})` : 'Generic title' },
    { key: 'experience', label: 'Years of experience', score: experienceScore,
      detail: jd.requiredYears ? `JD asks ${jd.requiredYears}+ yrs, resume shows ${haveYears ?? 'unknown'}` : 'JD does not state years' },
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
  if (listedOnly.length) {
    suggestions.push(`Only in your Skills list, not in any bullet: ${listedOnly.join(', ')}. A bullet showing where you used them reads stronger to recruiters.`);
  }
  if (experienceScore !== null && experienceScore < 100) {
    suggestions.push(`The JD asks for ${jd.requiredYears}+ years; your dated roles add up to ${haveYears}.`);
  }
  if (titleScore !== null && titleScore < 100 && wanted.length) {
    suggestions.push(`Title terms not on your resume: ${wanted.filter((w) => !titleHits.includes(w)).join(', ')}.`);
  }
  checks.filter((c) => !c.passed).forEach((c) => suggestions.push(`Format: ${c.label.toLowerCase()} — currently failing.`));
  if (pdf.trimmed) {
    suggestions.push('Some lower-ranked bullets were left out to keep one page. They are the ones least related to this JD.');
  }

  // Without JD skills the number rests on title + format only: say so.
  const confidence = keywordScore === null ? 'low' : (jd.required.length + jd.preferred.length) < 4 ? 'medium' : 'high';
  if (confidence === 'low') {
    suggestions.unshift('No recognisable skills found in the job description, so this score only reflects title and format. Paste the full JD for a real match score.');
  }

  return {
    score,
    confidence,
    label: score >= 80 ? 'Strong' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Low',
    breakdown,
    keywords: { required, preferred, listedOnly },
    experience: { requiredYears: jd.requiredYears, resumeYears: haveYears },
    checks: checks.map(({ weight, ...c }) => c),
    suggestions,
    pdf: { pages: pdf.pages, bodyPt: pdf.bodyPt, trimmed: Boolean(pdf.trimmed) },
    version: SCORER_VERSION
  };
}
