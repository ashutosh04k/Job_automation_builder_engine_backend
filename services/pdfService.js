import PDFDocument from 'pdfkit';
import {
  extractSkills, countMatches, findSkill, detectRoleFocus, highlightSkills, surfaceForm, hasSkill, findSkillSpans
} from '../shared/keywords.js';

/**
 * PDF resume generator (PDFKit).
 *
 * All content comes from the MasterResume document. Nothing personal is
 * hardcoded here. Tailoring = ranking bullets/projects by how many JD skills
 * they mention, bolding matched skills, and a subtitle built only from skills
 * the JD asks for AND the experience bullets prove.
 *
 * One-page fit: first drop the weakest (lowest-ranked) bullets, then shrink
 * slightly. Body text never goes below MIN_BODY_PT.
 */

const FS_BASE = {
  name: 20,
  subtitle: 11,
  contact: 10.5,
  section: 11.5,
  entryHeader: 11,
  body: 10.5,
  small: 10.5
};

const MIN_BODY_PT = 10;

const SP_BASE = {
  nameSkip: 8,
  addressSkip: 2.5,
  sectionSkip: 5,
  sectionLineSkip: 2,
  afterRule: 5,
  sectionIndent: 8,
  entryTop: 3,
  itemSep: 0.5,
  entryGap: 4,
  bulletIndent: 14,
  labelSep: 5,
  skillLabelWidth: 100,
  rowSep: 1.2,
  lineGap: 0
};

const VERTICAL_SP_KEYS = [
  'nameSkip', 'addressSkip', 'sectionSkip', 'sectionLineSkip',
  'afterRule', 'entryTop', 'entryGap', 'rowSep'
];

const PAGE_MARGIN = { top: 14.4, bottom: 7.2, left: 14.4, right: 14.4 }; // 0.2in / 0.1in

const MIN_SCALE = MIN_BODY_PT / FS_BASE.body;
const PAGE_HEIGHT = 792;      // US letter, pt
const FILL_MIN_GAP = 6;       // pt of empty space worth filling
const MAX_STRETCH = 6;        // pt added per section/entry gap (about 2pt per bullet) at most
const MAX_REFILL_STEPS = 60;

/**
 * Fit plans, from "everything" to "most condensed". Each plan only removes
 * content (or shrinks text slightly), so page count never goes up along the
 * list and we can binary-search for the fullest plan that fits one page.
 *
 * Order of what goes first (least valuable first):
 *   long lists -> extra certificates/achievements -> older education ->
 *   older roles' bullets -> least relevant projects' bullets -> those projects ->
 *   latest role's weakest bullets -> older roles become title + dates only.
 * Bullets/projects are already ranked by JD relevance, so cutting from the end
 * drops the least relevant ones. Roles are never removed (no unexplained gaps).
 */
function buildFitPlans(content) {
  const nExp = content.experiences.map((e) => e.highlights.length);
  const nProj = content.projects.map((p) => p.highlights.length);
  const plans = [];
  let p = {
    scale: 1, expCaps: [...nExp], projCaps: [...nProj],
    skillItemsMax: Infinity, eduMax: Infinity, extrasMax: Infinity
  };
  const push = (changes) => {
    const next = { ...p, ...changes };
    if (JSON.stringify(next) !== JSON.stringify(p)) plans.push(next);
    p = next;
  };
  const cap = (arr, c) => arr.map((n) => (n < 0 ? n : Math.min(n, c)));
  const setAt = (arr, i, v) => arr.map((n, k) => (k === i ? v : n));

  plans.push(p);
  push({ expCaps: cap(p.expCaps, 6), projCaps: cap(p.projCaps, 3), extrasMax: 6 });
  push({ expCaps: cap(p.expCaps, 5), extrasMax: 4 });
  push({ scale: 0.98, projCaps: cap(p.projCaps, 2), extrasMax: 3 });
  push({ scale: MIN_SCALE, eduMax: 2, skillItemsMax: 12, extrasMax: 2 });
  push({ extrasMax: 0 });
  for (const c of [3, 2]) {
    for (let i = nExp.length - 1; i >= 1; i--) if (p.expCaps[i] > c) push({ expCaps: setAt(p.expCaps, i, c) });
  }
  for (let i = nProj.length - 1; i >= 0; i--) if (p.projCaps[i] > 1) push({ projCaps: setAt(p.projCaps, i, 1) });
  push({ eduMax: 1, skillItemsMax: 8 });
  for (let i = nProj.length - 1; i >= 1; i--) push({ projCaps: setAt(p.projCaps, i, -1) });
  for (const c of [4, 3]) if (p.expCaps[0] > c) push({ expCaps: setAt(p.expCaps, 0, c) });
  for (const c of [1, 0]) {
    for (let i = nExp.length - 1; i >= 1; i--) if (p.expCaps[i] > c) push({ expCaps: setAt(p.expCaps, i, c) });
  }
  if (nProj.length) push({ projCaps: setAt(p.projCaps, 0, -1) });
  for (const c of [2, 1]) if (p.expCaps[0] > c) push({ expCaps: setAt(p.expCaps, 0, c) });
  return plans;
}

/** The content a plan keeps (projCaps -1 = project left out). */
function applyPlan(content, plan) {
  return {
    ...content,
    experiences: content.experiences.map((e, i) => ({ ...e, highlights: e.highlights.slice(0, plan.expCaps[i]) })),
    projects: content.projects
      .map((pr, i) => ({ ...pr, highlights: pr.highlights.slice(0, Math.max(0, plan.projCaps[i])), keep: plan.projCaps[i] >= 0 }))
      .filter((pr) => pr.keep),
    skillGroups: content.skillGroups.map((g) => ({ ...g, items: g.items.slice(0, plan.skillItemsMax) })),
    education: content.education.slice(0, plan.eduMax),
    extras: content.extras.slice(0, plan.extrasMax)
  };
}

const BLACK = '#000000';
const LINK = '#0000ff';

// ---------------------------------------------------------------------------
// One-line bullets
// A bullet that spills a few words onto a second line wastes a whole line.
// For each bullet we (1) try meaning-preserving wording cuts ("in order to" ->
// "to", "utilized" -> "used"...) and keep them only if they save a line, then
// (2) if it is still only slightly too long, tighten word/letter spacing a
// little at render time. Skill keywords are never touched. Long bullets that
// really need two lines stay two lines (the editor flags them).
// ---------------------------------------------------------------------------
const measurer = new PDFDocument({ autoFirstPage: false });
const LETTER_WIDTH = 612;
/** Width available to bullet text (letter page, margins, section + bullet indent). */
export const BULLET_TEXT_WIDTH = LETTER_WIDTH - PAGE_MARGIN.left - PAGE_MARGIN.right
  - SP_BASE.sectionIndent - SP_BASE.bulletIndent;
const TIGHTEN_MAX = 0.03;       // absorb up to 3% overflow by tightening letter spacing
const CHAR_SPACING_MIN = -0.18; // pt removed per letter, at most
// (Word spacing is not used: PDFKit drops the spaces around **bold** segments when it is set.)

const WORDING_RULES = [
  [/\bin order to\b/gi, 'to'],
  [/\butiliz(e|es|ed|ing)\b/gi, (_, e) => ({ e: 'use', es: 'uses', ed: 'used', ing: 'using' }[e.toLowerCase()])],
  [/\bleverag(ed|ing)\b/gi, (_, e) => (e.toLowerCase() === 'ed' ? 'used' : 'using')],
  [/\bsuccessfully\s+/gi, ''],
  [/\ba number of\b/gi, 'several'],
  [/\ba wide (?:range|variety) of\b/gi, 'many'],
  [/\bapproximately\s*/gi, '~'],
  [/\s?per ?cent\b/gi, '%'],
  [/\bas well as\b/gi, 'and'],
  [/\bwith the help of\b/gi, 'with'],
  [/\bby means of\b/gi, 'via'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bon a (daily|weekly|monthly) basis\b/gi, '$1'],
  [/\bmore than\b/gi, 'over'],
  [/\bhelped to\b/gi, 'helped'],
  [/\s+([,.;:])/g, '$1'],
  [/\s{2,}/g, ' ']
];

/** Shorter wording with the same meaning (keeps the first letter's case). */
export function tightenWording(text = '') {
  let out = text;
  for (const [re, to] of WORDING_RULES) out = out.replace(re, to);
  out = out.trim();
  if (/^[A-Z]/.test(text) && out) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

/** Printed width of a bullet with **bold** skill markup at a font size. */
function richWidth(marked, fontSize, opts = {}) {
  return marked.split(/(\*\*.*?\*\*)/g).filter(Boolean).reduce((w, part) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    measurer.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(fontSize);
    return w + measurer.widthOfString(bold ? part.slice(2, -2) : part, opts);
  }, 0);
}

/** Spacing that squeezes a slightly-too-long line onto one line, or null. */
function tightSpacing(marked, fontSize, avail) {
  const w = richWidth(marked, fontSize);
  if (w <= avail) return {};
  if (w > avail * (1 + TIGHTEN_MAX)) return null;
  const plain = marked.replace(/\*\*/g, '');
  const over = w - avail + 0.5; // small safety margin
  const characterSpacing = -over / Math.max(1, plain.length - 1);
  if (characterSpacing < CHAR_SPACING_MIN) return null;
  return { characterSpacing };
}

const lineCount = (marked, fontSize, avail) =>
  tightSpacing(marked, fontSize, avail) ? 1 : Math.ceil(richWidth(marked, fontSize) / avail);

/** Use shorter wording for a bullet only when it saves a printed line. */
function fitBullet(text, fontSize, jdSkills) {
  const before = lineCount(highlightSkills(text, jdSkills), fontSize, BULLET_TEXT_WIDTH);
  if (before === 1) return text;
  const shorter = tightenWording(text);
  if (shorter === text) return text;
  return lineCount(highlightSkills(shorter, jdSkills), fontSize, BULLET_TEXT_WIDTH) < before ? shorter : text;
}

/** The view with every bullet given its shortest same-meaning wording that saves a line. */
function fitBulletsToLines(view, scale, jdSkills) {
  const size = FS_BASE.body * scale;
  const fit = (list) => list.map((t) => fitBullet(t, size, jdSkills));
  return {
    ...view,
    experiences: view.experiences.map((e) => ({ ...e, highlights: fit(e.highlights) })),
    projects: view.projects.map((p) => ({ ...p, highlights: fit(p.highlights) })),
    extras: fit(view.extras || [])
  };
}

/** How many bullets print on one line / wrap, for a rendered view. */
function bulletLineStats(view, scale, jdSkills) {
  const size = FS_BASE.body * scale;
  const all = [
    ...view.experiences.flatMap((e) => e.highlights),
    ...view.projects.flatMap((p) => p.highlights),
    ...(view.extras || [])
  ];
  const wrapping = all.filter((t) => lineCount(highlightSkills(t, jdSkills), size, BULLET_TEXT_WIDTH) > 1).length;
  return { oneLine: all.length - wrapping, wrapping };
}

const stripMarkers = (s = '') => String(s).replace(/\*\*/g, '');

/**
 * Rewrite resume text to the JD's spelling of skills you already have
 * (JD "ReactJS" -> resume "React.js" becomes "ReactJS"). Works on whole
 * skill mentions, longest first, so "React Testing Library" stays intact.
 * Only spelling changes; skills you don't have are never added.
 * Lowercase JD spellings are ignored (they'd look sloppy on a resume).
 */
const spellingKey = (t = '') => t.toLowerCase().replace(/[^a-z0-9+#]/g, '').replace(/js$/, '');

function buildSpellingMirror(jd, jdSkills) {
  const forms = new Map();
  for (const skill of jdSkills) {
    const form = surfaceForm(jd, skill);
    if (form && form !== form.toLowerCase()) forms.set(skill, form);
  }
  const changes = new Map(); // "React.js" -> "ReactJS"
  const mirror = (text = '') => {
    const src = String(text);
    if (!forms.size) return src;
    let out = '';
    let pos = 0;
    for (const span of findSkillSpans(src)) {
      const form = forms.get(span.skill);
      // Only respell the same name ("ReactJS" -> "React.js"), never swap in a
      // different alias ("EC2" is not "AWS").
      if (!form || spellingKey(span.text) !== spellingKey(form)) continue;
      // "Node JS" matches as "Node": take the trailing "JS" with it.
      const tail = /js$/i.test(form) ? (src.slice(span.end).match(/^[\s.-]?js\b/i) || [''])[0] : '';
      const from = span.text + tail;
      if (from !== form) changes.set(from, form);
      out += src.slice(pos, span.start) + form;
      pos = span.end + tail.length;
    }
    return out + src.slice(pos);
  };
  mirror.changes = () => [...changes].map(([from, to]) => ({ from, to }));
  return mirror;
}

// ---------------------------------------------------------------------------
// Content preparation (pure, no PDF calls) — easy to unit test.
// ---------------------------------------------------------------------------
export function prepareResumeContent(masterResume = {}, tailoredData = {}) {
  const m = masterResume || {};
  const targetRole = tailoredData.targetRole || m.title || 'Software Developer';
  const jd = tailoredData.jobDescription || '';
  const jdSkills = extractSkills(`${jd} ${targetRole}`);

  const experiences = Array.isArray(m.experience) ? m.experience : [];
  const projects = Array.isArray(m.projects) ? m.projects : [];
  const education = Array.isArray(m.education) ? m.education : [];
  const skillGroups = Array.isArray(m.skills) ? m.skills : [];
  const certifications = Array.isArray(m.certifications) ? m.certifications : [];
  const achievements = Array.isArray(m.achievements) ? m.achievements : [];

  if (!m.fullName || experiences.length === 0) {
    throw new Error('Master resume is incomplete (name and at least one experience entry are required).');
  }

  // Stable sort: ties keep the order the user wrote, so trimming drops the last ones.
  const rank = (items, toText) =>
    jdSkills.length === 0
      ? [...items]
      : items
          .map((item, i) => ({ item, i, score: countMatches(toText(item), jdSkills) }))
          .sort((a, b) => b.score - a.score || a.i - b.i)
          .map((x) => x.item);

  const mirror = buildSpellingMirror(jd, jdSkills);
  const clean = (list = []) => list.map((t) => mirror(stripMarkers(t))).filter(Boolean);

  const provenText = experiences.flatMap((e) => e.highlights || []).join(' ');
  const focus = detectRoleFocus(targetRole, jd);
  const focusLabel = { frontend: 'Frontend Developer', backend: 'Backend Developer', fullstack: 'Full Stack Developer' }[focus];
  const provenJdSkills = jdSkills.filter((s) => countMatches(provenText, [s]) > 0).map((s) => mirror(s.label));
  const subtitle = ['Software Developer', focusLabel, ...provenJdSkills.slice(0, 5)].join(' | ');

  const isJdSkill = (item) => jdSkills.some((s) => hasSkill(item, s)) || jdSkills.includes(findSkill(item));

  const rankedExperiences = experiences.map((e) => ({
    ...e,
    highlights: rank(clean(e.highlights), (t) => t)
  }));
  // Roles whose most relevant bullet is now first (it wasn't before).
  const rolesReordered = rankedExperiences.filter((e, i) => {
    const original = clean(experiences[i].highlights);
    return original.length > 1 && e.highlights[0] !== original[0];
  }).map((e) => e.company || e.role || '');

  const content = {
    m,
    jdSkills,
    subtitle,
    experiences: rankedExperiences,
    projects: rank(projects, (p) => `${p.name || ''} ${(p.technologies || []).join(' ')} ${(p.highlights || []).join(' ')}`)
      .map((p) => ({
        ...p,
        technologies: [...new Set((p.technologies || []).map(mirror))],
        highlights: rank(clean(p.highlights), (t) => t)
      })),
    education,
    // Certifications + achievements, most JD-relevant first; dropped first when condensing.
    extras: rank(clean([...certifications, ...achievements]), (t) => t),
    // Groups with the most JD matches first; inside a group, matched items first.
    skillGroups: rank(
      skillGroups.filter((g) => (g.items || []).length),
      (g) => (g.items || []).join(', ')
    ).map((g) => {
      const items = [...new Set(g.items.map(mirror))];
      return {
        category: g.category || '',
        items: items.sort((a, b) => Number(isJdSkill(b)) - Number(isJdSkill(a))),
        isJdSkill
      };
    })
  };
  content.changes = {
    headline: subtitle,
    spelling: mirror.changes(),
    rolesReordered,
    emphasised: jdSkills.map((s) => s.label)
  };
  return content;
}

/** The exact text printed for a given fit attempt (what an ATS would parse). */
export function renderedText(content) {
  const { m } = content;
  const roles = content.experiences.map((e) => [e.role, e.company].filter(Boolean).join(' at '));
  const bullets = [
    ...content.experiences.flatMap((e) => e.highlights),
    ...content.projects.flatMap((p) => p.highlights),
    ...(content.extras || [])
  ];
  const skills = [
    ...content.skillGroups.map((g) => `${g.category}: ${g.items.join(', ')}`),
    ...content.projects.map((p) => `${p.name}: ${(p.technologies || []).join(', ')}`)
  ];
  const education = content.education.map((e) => [e.degree, e.institution, e.score, e.period].filter(Boolean).join(' '));
  const headline = content.subtitle;
  const full = [m.fullName, headline, m.location, m.email, m.phone, ...roles, ...bullets, ...skills, ...education].join('\n');
  return { headline, roles, bullets, skills, education, full };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderToBuffer(content, { scale, measure = false, stretch = 0 }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        // measure: one very tall page, used only to measure how long the full content is
        size: measure ? [612, 792 * 10] : 'letter',
        margins: PAGE_MARGIN,
        bufferPages: true,
        // Shown as the title in PDF viewers and read by some ATS parsers.
        info: { Title: `${content.m.fullName} - Resume`, Author: content.m.fullName, Subject: content.subtitle },
        displayTitle: true
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));

      const FS = Object.fromEntries(Object.entries(FS_BASE).map(([k, v]) => [k, v * scale]));
      const SP = { ...SP_BASE };
      VERTICAL_SP_KEYS.forEach((k) => { SP[k] = SP_BASE[k] * scale; });

      // stretch: extra vertical space (pt) used to fill the page when content runs out.
      SP.sectionSkip += stretch;
      SP.entryGap += stretch;
      SP.itemSep += stretch * 0.35;
      SP.rowSep += stretch * 0.35;

      const left = PAGE_MARGIN.left;
      const width = doc.page.width - PAGE_MARGIN.left - PAGE_MARGIN.right;
      const right = left + width;
      const contentX = left + SP.sectionIndent;
      const contentWidth = right - contentX;
      const { m, jdSkills } = content;

      // -- helpers ----------------------------------------------------------
      const renderRichText = (text, fontSize, textWidth, spacing = {}) => {
        const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        parts.forEach((p, idx) => {
          const bold = p.startsWith('**') && p.endsWith('**');
          doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(fontSize).fillColor(BLACK)
             .text(bold ? p.slice(2, -2) : p, {
               width: textWidth, continued: idx < parts.length - 1, lineGap: SP.lineGap, ...spacing
             });
        });
      };

      const renderSection = (title) => {
        doc.y += SP.sectionSkip;
        const y0 = doc.y;
        doc.font('Times-Bold').fontSize(FS.section).fillColor(BLACK)
           .text(title.toUpperCase(), left, y0, { lineBreak: false });
        const ruleY = y0 + doc.currentLineHeight() + SP.sectionLineSkip;
        doc.lineWidth(0.45).strokeColor(BLACK).moveTo(left, ruleY).lineTo(right, ruleY).stroke();
        doc.y = ruleY + SP.afterRule;
      };

      // Bold-left label, regular right-aligned meta on the same baseline.
      const renderEntryHeader = (segments, rightText, rightLink) => {
        const y = doc.y;
        segments.forEach((s, i) => {
          doc.font(s.bold ? 'Times-Bold' : 'Times-Roman').fontSize(FS.entryHeader).fillColor(BLACK);
          if (i === 0) doc.text(s.text, contentX, y, { continued: i < segments.length - 1, lineBreak: false });
          else doc.text(s.text, { continued: i < segments.length - 1, lineBreak: false });
        });
        if (rightText) {
          doc.font('Times-Roman').fontSize(FS.entryHeader).fillColor(rightLink ? LINK : BLACK)
             .text(rightText, contentX, y, {
               width: contentWidth, align: 'right', lineBreak: false, ...(rightLink ? { link: rightLink } : {})
             });
        }
        doc.y = y + doc.currentLineHeight() + SP.entryTop;
      };

      const renderBullet = (text) => {
        const textX = contentX + SP.bulletIndent;
        const startY = doc.y;
        doc.font('Times-Roman').fontSize(FS.body).fillColor(BLACK);
        doc.text('•', textX - SP.labelSep - doc.widthOfString('•'), startY, { lineBreak: false });
        doc.x = textX;
        doc.y = startY;
        const marked = highlightSkills(text, jdSkills);
        // Slightly-too-long bullet: tighten spacing a little so it stays on one line.
        const spacing = tightSpacing(marked, FS.body, right - textX) || {};
        renderRichText(marked, FS.body, right - textX, spacing);
        doc.y = Math.max(doc.y, startY + doc.currentLineHeight()) + SP.itemSep;
      };

      // -- header -----------------------------------------------------------
      const resumeLink = m.resumeUrl || m.website || '';
      doc.font('Times-Bold').fontSize(FS.name).fillColor(LINK)
         .text(m.fullName.toUpperCase(), left, PAGE_MARGIN.top, {
           align: 'center', width, ...(resumeLink ? { link: resumeLink } : {})
         });
      doc.y = PAGE_MARGIN.top + doc.currentLineHeight() + SP.nameSkip;

      doc.font('Times-Roman').fontSize(FS.subtitle).fillColor(BLACK)
         .text(content.subtitle, left, doc.y, { align: 'center', width });
      doc.y += SP.addressSkip;

      const linkParts = [
        m.phone && { text: m.phone, link: `tel:${m.phone.replace(/\s+/g, '')}` },
        resumeLink && { text: 'Portfolio / Resume', link: resumeLink },
        m.email && { text: m.email, link: `mailto:${m.email}` },
        m.linkedin && { text: 'LinkedIn', link: m.linkedin },
        m.github && { text: 'GitHub', link: m.github }
      ].filter(Boolean);

      const contact = [];
      if (m.location) contact.push({ text: m.location, color: BLACK });
      linkParts.forEach((p) => {
        if (contact.length) contact.push({ text: ' | ', color: BLACK });
        contact.push({ ...p, color: LINK });
      });

      doc.font('Times-Roman').fontSize(FS.contact);
      const contactWidth = contact.reduce((sum, s) => sum + doc.widthOfString(s.text), 0);
      let cx = (doc.page.width - contactWidth) / 2;
      const contactY = doc.y;
      contact.forEach((s) => {
        doc.font('Times-Roman').fontSize(FS.contact).fillColor(s.color)
           .text(s.text, cx, contactY, { link: s.link || undefined, lineBreak: false });
        cx += doc.widthOfString(s.text);
      });
      doc.y = contactY + doc.currentLineHeight() + SP.addressSkip;

      // -- experience -------------------------------------------------------
      renderSection('Experience');
      content.experiences.forEach((exp) => {
        renderEntryHeader(
          [
            { text: exp.role || '', bold: true },
            ...(exp.company ? [{ text: ' at ', bold: false }, { text: exp.company, bold: true }] : [])
          ],
          exp.period || ''
        );
        exp.highlights.forEach(renderBullet);
        doc.y += SP.entryGap;
      });

      // -- skills -----------------------------------------------------------
      if (content.skillGroups.length) {
        renderSection('Skills');
        const valueX = contentX + SP.skillLabelWidth;
        content.skillGroups.forEach(({ category, items, isJdSkill }) => {
          const rowY = doc.y;
          doc.font('Times-Bold').fontSize(FS.body).fillColor(BLACK)
             .text(category, contentX, rowY, { width: SP.skillLabelWidth - 6 });
          const labelBottom = doc.y;
          doc.x = valueX;
          doc.y = rowY;
          renderRichText(items.map((it) => (isJdSkill(it) ? `**${it}**` : it)).join(', '), FS.body, right - valueX);
          doc.y = Math.max(doc.y, labelBottom, rowY + doc.currentLineHeight()) + SP.rowSep;
        });
      }

      // -- education --------------------------------------------------------
      if (content.education.length) {
        renderSection('Education');
        content.education.forEach((ed) => {
          const rest = [ed.institution, ed.score && `(${ed.score})`].filter(Boolean).join(' ');
          renderEntryHeader(
            [{ text: ed.degree || '', bold: true }, ...(rest ? [{ text: `, ${rest}`, bold: false }] : [])],
            ed.period || ''
          );
          doc.y -= SP.entryTop;
        });
        doc.y += SP.entryGap;
      }

      // -- projects ---------------------------------------------------------
      if (content.projects.length) {
        renderSection('Projects');
        content.projects.forEach((p) => {
          const tech = (p.technologies || []).join(', ');
          renderEntryHeader(
            [{ text: p.name || '', bold: true }, ...(tech ? [{ text: ` | ${tech}`, bold: false }] : [])],
            p.link ? '(Link)' : '',
            p.link || ''
          );
          p.highlights.forEach(renderBullet);
          doc.y += SP.entryGap;
        });
      }

      // -- certifications & achievements ------------------------------------
      if (content.extras && content.extras.length) {
        renderSection('Certifications & Achievements');
        content.extras.forEach(renderBullet);
      }

      const pages = doc.bufferedPageRange().count;
      const contentHeight = doc.y + PAGE_MARGIN.bottom;
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages, contentHeight }));
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate the tailored PDF and report how it was fitted.
 * @returns {Promise<{buffer: Buffer, pages: number, scale: number, bodyPt: number, trimmed: boolean}>}
 */
export async function generateResumePDFWithMeta(masterResume = {}, tailoredData = {}) {
  const content = prepareResumeContent(masterResume, tailoredData);
  const plans = buildFitPlans(content);
  const viewOf = (plan) => fitBulletsToLines(applyPlan(content, plan), plan.scale, content.jdSkills);
  // Exact content height on a tall page (no page breaks), so "fits" is reliable.
  const heightOf = async (plan, stretch = 0) =>
    (await renderToBuffer(viewOf(plan), { ...plan, measure: true, stretch })).contentHeight;
  const fits = async (plan) => (await heightOf(plan)) <= PAGE_HEIGHT;

  // 1. Fullest plan that fits one page. Height only drops along `plans`.
  let k = 0;
  if (!(await fits(plans[0]))) {
    let lo = 1;
    let hi = plans.length - 1;
    k = plans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (await fits(plans[mid])) { k = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
  }
  let plan = plans[k];

  // 2. Plans are coarse steps, so the chosen one can leave room. Add content
  //    back one item at a time (most relevant first) while it still fits.
  if (k > 0) plan = await refill(plan, content, fits);

  // 3. Still space at the bottom (nothing left to add)? Spread the content
  //    down the page with slightly larger gaps, up to a limit that still looks natural.
  const h0 = await heightOf(plan);
  let stretch = 0;
  if (PAGE_HEIGHT - h0 > FILL_MIN_GAP) {
    const perPt = (await heightOf(plan, 1)) - h0; // height gained per 1pt of stretch
    if (perPt > 0) {
      stretch = Math.min(MAX_STRETCH, ((PAGE_HEIGHT - h0) / perPt) * 0.98);
      while (stretch > 0 && (await heightOf(plan, stretch)) > PAGE_HEIGHT) stretch = Math.max(0, stretch - 0.5);
    }
  }

  // Final letter-size render (safety net: drop the stretch if it ever spills).
  const view = viewOf(plan);
  let out = await renderToBuffer(view, { ...plan, stretch });
  if (out.pages > 1 && stretch) { stretch = 0; out = await renderToBuffer(view, plan); }
  if (out.pages > 1) console.warn(`[pdfService] "${masterResume?.fullName}" still exceeds one page at the most condensed plan.`);
  const usedHeight = await heightOf(plan, stretch);

  const full = applyPlan(content, plans[0]);
  const count = (v) => ({
    bullets: v.experiences.reduce((n, e) => n + e.highlights.length, 0) + v.projects.reduce((n, pr) => n + pr.highlights.length, 0),
    projects: v.projects.length,
    extras: v.extras.length,
    education: v.education.length
  });
  const before = count(full);
  const after = count(view);
  const condensed = {
    // Length of the uncondensed resume in letter pages (measured, not counted).
    fromPages: Math.max(1, Math.ceil((await renderToBuffer(full, { ...plans[0], measure: true })).contentHeight / PAGE_HEIGHT)),
    bulletsKept: after.bullets,
    bulletsLeftOut: before.bullets - after.bullets,
    projectsLeftOut: before.projects - after.projects,
    extrasLeftOut: before.extras - after.extras,
    educationLeftOut: before.education - after.education
  };
  // Bullets whose wording was shortened (same meaning) to save a line.
  const fullBullets = [...full.experiences.flatMap((e) => e.highlights), ...full.projects.flatMap((pr) => pr.highlights), ...full.extras];
  const shortened = [...view.experiences.flatMap((e) => e.highlights), ...view.projects.flatMap((pr) => pr.highlights), ...view.extras]
    .filter((t) => !fullBullets.includes(t)).length;
  const lines = { ...bulletLineStats(view, plan.scale, content.jdSkills), shortened };
  // How full the page is. Below ~95% with nothing left out = the master resume needs more content.
  const fill = {
    pagePercent: Math.min(100, Math.round((usedHeight / PAGE_HEIGHT) * 100)),
    spacingAdded: +stretch.toFixed(1),
    everythingIncluded: condensed.bulletsLeftOut + condensed.projectsLeftOut + condensed.extrasLeftOut + condensed.educationLeftOut === 0
  };
  content.changes = { ...content.changes, condensed, lines, fill };

  return {
    buffer: out.buffer,
    pages: out.pages,
    scale: plan.scale,
    bodyPt: +(FS_BASE.body * plan.scale).toFixed(2),
    trimmed: !fill.everythingIncluded,
    rendered: renderedText(view),
    content
  };
}

/**
 * Grow a plan one item at a time while it still fits one page.
 * Priority: experience bullets (latest role first), then projects and their
 * bullets, then education, certifications/achievements, skills, and finally
 * a larger font. Bullets are already ranked by JD relevance, so each step adds
 * the most relevant bullet that was left out.
 */
async function refill(start, content, fits) {
  const nExp = content.experiences.map((e) => e.highlights.length);
  const nProj = content.projects.map((p) => p.highlights.length);
  const maxSkillItems = Math.max(0, ...content.skillGroups.map((g) => g.items.length));
  const steps = (p) => {
    const out = [];
    const setAt = (arr, i, v) => arr.map((n, j) => (j === i ? v : n));
    nExp.forEach((n, i) => { if (p.expCaps[i] < n) out.push({ ...p, expCaps: setAt(p.expCaps, i, p.expCaps[i] + 1) }); });
    nProj.forEach((n, i) => {
      if (p.projCaps[i] < 0) out.push({ ...p, projCaps: setAt(p.projCaps, i, Math.min(1, n)) });
      else if (p.projCaps[i] < n) out.push({ ...p, projCaps: setAt(p.projCaps, i, p.projCaps[i] + 1) });
    });
    if (p.eduMax < content.education.length) out.push({ ...p, eduMax: p.eduMax + 1 });
    if (p.extrasMax < content.extras.length) out.push({ ...p, extrasMax: p.extrasMax + 1 });
    if (p.skillItemsMax < maxSkillItems) out.push({ ...p, skillItemsMax: Infinity });
    if (p.scale < 1) out.push({ ...p, scale: Math.min(1, +(p.scale + 0.02).toFixed(4)) });
    return out;
  };
  let plan = start;
  for (let guard = 0; guard < MAX_REFILL_STEPS; guard++) {
    let grown = null;
    for (const next of steps(plan)) {
      if (await fits(next)) { grown = next; break; }
    }
    if (!grown) break;
    plan = grown;
  }
  return plan;
}

/** Backwards-compatible API used by routes and the email service. Returns a Buffer. */
export async function generateResumePDF(masterResume = {}, tailoredData = {}) {
  return (await generateResumePDFWithMeta(masterResume, tailoredData)).buffer;
}