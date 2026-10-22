// Resolve role/company for a target or JD, and clean scraped company names.
// Used by the cron, the resume routes and target creation so they all agree.

const PLACEHOLDER_ROLES = new Set([
  'software developer', 'software engineer', 'software developer | frontend / full stack'
]);
const PLACEHOLDER_COMPANIES = new Set(['', 'target company', 'your company', 'tech corp', 'company', 'unknown company']);

/** "Sasken Technologies3.5689 Reviews" -> "Sasken Technologies" */
export function cleanCompanyName(name = '') {
  return String(name || '')
    .replace(/\s*\d+(\.\d+)?\s*(k\+?\s*)?(reviews?|ratings?)\b.*$/i, '') // trailing rating/review counts
    .replace(/\s*\d\.\d+\s*$/, '')                                       // trailing bare rating "4.3"
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isPlaceholderCompany(name = '') {
  return PLACEHOLDER_COMPANIES.has(cleanCompanyName(name).toLowerCase());
}

const fromJd = (jd = '', label) => {
  const m = String(jd || '').match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'));
  return m ? m[1].trim() : '';
};

export function resolveRole(role = '', jobDescription = '', fallback = 'Software Developer') {
  const r = (role || '').trim();
  if (r && !PLACEHOLDER_ROLES.has(r.toLowerCase())) return r;
  return fromJd(jobDescription, 'Role') || r || fallback;
}

/** Returns '' when no real company is known — callers decide the wording. */
export function resolveCompany(company = '', jobDescription = '') {
  if (!isPlaceholderCompany(company)) return cleanCompanyName(company);
  const fromText = cleanCompanyName(fromJd(jobDescription, 'Company'));
  return isPlaceholderCompany(fromText) ? '' : fromText;
}