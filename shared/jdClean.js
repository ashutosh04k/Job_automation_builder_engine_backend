// backend/shared/jdClean.js
// Text copied from a careers page carries the whole page: menus, buttons, cookie
// banners, "Similar jobs" lists and the footer. Scoring that text turns
// "APPLY NOW" or another job's title into "missing skills". This keeps only the
// job description itself. Pure function, no I/O.

// A whole line that is only a site button / menu item.
const UI_LINE = new RegExp('^(?:' + [
  'apply(?: now| for this (?:job|position|role)| on company (?:site|website))?',
  'easy apply', 'quick apply', 'i\'m interested', 'im interested',
  'sign ?in', 'log ?in', 'log ?out', 'sign ?up', 'register', 'create (?:an )?account',
  'saved jobs?', 'save(?: (?:this )?job)?', 'unsave', 'share(?: (?:this )?job)?', 'share on \\w+', 'copy link', 'email (?:this )?job',
  'print(?: (?:this )?job)?', 'refer a friend', 'report (?:this )?job',
  'back(?: to (?:search|jobs|results|job search|all jobs))?', 'return to (?:search|jobs|results)',
  'previous(?: job)?', 'next(?: job)?', 'close', 'menu', 'home', 'careers?', 'search(?: jobs)?', 'find jobs',
  'learn more', 'read more', 'read less', 'show (?:more|less|all)', 'see (?:more|all)(?: jobs)?', 'view (?:more|all)(?: jobs)?',
  'view (?:job|details)', 'load more', 'more jobs', 'join (?:us|our team|our talent (?:community|network))',
  'job alerts?', 'create (?:a )?job alert', 'get job alerts', 'follow(?: us)?', 'connect with us',
  'accept(?: all)?(?: cookies)?', 'reject(?: all)?(?: cookies)?', 'decline(?: all)?', 'cookie settings', 'manage cookies',
  'cookie preferences', 'privacy policy', 'terms(?: of use| and conditions)?', 'skip to (?:main )?content',
  'go to top', 'back to top', 'english', 'language'
].join('|') + ')[\\s.!:>»→›-]*$', 'i');

// From here on it is another job, another page or the footer.
const STOP_LINE = /^(?:similar jobs?|related jobs?|recommended jobs?|other jobs?|more jobs(?: like this)?|jobs you (?:may|might) (?:also )?like|people (?:also )?(?:viewed|applied)|recently viewed(?: jobs)?|explore (?:more|similar) jobs|you may also be interested in|similar (?:roles|positions|opportunities)|©|copyright\b)/i;

const COOKIE_LINE = /\bcookies?\b.*\b(?:we use|use of|accept|consent|preferences|privacy|experience)\b|\b(?:we use|accept)\b.*\bcookies?\b/i;
const JOB_ID_LINE = /^(?:(?:job|req(?:uisition)?|posting|reference|ref)\.?\s*(?:id|no\.?|number|#)?\s*[:#]?\s*)?[A-Z]{0,4}[-_]?\d{5,}$/i;
const URL_LINE = /^(?:https?:\/\/|www\.)\S+$/i;
const POSTED_LINE = /^(?:posted|updated|reposted)\s+(?:on\s+)?(?:\d+\s+\w+\s+ago|today|yesterday|\d{1,2}[\s/-]\w+[\s/-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})\.?$/i;
const APPLICANTS_LINE = /^(?:over\s+)?\d+\+?\s+(?:applicants?|people clicked apply|clicks?)\b.*$/i;

/**
 * @param {string} text  JD or whole-page text
 * @returns {string} the JD without page chrome (unchanged text if nothing to remove)
 */
export function cleanJobDescription(text = '') {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());

  // Cut the tail ("Similar jobs", footer) only once we are past the first 30% of
  // the text, so a page that opens with a small "Similar jobs" widget keeps its JD.
  const minCut = Math.floor(lines.length * 0.3);
  let end = lines.length;
  for (let i = minCut; i < lines.length; i++) {
    if (STOP_LINE.test(lines[i])) { end = i; break; }
  }

  const kept = [];
  for (const line of lines.slice(0, end)) {
    if (!line) { if (kept.length && kept[kept.length - 1] !== '') kept.push(''); continue; }
    if (UI_LINE.test(line) || JOB_ID_LINE.test(line) || URL_LINE.test(line)
      || POSTED_LINE.test(line) || APPLICANTS_LINE.test(line)) continue;
    if (COOKIE_LINE.test(line) && line.length < 400) continue;
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  const out = kept.join('\n');
  // Never return nothing: a JD that is all short lines is better than an empty one.
  return out.trim() ? out : String(text || '').trim();
}
