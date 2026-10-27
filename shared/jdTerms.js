// backend/shared/jdTerms.js
// What a JD asks for beyond named tools (those live in keywords.js):
// engineering practices, domain, soft skills, and unknown acronyms (XSS, SDK...).
// Commercial ATS checkers count these too; ignoring them made our score too generous.
// Pure functions, no I/O.

import { hasTerm, extractSkills, findSkillSpans, SKILLS } from './keywords.js';

/** Practices / concepts / domain. `jd` = how a JD says it, `resume` = what counts as evidence. */
export const CONCEPTS = [
  { label: 'State management', jd: ['state management', 'managing state', 'application state'], resume: ['state management', 'client state', 'application state', 'redux', 'zustand', 'context api', 'rtk query', 'mobx'] },
  { label: 'Reusable components', jd: ['reusable components', 'reusable component', 'component library', 'component libraries', 'front-end libraries', 'frontend libraries', 'shared components'], resume: ['reusable component', 'reusable components', 'component library', 'shared components'] },
  { label: 'Design system', jd: ['design system', 'design systems'], resume: ['design system', 'design systems', 'component library', 'storybook'] },
  { label: 'Micro-frontends', jd: ['micro-frontend', 'micro-frontends', 'micro frontend', 'micro frontends', 'module federation'], resume: ['micro-frontend', 'micro-frontends', 'micro frontend', 'micro frontends', 'module federation'] },
  { label: 'Cross-browser compatibility', jd: ['cross-browser', 'cross browser', 'across browsers', 'browser compatibility', 'devices and browsers'], resume: ['cross-browser', 'cross browser', 'browser compatibility', 'across browsers', 'low-end devices', 'responsive'] },
  { label: 'Integration / E2E testing', jd: ['integration tests', 'integration testing', 'integration test', 'end-to-end testing', 'e2e testing', 'e2e tests'], resume: ['integration test', 'integration tests', 'integration testing', 'end-to-end test', 'e2e', 'cypress', 'playwright'] },
  { label: 'Code reviews', jd: ['code review', 'code reviews', 'peer reviews'], resume: ['code review', 'code reviews', 'reviewed', 'pull request'] },
  { label: 'Debugging', jd: ['debugging', 'troubleshooting', 'troubleshoot'], resume: ['debug', 'debugging', 'troubleshoot', 'troubleshooting', 'root cause', 'eliminating', 'bugs'] },
  { label: 'Scalability', jd: ['scalable', 'scalability', 'at scale', 'high traffic', 'high-traffic'], resume: ['scalable', 'scalability', 'at scale', 'peak traffic', 'high traffic', '10k+', '100k', '200k', 'millions'] },
  { label: 'Web security', jd: ['web security', 'security best practices', 'application security', 'owasp', 'xss', 'csrf', 'secure coding'], resume: ['security', 'secure', 'xss', 'csrf', 'owasp', 'jwt', 'oauth', 'rbac', 'ssl', 'authentication'] },
  { label: 'Authentication', jd: ['authentication', 'authorization', 'sso', 'single sign-on'], resume: ['authentication', 'authorization', 'jwt', 'oauth', 'sso', 'rbac', 'role-based'] },
  { label: 'Architecture', jd: ['architecture', 'architect', 'architecting'], resume: ['architecture', 'architected', 'architecting', 'designed'] },
  { label: 'Mentoring', jd: ['mentor', 'mentoring', 'mentorship', 'guide junior'], resume: ['mentor', 'mentored', 'mentoring', 'mentorship', 'trained'] },
  { label: 'Documentation', jd: ['documentation', 'technical writing', 'write docs'], resume: ['documentation', 'documented', 'docs'] },
  { label: 'Build tooling', jd: ['build tooling', 'build tools', 'bundler', 'bundling'], resume: ['build tooling', 'bundle', 'bundling', 'bundler', 'webpack', 'vite', 'code splitting'] },
  { label: 'Design-to-code', jd: ['wireframes', 'wireframe', 'mockups', 'mock-ups', 'design specs', 'pixel-perfect', 'pixel perfect'], resume: ['figma', 'pixel-perfect', 'pixel-accurate', 'mockups', 'wireframes', 'design specs'] },
  { label: 'Caching', jd: ['caching', 'cache'], resume: ['caching', 'cache', 'redis', 'rtk query'] },
  { label: 'Real-time systems', jd: ['real-time', 'real time', 'realtime'], resume: ['real-time', 'real time', 'realtime', 'websocket', 'websockets', 'socket.io'] },
  { label: 'Data visualization', jd: ['data visualization', 'data visualisation', 'charts', 'd3', 'chart.js', 'recharts'], resume: ['data visualization', 'charts', 'd3', 'chart.js', 'recharts', 'dashboard', 'dashboards'] },
  { label: 'Internationalization', jd: ['i18n', 'internationalization', 'internationalisation', 'localization', 'localisation'], resume: ['i18n', 'internationalization', 'localization', 'timezone', 'multi-language'] },
  { label: 'Analytics', jd: ['analytics', 'google analytics', 'mixpanel', 'amplitude'], resume: ['analytics', 'google analytics', 'mixpanel', 'amplitude', 'tracking'] },
  // Domain
  { label: 'Payments', jd: ['payments', 'payment gateway', 'payment gateways'], resume: ['payment', 'payments', 'stripe', 'razorpay', 'checkout', 'billing'] },
  { label: 'Fintech', jd: ['fintech', 'financial services', 'banking', 'lending'], resume: ['fintech', 'financial', 'banking', 'lending'] },
  { label: 'E-commerce', jd: ['e-commerce', 'ecommerce'], resume: ['e-commerce', 'ecommerce', 'cart', 'checkout'] },
  { label: 'Logistics', jd: ['logistics', 'supply chain', 'fleet management', 'mobility'], resume: ['logistics', 'fleet', 'dispatch', 'delivery', 'route optimization', 'drivers'] },
  { label: 'Healthcare', jd: ['healthcare', 'healthtech', 'health tech', 'medical'], resume: ['healthcare', 'healthtech', 'medical', 'patient'] },
  { label: 'EdTech', jd: ['edtech', 'e-learning', 'learning platform'], resume: ['edtech', 'e-learning', 'learning platform', 'students'] },
  { label: 'SaaS', jd: ['saas', 'b2b'], resume: ['saas', 'b2b', 'multi-tenant', 'enterprise clients'] }
];

/** Soft skills: JD phrasing, and resume wording that shows them (verbs count as evidence). */
export const SOFT_SKILLS = [
  { label: 'Communication', jd: ['communication', 'communicate', 'communicator'], resume: ['communicat', 'present', 'documented', 'documentation', 'stakeholder'] },
  { label: 'Collaboration', jd: ['collaborate', 'collaboration', 'collaborative', 'teamwork', 'team player', 'cross-functional', 'work closely'], resume: ['collaborat', 'cross-functional', 'partnered', 'worked with', 'with product', 'with design', 'with backend'] },
  { label: 'Problem solving', jd: ['problem-solving', 'problem solving', 'analytical', 'solve complex'], resume: ['debug', 'troubleshoot', 'resolved', 'diagnos', 'eliminat', 'root cause', 'fixed'] },
  { label: 'Ownership / leadership', jd: ['ownership', 'take ownership', 'leadership', 'lead a team', 'drive initiatives'], resume: ['owned', 'led', 'lead', 'spearheaded', 'drove', 'mentored', 'architected', 'end-to-end'] },
  { label: 'Attention to detail', jd: ['attention to detail', 'detail-oriented', 'detail oriented'], resume: ['pixel-perfect', 'pixel-accurate', 'accessib', 'aria', 'quality'] }
];

// Uppercase tokens that are not skills (or are too generic to score).
const ACRONYM_STOP = new Set([
  'API', 'APIS', 'UI', 'UX', 'IT', 'HR', 'US', 'USA', 'UK', 'EU', 'UAE', 'OR', 'AND', 'THE', 'CTC', 'LPA', 'WFH', 'WFO', 'NA',
  'CEO', 'CTO', 'CFO', 'COO', 'VP', 'PM', 'BE', 'ME', 'BS', 'MS', 'BA', 'MA', 'MBA', 'PHD', 'IST', 'PST', 'EST', 'GMT', 'AM',
  'ETC', 'TBD', 'FAQ', 'OK', 'ID', 'JD', 'NOTE', 'REQUIREMENTS', 'RESPONSIBILITIES', 'ABOUT', 'ROLE', 'NEW', 'TEAM', 'WE',
  'YOU', 'OUR', 'SDE', 'SWE', 'II', 'III', 'IV', 'FTE', 'INR', 'USD', 'EOE', 'DEI', 'B2C', 'ES6', 'KPI', 'KPIS', 'OKR', 'OKRS',
  'CS', 'BTECH', 'MTECH', 'MCA', 'BCA', 'BSC', 'MSC', 'IIT', 'NIT', 'FAANG', 'MAANG', 'AI', 'ML', 'CSS', 'HTML', 'SQL'
]);
const KNOWN_ALIASES = new Set(SKILLS.flatMap((s) => s.aliases.map((a) => a.toLowerCase())));
const conceptAlias = new Set([...CONCEPTS, ...SOFT_SKILLS].flatMap((c) => c.jd.map((a) => a.toLowerCase())));

const has = (text, needle) => (needle.length <= 4 || !/^[a-z]+$/.test(needle)
  ? hasTerm(text, needle)
  : text.toLowerCase().includes(needle)); // prefix match for stems like "collaborat"

// Ordinary words that job sites print in CAPITALS on buttons, menus and headings
// ("APPLY NOW", "SIGN IN", "SAVED JOBS", "LEARN MORE"). Never skills.
const PLAIN_WORDS = new Set(`
  A AN AS AT BE BY DO GO IF IN IS IT MY NO OF ON OR SO TO UP US WE
  ALL AND ANY ARE BUT CAN FOR GET HAS HER HIM HIS HOW ITS LET MAY NEW NOT NOW OFF ONE OUR OUT OWN PAY PER SEE SHE THE TOP TRY TWO USE WAY WHO WHY YES YET YOU
  ALSO BACK BEST CALL CITY DATE DAYS EACH EASY ELSE FIND FROM FULL GIVE GOOD HELP HERE HOME INFO INTO JOB JOBS JOIN JUST LAST LIKE LIST LIVE LOAD LOG LOGIN
  LOOK MAIN MAKE MANY MENU MORE MOST MUCH MUST NAME NEAR NEED NEWS NEXT ONLY OPEN OVER PAGE PART PLAN PLUS POST READ ROLE SAVE SEND SHOW SIGN SITE SKIP SOON
  SUCH TAKE TERM TEXT THAN THAT THEM THEN THEY THIS TIME TYPE VIEW WANT WELL WERE WHAT WHEN WILL WITH WORK YEAR YEARS YOUR ZERO
  ABOUT ABOVE AFTER AGAIN ALERT APPLY BELOW CHECK CLEAR CLICK CLOSE EMAIL ENTER EVERY FIRST GROUP GUIDE INDIA LEARN LEVEL LOCAL MONTH NEVER OFFER OFTEN OTHER
  PRINT PRIOR RESET RIGHT SAVED SHARE SHIFT SKILL SINCE START STATE STUDY THEIR THERE THESE THINK THOSE TODAY UNDER UNTIL VALUE WHERE WHICH WHILE WOMEN WORLD
  ACCEPT ACCESS ALERTS CAREER CENTER CHANGE COOKIE CREATE DETAIL FILTER FOLLOW GLOBAL HYBRID LOCATE MOBILE NEWEST ONLINE ONSITE OPTION PEOPLE POLICY
  PRIVACY REJECT REMOTE RESUME RETURN SEARCH SELECT SIGNUP SORTBY SUBMIT SUPPORT UPDATE UPLOAD CAREERS CONTACT FEATURED
`.trim().split(/\s+/));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The JD also uses this word in normal case ("Join us", "jobs"), so in capitals it is a label, not an acronym. */
const usedAsWord = (text, t) => [...text.matchAll(new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`, 'gi'))]
  .some((m) => m[0] !== t);

/** A short line written entirely in capitals with 2+ words is a button, menu or heading ("SAVED JOBS", "APPLY NOW"). */
const isShoutyLine = (line) => !/[a-z]/.test(line) && (line.match(/[A-Z]{2,}/g) || []).length >= 2 && line.trim().split(/\s+/).length <= 8;

/**
 * Uppercase terms in the JD we don't otherwise know (XSS, SDK, GDPR...).
 * Skips plain words in capitals, button/menu lines and the company's own name.
 * @param {string} jd
 * @param {{ companyName?: string }} [opts]
 */
export function unknownAcronyms(jd = '', { companyName = '' } = {}) {
  const found = new Set();
  const original = String(jd);
  // Blank out known skills first, so "CI/CD" does not also yield "CI" and "CD".
  let text = original;
  for (const sp of findSkillSpans(text)) text = text.slice(0, sp.start) + ' '.repeat(sp.end - sp.start) + text.slice(sp.end);
  const company = new Set(String(companyName).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 2));
  for (const line of text.split(/\n/)) {
    if (isShoutyLine(line)) continue;
    for (const m of line.matchAll(/(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,5})(?![A-Za-z0-9])/g)) {
      const t = m[1];
      if (ACRONYM_STOP.has(t) || PLAIN_WORDS.has(t) || company.has(t) || /^\d/.test(t)) continue;
      const low = t.toLowerCase();
      if (KNOWN_ALIASES.has(low) || conceptAlias.has(low) || extractSkills(t).length) continue;
      if (usedAsWord(original, t)) continue;
      found.add(t);
    }
  }
  return [...found];
}

/**
 * JD terms beyond named tools, each with whether the resume shows it.
 * @param {{ companyName?: string }} [opts]  the company's own name is never a missing skill
 * @returns {{ concepts: {label,matched}[], soft: {label,matched}[], acronyms: {label,matched}[] }}
 */
export function matchJdTerms(jd = '', resumeText = '', { companyName = '' } = {}) {
  const jdText = String(jd || '');
  const res = String(resumeText || '');
  const check = (list) => list
    .filter((c) => c.jd.some((a) => hasTerm(jdText, a)))
    .map((c) => ({ label: c.label, matched: c.resume.some((a) => has(res, a)) }));
  return {
    concepts: check(CONCEPTS),
    soft: check(SOFT_SKILLS),
    acronyms: unknownAcronyms(jdText, { companyName }).map((t) => ({ label: t, matched: hasTerm(res, t.toLowerCase()) }))
  };
}

/**
 * Does `text` show this term the way the scorer looks for it?
 * Works for tool names (GraphQL), JD terms ("Code reviews"), soft skills and acronyms.
 */
export function termShownIn(label = '', text = '') {
  const skill = SKILLS.find((s) => s.label.toLowerCase() === String(label).toLowerCase());
  if (skill) return skill.aliases.some((a) => hasTerm(text, a));
  const item = [...CONCEPTS, ...SOFT_SKILLS].find((c) => c.label.toLowerCase() === String(label).toLowerCase());
  if (item) return item.resume.some((a) => has(text, a));
  return hasTerm(text, String(label).toLowerCase());
}

/** Practices / domain terms this JD asks for (for ranking bullets by relevance). */
export function jdConcepts(jd = '') {
  return CONCEPTS.filter((c) => c.jd.some((a) => hasTerm(jd, a)));
}

/** How many of those terms a bullet shows. */
export function conceptHits(text = '', concepts = []) {
  return concepts.filter((c) => c.resume.some((a) => has(text, a))).length;
}
