// backend/shared/resumeAdditions.js
// Applies "Add missing" choices to a master resume: a JD term the user really
// has goes into the Skills list (visible, partial credit) or into a one-line
// bullet under a role/project they choose (visible, full credit).
// Nothing is hidden and nothing is added without the user's own words/choice.
// Pure functions, no I/O.

import { findSkill } from './keywords.js';
import { termShownIn } from './jdTerms.js';

export const MAX_ADDITIONS = 20;
export const BULLET_MIN = 15;
export const BULLET_MAX = 220;

// Which existing skills group a new item belongs in (by keywords.js group).
const GROUP_HINTS = {
  frontend: /front|ui|web/i,
  backend: /back|server|api/i,
  devops: /devops|cloud|infra|tools/i,
  testing: /test|qa/i,
  ai: /\bai\b|ml|machine|llm/i,
  general: /engineering|practices|methodolog|other|general/i
};
const FALLBACK_GROUP = 'Additional Skills';

function pickGroup(skills, label) {
  const known = findSkill(label);
  const hint = GROUP_HINTS[known?.group || 'general'];
  return skills.find((g) => hint.test(g.category || ''))
    || skills.find((g) => GROUP_HINTS.general.test(g.category || ''))
    || null;
}

/** Add a skill to the best-matching group (once). Returns the group name, or '' if already listed. */
function addSkill(skills, label) {
  if (skills.some((g) => g.items.some((it) => it.toLowerCase() === label.toLowerCase()))) return '';
  let group = pickGroup(skills, label);
  if (!group) {
    group = skills.find((g) => g.category === FALLBACK_GROUP) || { category: FALLBACK_GROUP, items: [] };
    if (!skills.includes(group)) skills.push(group);
  }
  group.items.push(label);
  return group.category;
}

/** "exp:0" / "proj:2" -> { list: 'experience'|'projects', index } */
function parseTarget(target = '') {
  const m = String(target).match(/^(exp|proj):(\d+)$/);
  return m ? { list: m[1] === 'exp' ? 'experience' : 'projects', index: Number(m[2]) } : null;
}

/**
 * @param {object} master  current master resume
 * @param {Array<{ term: string, mode: 'skill'|'bullet', bullet?: string, target?: string }>} additions
 * @returns {{ update: { skills, experience, projects }, added: string[], errors: string[] }}
 *          `update` holds only the three fields to save. Nothing is applied if `errors` is not empty.
 */
export function applyAdditions(master = {}, additions = []) {
  const errors = [];
  const added = [];
  const skills = (master.skills || []).map((g) => ({ category: g.category, items: [...(g.items || [])] }));
  const experience = (master.experience || []).map((e) => ({ ...e, highlights: [...(e.highlights || [])] }));
  const projects = (master.projects || []).map((p) => ({ ...p, highlights: [...(p.highlights || [])] }));

  if (!Array.isArray(additions) || !additions.length) errors.push('Choose at least one term to add.');
  if (additions.length > MAX_ADDITIONS) errors.push(`Add at most ${MAX_ADDITIONS} terms at a time.`);

  for (const a of errors.length ? [] : additions) {
    const term = String(a?.term || '').trim();
    if (!term || term.length > 60) { errors.push('Each term must be 1–60 characters.'); continue; }

    if (a.mode === 'skill') {
      const where = addSkill(skills, findSkill(term)?.label || term);
      if (where) added.push(`${findSkill(term)?.label || term} → Skills (${where})`);
    } else if (a.mode === 'bullet') {
      const bullet = String(a.bullet || '').replace(/^\s*[•\-–*]\s*/, '').replace(/\s+/g, ' ').trim();
      const t = parseTarget(a.target);
      const entry = t && (t.list === 'experience' ? experience : projects)[t.index];
      if (!entry) { errors.push(`"${term}": choose the role or project this bullet belongs to.`); continue; }
      if (bullet.length < BULLET_MIN || bullet.length > BULLET_MAX) {
        errors.push(`"${term}": write one line between ${BULLET_MIN} and ${BULLET_MAX} characters.`);
        continue;
      }
      if (!termShownIn(term, bullet)) {
        errors.push(`"${term}": mention it in the sentence (use the JD's word) so an ATS can find it.`);
        continue;
      }
      if (!entry.highlights.some((h) => h.toLowerCase() === bullet.toLowerCase())) entry.highlights.push(bullet);
      // A named tool also goes in the Skills list, so it still counts on jobs
      // where this bullet doesn't make the one-page cut.
      if (findSkill(term)) addSkill(skills, findSkill(term).label);
      added.push(`${term} → bullet in ${entry.role || entry.name || 'entry'}${entry.company ? ` at ${entry.company}` : ''}`);
    } else {
      errors.push(`"${term}": choose "Skills list" or "Bullet".`);
    }
  }
  return { update: { skills, experience, projects }, added, errors };
}

/** Roles and projects the extension can offer as bullet targets. */
export function additionTargets(master = {}) {
  return [
    ...(master.experience || []).map((e, i) => ({ key: `exp:${i}`, label: [e.role, e.company].filter(Boolean).join(' at ') || `Role ${i + 1}` })),
    ...(master.projects || []).map((p, i) => ({ key: `proj:${i}`, label: `Project: ${p.name || i + 1}` }))
  ];
}
