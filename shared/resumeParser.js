// backend/shared/resumeParser.js
// Turns positioned PDF lines (services/pdfTextService.js) into a master-resume
// draft: header, summary, experience, skills, education, projects,
// certifications, achievements. Pure functions, no I/O.
//
// Parsing a PDF is heuristic. The result is a DRAFT the user reviews before
// saving; anything not understood is returned in `unparsed` and `warnings`.

import { findSkill } from './keywords.js';

const SECTION_ALIASES = {
  summary: ['summary', 'professional summary', 'profile', 'profile summary', 'about me', 'about', 'objective', 'career objective', 'career summary'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'internships', 'internship', 'internship experience', 'experience and internships'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'skills and tools', 'technologies', 'tech stack', 'core competencies', 'technical proficiency', 'tools and technologies', 'skill set'],
  education: ['education', 'academic background', 'academics', 'educational qualification', 'qualifications', 'academic qualifications'],
  projects: ['projects', 'personal projects', 'key projects', 'academic projects', 'side projects', 'selected projects', 'project experience'],
  certifications: ['certifications', 'certificates', 'courses', 'licenses and certifications', 'certifications and courses'],
  achievements: ['achievements', 'awards', 'honors', 'honours', 'accomplishments', 'awards and achievements', 'achievements and awards']
};
const HEADING_INDEX = new Map(
  Object.entries(SECTION_ALIASES).flatMap(([key, names]) => names.map((n) => [n, key]))
);

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s*'?\\d{2,4}|\\d{1,2}[/.-]\\d{2,4}|(?:19|20)\\d{2})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|till date|ongoing)`, 'i');
const BULLET_RE = /^\s*(?:[•●▪◦‣∙·■□➢➤►\-–*]|\d{1,2}[.)])\s+/;
const ROLE_RE = /\b(developer|engineer|intern|internship|manager|lead|analyst|designer|architect|consultant|specialist|scientist|sde|head|director|officer|associate|executive|trainee|administrator|programmer|founder|co-founder|cto|ceo|freelancer?|member|assistant|coordinator|researcher)\b/i;
const DEGREE_RE = /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|bachelor|master|mba|bba|b\.?\s?sc|m\.?\s?sc|bca|mca|ph\.?\s?d|diploma|doctorate|class\s*(x|xii|10|12)|1[02]th|senior secondary|secondary|high school|hsc|ssc|cbse|icse|b\.?\s?com|m\.?\s?com|b\.?\s?a\b|m\.?\s?a\b)/i;
const SCORE_RE = /\(?\s*((?:c?gpa|sgpa|cpi|percentage|score|marks)\s*[:\-]?\s*[\d.]+\s*(?:\/\s*\d+(?:\.\d+)?)?|[\d.]+\s*%|[\d.]+\s*\/\s*10)\s*\)?/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{8,}\d)/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|,)]*)?/gi;

const clean = (s = '') => String(s).replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
const stripBullet = (s = '') => s.replace(BULLET_RE, '').trim();
const normalizeHeading = (s = '') => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

function headingKey(line) {
  const text = line.text.replace(/\t/g, ' ').trim();
  if (text.length > 40 || BULLET_RE.test(text)) return null;
  return HEADING_INDEX.get(normalizeHeading(text).replace(/:$/, '')) || null;
}

/** Split "Software Developer at Acme" / "Acme | Software Developer" into role + company (+ location). */
export function splitRoleCompany(text = '') {
  const t = clean(text);
  let parts = t.split(/\s+(?:at|@)\s+/i);
  if (parts.length < 2) parts = t.split(/\s*[|•·]\s*|\s+[—–-]\s+|,\s+(?=[A-Z])/);
  parts = parts.map(clean).filter(Boolean);
  if (parts.length === 1) return ROLE_RE.test(parts[0]) ? { role: parts[0], company: '', location: '' } : { role: '', company: parts[0], location: '' };
  const roleIdx = parts.findIndex((p) => ROLE_RE.test(p));
  const ri = roleIdx === -1 ? 0 : roleIdx;
  const role = parts[ri];
  const rest = parts.filter((_, i) => i !== ri);
  return { role, company: rest[0] || '', location: rest.slice(1).join(', ') };
}

/** Pull a date range out of a line: { period, rest } */
function takePeriod(text) {
  const t = text.replace(/\t/g, '  ');
  const m = t.match(RANGE_RE);
  if (m) return { period: clean(m[0]).replace(/\s*(?:-|–|—|to)\s*/i, ' - '), rest: clean(t.replace(m[0], ' ').replace(/[|,–—-]\s*$/, '')) };
  return { period: '', rest: clean(t) };
}

/**
 * Is `line` the wrapped continuation of the bullet `prev`?
 * Yes if it has a hanging indent, starts lowercase, or the bullet hasn't
 * finished its sentence — unless it looks like the next entry's header
 * (short, capitalised, with a date on it or on the next line).
 */
function isContinuation(line, prevText, bulletX, nextLine) {
  if (BULLET_RE.test(line.text) || RANGE_RE.test(line.text) || headingKey(line)) return false;
  if (bulletX !== null && line.x > bulletX + 2) return true;
  const t = line.text.trim();
  if (/^[a-z0-9(&,%]/.test(t)) return true;
  const looksLikeHeader = /^[A-Z]/.test(t) && t.length < 70 && nextLine && RANGE_RE.test(nextLine.text);
  if (looksLikeHeader) return false;
  return !/[.!?;:)]$/.test(prevText.trim());
}

// Lines belonging to bulleted items (bullet + wrapped continuation lines).
function groupBullets(lines) {
  const out = [];
  let bulletX = null;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (BULLET_RE.test(l.text)) {
      out.push(stripBullet(l.text.replace(/\t/g, ' ')));
      bulletX = l.x;
    } else if (out.length && isContinuation(l, out[out.length - 1], bulletX, lines[k + 1])) {
      out[out.length - 1] = clean(`${out[out.length - 1]} ${l.text.replace(/\t/g, ' ')}`);
    } else {
      return { bullets: out, rest: lines.slice(k) };
    }
  }
  return { bullets: out, rest: [] };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function parseHeader(lines, bodySize) {
  const header = { fullName: '', title: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' };
  if (!lines.length) return header;

  const nameLine = [...lines].sort((a, b) => b.size - a.size)[0];
  header.fullName = clean(nameLine.text.replace(/\t/g, ' '))
    .toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (nameLine.links[0] && !/linkedin|github|mailto:|tel:/i.test(nameLine.links[0])) header.website = nameLine.links[0];

  for (const l of lines) {
    if (l === nameLine) continue;
    // Only header-sized text counts; tiny or hidden-looking text is ignored.
    if (bodySize && l.size < bodySize * 0.85) continue;
    const text = l.text.replace(/\t/g, ' | ');
    const links = l.links || [];
    for (const u of links) {
      if (/^mailto:/i.test(u) && !header.email) header.email = u.replace(/^mailto:/i, '').split('?')[0];
      else if (/^tel:/i.test(u) && !header.phone) header.phone = u.replace(/^tel:/i, '');
      else if (/linkedin\.com/i.test(u) && !header.linkedin) header.linkedin = u;
      else if (/github\.com/i.test(u) && !header.github) header.github = u;
      else if (/^https?:/i.test(u) && !header.website) header.website = u;
    }
    const email = text.match(EMAIL_RE);
    if (email && !header.email) header.email = email[0];
    const phone = text.replace(EMAIL_RE, '').match(PHONE_RE);
    if (phone && !header.phone) header.phone = clean(phone[0]);
    for (const u of text.match(URL_RE) || []) {
      if (EMAIL_RE.test(u)) continue;
      const url = /^https?:/i.test(u) ? u : `https://${u}`;
      if (/linkedin\.com/i.test(u) && !header.linkedin) header.linkedin = url;
      else if (/github\.com/i.test(u) && !header.github) header.github = url;
    }
    const segments = text.split(/\s*[|•·]\s*/).map(clean).filter(Boolean);
    const isContactLine = Boolean(email || phone || links.length) || segments.some((s) => /linkedin|github|portfolio|mail/i.test(s));
    if (isContactLine) {
      const loc = segments.find((s) => /^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(s) && !EMAIL_RE.test(s));
      if (loc && !header.location) header.location = loc;
    } else if (!header.title) {
      header.title = clean(text.replace(/\s*\|\s*/g, ' | ').replace(/\s*—\s*/g, ' | '));
    }
  }
  return header;
}

function parseExperience(lines) {
  const entries = [];
  let pending = [];
  let current = null;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (BULLET_RE.test(l.text)) {
      const { bullets, rest } = groupBullets(lines.slice(i));
      if (!current) {
        current = { company: '', role: '', period: '', location: '', highlights: [] };
        entries.push(current);
      }
      current.highlights.push(...bullets);
      i = lines.length - rest.length;
      continue;
    }
    const { period, rest } = takePeriod(l.text);
    if (period) {
      const headerText = [...pending.map((p) => takePeriod(p.text).rest), rest].filter(Boolean).join(' | ');
      const split = splitRoleCompany(headerText);
      current = { ...split, period, highlights: [] };
      entries.push(current);
      pending = [];
    } else if (current && current.highlights.length === 0 && pending.length === 0 && !current.company && rest) {
      current.company = rest; // "Role  date" then "Company" on the next line
    } else if (current && current.highlights.length === 0 && rest && !current.location && /remote|india|usa|uk|,/i.test(rest) && rest.length < 40) {
      current.location = rest;
    } else {
      pending.push(l);
    }
    i++;
  }
  // Leftover header lines with no date: still an entry, flagged by missing period.
  if (pending.length) {
    const split = splitRoleCompany(pending.map((p) => p.text.replace(/\t/g, ' ')).join(' | '));
    entries.push({ ...split, period: '', highlights: [] });
  }
  return entries.filter((e) => e.role || e.company || e.highlights.length);
}

function parseProjects(lines) {
  const projects = [];
  let current = null;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (BULLET_RE.test(l.text)) {
      const { bullets, rest } = groupBullets(lines.slice(i));
      if (!current) { current = { name: 'Project', link: '', technologies: [], highlights: [] }; projects.push(current); }
      current.highlights.push(...bullets);
      i = lines.length - rest.length;
      continue;
    }
    const raw = l.text.replace(/\t+/g, ' \t ');
    const techLabel = raw.match(/^(?:tech(?:nologies)?|stack|tools|built with)\s*[:\-]\s*(.+)$/i);
    if (techLabel && current) {
      current.technologies.push(...techLabel[1].split(/\s*[,|/]\s*/).map(clean).filter(Boolean));
      i++;
      continue;
    }
    const urlOnly = clean(raw.replace(/\t/g, ' '));
    if (current && /^(?:https?:\/\/|www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i.test(urlOnly)) {
      if (!current.link) current.link = /^https?:/i.test(urlOnly) ? urlOnly : `https://${urlOnly}`;
      i++;
      continue;
    }
    const [left] = raw.split('\t');
    const parts = left.split(/\s+[—–|]\s+|\s+-\s+|\s*\|\s*/).map(clean).filter(Boolean);
    let name = parts[0] || clean(left);
    let tech = parts.slice(1).join(', ');
    const paren = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!tech && paren && /,/.test(paren[2])) { name = paren[1]; tech = paren[2]; }
    // A link is an annotation URL, or text with a path / scheme ("Socket.IO" is not a link).
    const url = (l.links || []).find((u) => /^https?:/i.test(u)) || (raw.match(URL_RE) || []).find((u) => /\/|^www\./i.test(u)) || '';
    current = {
      name: clean(name.replace(URL_RE, '')),
      link: url && !/^https?:/i.test(url) ? `https://${url}` : url,
      technologies: tech.split(/\s*[,/]\s*/).map(clean).filter((t) => t && t.length < 40),
      highlights: []
    };
    projects.push(current);
    i++;
  }
  return projects.filter((p) => p.name || p.highlights.length);
}

function parseSkills(lines) {
  const groups = [];
  for (const l of lines) {
    const raw = stripBullet(l.text);
    const tab = raw.split('\t');
    const colon = raw.match(/^([A-Za-z][A-Za-z &/+.-]{1,40}?)\s*:\s*(.+)$/);
    let category = '';
    let itemsText = raw.replace(/\t/g, ' ');
    if (colon) { category = colon[1]; itemsText = colon[2]; }
    else if (tab.length > 1 && tab[0].length <= 40) { category = tab[0]; itemsText = tab.slice(1).join(' '); }
    else if (groups.length && (/,\s*$/.test(groups[groups.length - 1]._last) || l.x > groups[groups.length - 1]._x + 2)) {
      // wrapped continuation of the previous row
      const g = groups[groups.length - 1];
      g.items.push(...splitItems(itemsText));
      g._last = itemsText;
      continue;
    }
    if (!category) {
      const guess = guessLabel(itemsText);
      if (guess) { category = guess.category; itemsText = guess.items; }
    }
    groups.push({ category: clean(category) || 'Skills', items: splitItems(itemsText), _last: itemsText, _x: l.x });
  }
  // merge duplicate "Skills" groups
  const merged = [];
  for (const g of groups) {
    const same = merged.find((m) => m.category.toLowerCase() === g.category.toLowerCase());
    if (same) same.items.push(...g.items); else merged.push({ category: g.category, items: g.items });
  }
  return merged.map((g) => ({ ...g, items: [...new Set(g.items)] })).filter((g) => g.items.length);
}

// "Cloud / DevOps AWS, Docker" has no separator between label and items.
// Take 1-4 leading words as the label; prefer the split where the first item is a known skill.
function guessLabel(text = '') {
  if (!/,/.test(text)) return null;
  const words = text.trim().split(/\s+/);
  let fallback = null;
  for (let k = 1; k <= Math.min(4, words.length - 1); k++) {
    const category = words.slice(0, k).join(' ');
    const items = words.slice(k).join(' ');
    if (/[/&,]$/.test(category) || /^[/&,]/.test(items) || /,/.test(category) || !/^[A-Z]/.test(category)) continue;
    const firstItem = items.split(/\s*[,;|]\s*/)[0];
    if (findSkill(firstItem)) return { category, items };
    if (!fallback && k === 1) fallback = { category, items };
  }
  return fallback;
}

function splitItems(text = '') {
  return text.split(/\s*[,;|•·]\s*/).map((s) => clean(s).replace(/^and\s+/i, '')).filter((s) => s && s.length <= 60);
}

function parseEducation(lines) {
  const entries = [];
  for (const l of lines) {
    const raw = stripBullet(l.text).replace(/\t/g, '  ');
    const startsEntry = DEGREE_RE.test(raw) || !entries.length;
    const { period, rest } = takePeriod(raw);
    const year = period || (rest.match(/\b(?:19|20)\d{2}\b(?:\s*[-–]\s*\b(?:19|20)\d{2}\b)?/) || [''])[0];
    let body = rest.replace(year, ' ');
    const score = (body.match(SCORE_RE) || [''])[0];
    body = clean(body.replace(score, ' ').replace(/\(\s*\)/g, ''));
    if (startsEntry) {
      const parts = body.split(/\s*,\s*|\s+[|—–]\s+|\s+-\s+|\s+(?:from|at)\s+/i).map(clean).filter(Boolean);
      const degIdx = Math.max(0, parts.findIndex((p) => DEGREE_RE.test(p)));
      entries.push({
        degree: parts[degIdx] || body,
        institution: parts.filter((_, k) => k !== degIdx).join(', '),
        period: clean(year),
        score: clean(score.replace(/[()]/g, ''))
      });
    } else {
      const e = entries[entries.length - 1];
      if (!e.institution && body) e.institution = body;
      else if (body && !e.degree) e.degree = body;
      if (!e.period && year) e.period = clean(year);
      if (!e.score && score) e.score = clean(score.replace(/[()]/g, ''));
    }
  }
  return entries;
}

function parseList(lines) {
  const { bullets, rest } = groupBullets(lines);
  return [...bullets, ...rest.map((l) => clean(l.text.replace(/\t/g, ' ')))].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {Array<{text:string,x:number,size:number,links:string[]}>} lines
 * @returns {{ draft: object, warnings: string[], unparsed: string[], stats: object }}
 */
export function parseResumeLines(lines = []) {
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const bodySize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;

  const buckets = { header: [] };
  let section = 'header';
  const order = [];
  for (const l of lines) {
    const key = headingKey(l);
    if (key) { section = key; order.push(key); buckets[key] = buckets[key] || []; continue; }
    if (/^(languages|interests|hobbies|references|declaration|extracurricular|volunteer|publications)\b/i.test(normalizeHeading(l.text)) && l.text.length < 40 && !BULLET_RE.test(l.text)) {
      section = 'unparsed'; buckets.unparsed = buckets.unparsed || []; continue;
    }
    // Ignore tiny text anywhere (often hidden or footer text).
    if (l.size && l.size < bodySize * 0.8 && section !== 'header') continue;
    (buckets[section] = buckets[section] || []).push(l);
  }

  const header = parseHeader(buckets.header || [], bodySize);
  const draft = {
    ...header,
    summary: clean((buckets.summary || []).map((l) => l.text.replace(/\t/g, ' ')).join(' ')),
    experience: parseExperience(buckets.experience || []),
    skills: parseSkills(buckets.skills || []),
    education: parseEducation(buckets.education || []),
    projects: parseProjects(buckets.projects || []),
    certifications: parseList(buckets.certifications || []),
    achievements: parseList(buckets.achievements || [])
  };

  const warnings = [];
  if (!draft.fullName) warnings.push('Could not find your name at the top of the PDF.');
  if (!draft.email) warnings.push('No email address found.');
  if (!buckets.experience) warnings.push('No "Experience" section heading found. Add your roles manually.');
  draft.experience.forEach((e, k) => {
    if (!e.period) warnings.push(`Experience #${k + 1} (${e.role || e.company || 'unnamed'}) has no dates.`);
    if (!e.role || !e.company) warnings.push(`Experience #${k + 1}: check the role and company split ("${e.role}" / "${e.company}").`);
  });
  if (!buckets.skills) warnings.push('No "Skills" section heading found.');

  const bullets = draft.experience.reduce((n, e) => n + e.highlights.length, 0)
    + draft.projects.reduce((n, p) => n + p.highlights.length, 0);

  return {
    draft,
    warnings,
    unparsed: (buckets.unparsed || []).map((l) => clean(l.text.replace(/\t/g, ' '))),
    stats: {
      sections: order,
      roles: draft.experience.length,
      projects: draft.projects.length,
      bullets,
      skills: draft.skills.reduce((n, g) => n + g.items.length, 0)
    }
  };
}
