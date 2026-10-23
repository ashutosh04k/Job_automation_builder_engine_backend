// backend/shared/linkedinJobs.js
// Helpers for LinkedIn jobs collected by the Chrome extension from the user's
// own LinkedIn search: the search to run (from the master resume), cleaning
// what the extension sends, and "3 days ago" -> a date. Pure functions, no I/O.

import { extractSkills, detectRoleFocus } from './keywords.js';

export const DEFAULT_DAYS = 3;
export const MIN_JD_FOR_SCORE = 300; // shorter than this is a card summary, not a job description
const MAX_JD = 20000;

const SEARCH_WORTHY = new Set([
  'React.js', 'Next.js', 'Angular', 'Vue.js', 'React Native', 'Node.js', 'TypeScript', 'JavaScript',
  'Python', 'Java', 'Go', 'C#', 'PHP', 'Ruby on Rails', 'Django', 'Spring Boot', 'Flutter', 'Kotlin', 'Swift', 'NestJS'
]);
const FOCUS_LABEL = { frontend: 'Frontend Developer', backend: 'Backend Developer', fullstack: 'Full Stack Developer' };

/** LinkedIn job search URL: newest first, posted in the last `days` days. */
export function linkedInSearchUrl(keywords = '', location = '', days = DEFAULT_DAYS) {
  const p = new URLSearchParams({
    keywords: String(keywords).trim(),
    location: String(location).trim(),
    f_TPR: `r${Math.max(1, Math.round(days)) * 86400}`,
    sortBy: 'DD'
  });
  return `https://www.linkedin.com/jobs/search/?${p.toString()}`;
}

/**
 * Searches that fit the master resume: the role it targets plus its most-used skills.
 * @returns {{ location: string, days: number, searches: {label, keywords, url}[] }}
 */
export function buildSearchPlan(master = {}, { days = DEFAULT_DAYS } = {}) {
  const bullets = [
    ...(master.experience || []).flatMap((e) => e.highlights || []),
    ...(master.projects || []).flatMap((p) => p.highlights || [])
  ].join('\n');
  const listed = (master.skills || []).flatMap((g) => g.items || []).join(', ');
  const rawTitle = String(master.title || master.experience?.[0]?.role || 'Software Developer');
  const title = rawTitle.split(/\s*[|—–]\s*/)[0].trim() || 'Software Developer';

  // Most used skills: how many bullets mention each (a Skills-list entry counts half).
  const counts = new Map();
  for (const line of bullets.split('\n')) for (const s of extractSkills(line)) counts.set(s, (counts.get(s) || 0) + 1);
  for (const s of extractSkills(listed)) counts.set(s, (counts.get(s) || 0) + 0.5);
  const focusKey = detectRoleFocus(rawTitle, `${bullets}\n${listed}`);
  const focus = FOCUS_LABEL[focusKey];
  // Only main languages/frameworks make good search words ("Express" or "Git" don't).
  const groupOrder = focusKey === 'backend' ? ['backend', 'frontend'] : ['frontend', 'backend'];
  const rankOf = (skill) => { const i = groupOrder.indexOf(skill.group); return i === -1 ? groupOrder.length : i; };
  const top = [...counts.entries()]
    .filter(([s]) => SEARCH_WORTHY.has(s.label))
    .sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || b[1] - a[1])
    .map(([s]) => ({ 'React.js': 'React', 'Vue.js': 'Vue' }[s.label] || s.label));
  const seen = new Set();
  const searches = [
    { label: `${focus} + ${top[0] || ''}`.replace(/ \+ $/, ''), keywords: [focus, top[0]].filter(Boolean).join(' ') },
    { label: title, keywords: title },
    { label: `${title} + ${top[1] || top[0] || ''}`.replace(/ \+ $/, ''), keywords: [title, top[1] || top[0]].filter(Boolean).join(' ') }
  ].filter((s) => s.keywords && !seen.has(s.keywords.toLowerCase()) && seen.add(s.keywords.toLowerCase()));

  const location = String(master.location || '').trim() || 'India';
  return {
    location,
    days,
    searches: searches.map((s) => ({ ...s, url: linkedInSearchUrl(s.keywords, location, days) }))
  };
}

/** "3 days ago", "Reposted 2 weeks ago", "5 hours ago", "just now" -> Date, or null. */
export function parsePostedAgo(text = '', now = new Date()) {
  const t = String(text).toLowerCase();
  if (/just now|moments? ago|few seconds/.test(t)) return new Date(now);
  const m = t.match(/(\d+)\s*(minute|min|hour|hr|day|week|wk|month|mo)s?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unitMs = {
    minute: 6e4, min: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5, wk: 6048e5, month: 2592e6, mo: 2592e6
  }[m[2]];
  return new Date(now.getTime() - n * unitMs);
}

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Clean one job sent by the extension. Returns null if it isn't a usable LinkedIn job.
 * Only https linkedin.com job links are kept; text is trimmed to sane lengths.
 */
export function sanitizeScannedJob(raw = {}, now = new Date()) {
  const jobId = str(raw.jobId, 40);
  const title = str(raw.title, 200);
  if (!/^\d{5,20}$/.test(jobId) || title.length < 2) return null;

  let jobUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
  try {
    const u = new URL(String(raw.jobUrl || ''));
    if (u.protocol === 'https:' && /(^|\.)linkedin\.com$/.test(u.hostname)) jobUrl = `${u.origin}${u.pathname}`;
  } catch { /* keep the canonical URL */ }

  const description = String(raw.jobDescription || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_JD);
  const postedTime = str(raw.postedTime, 60);
  const postedAt = parsePostedAgo(postedTime, now);
  const isEasy = Boolean(raw.isEasyApply || raw.applyType === 'easy_apply');

  return {
    jobId,
    title,
    company: str(raw.company, 120),
    location: str(raw.location, 120),
    jobUrl,
    applyType: isEasy ? 'easy_apply' : 'external',
    isEasyApply: isEasy,
    postedTime,
    postedAt: postedAt ? postedAt.toISOString() : null,
    jobDescription: description
  };
}
