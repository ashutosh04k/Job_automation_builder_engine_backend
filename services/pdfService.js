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
  sectionIndent: 14,
  entryTop: 3,
  itemSep: 0.5,
  entryGap: 4,
  bulletIndent: 22,
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

// Fit attempts, tried in order. Trim weak bullets before shrinking text.
const MIN_SCALE = MIN_BODY_PT / FS_BASE.body;
const FIT_ATTEMPTS = [
  { scale: 1, expBullets: Infinity, projBullets: Infinity },
  { scale: 1, expBullets: 6, projBullets: 3 },
  { scale: 1, expBullets: 5, projBullets: 3 },
  { scale: 0.98, expBullets: 5, projBullets: 2 },
  { scale: MIN_SCALE, expBullets: 4, projBullets: 2 },
  { scale: MIN_SCALE, expBullets: 3, projBullets: 2 }
];

const BLACK = '#000000';
const LINK = '#0000ff';

const stripMarkers = (s = '') => String(s).replace(/\*\*/g, '');

/**
 * Rewrite resume text to the JD's spelling of skills you already have
 * (JD "ReactJS" -> resume "React.js" becomes "ReactJS"). Works on whole
 * skill mentions, longest first, so "React Testing Library" stays intact.
 * Only spelling changes; skills you don't have are never added.
 * Lowercase JD spellings are ignored (they'd look sloppy on a resume).
 */
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
      if (!form) continue;
      if (span.text !== form) changes.set(span.text, form);
      out += src.slice(pos, span.start) + form;
      pos = span.end;
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
export function renderedText(content, { expBullets = Infinity, projBullets = Infinity } = {}) {
  const { m } = content;
  const roles = content.experiences.map((e) => [e.role, e.company].filter(Boolean).join(' at '));
  const bullets = [
    ...content.experiences.flatMap((e) => e.highlights.slice(0, expBullets)),
    ...content.projects.flatMap((p) => p.highlights.slice(0, projBullets))
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
function renderToBuffer(content, { scale, expBullets, projBullets }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'letter',
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

      const left = PAGE_MARGIN.left;
      const width = doc.page.width - PAGE_MARGIN.left - PAGE_MARGIN.right;
      const right = left + width;
      const contentX = left + SP.sectionIndent;
      const contentWidth = right - contentX;
      const { m, jdSkills } = content;

      // -- helpers ----------------------------------------------------------
      const renderRichText = (text, fontSize, textWidth) => {
        const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        parts.forEach((p, idx) => {
          const bold = p.startsWith('**') && p.endsWith('**');
          doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(fontSize).fillColor(BLACK)
             .text(bold ? p.slice(2, -2) : p, {
               width: textWidth, continued: idx < parts.length - 1, lineGap: SP.lineGap
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
        renderRichText(highlightSkills(text, jdSkills), FS.body, right - textX);
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
        exp.highlights.slice(0, expBullets).forEach(renderBullet);
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
          p.highlights.slice(0, projBullets).forEach(renderBullet);
          doc.y += SP.entryGap;
        });
      }

      const pages = doc.bufferedPageRange().count;
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages }));
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
  let last = null;
  for (const attempt of FIT_ATTEMPTS) {
    const { buffer, pages } = await renderToBuffer(content, attempt);
    last = {
      buffer,
      pages,
      scale: attempt.scale,
      bodyPt: +(FS_BASE.body * attempt.scale).toFixed(2),
      trimmed: attempt.expBullets !== Infinity || attempt.projBullets !== Infinity,
      rendered: renderedText(content, attempt),
      content
    };
    if (pages === 1) return last;
  }
  // Content is too long even after trimming: keep text readable, allow page 2.
  console.warn(`[pdfService] Resume for "${masterResume?.fullName}" did not fit on one page (${last.pages} pages).`);
  return last;
}

/** Backwards-compatible API used by routes and the email service. Returns a Buffer. */
export async function generateResumePDF(masterResume = {}, tailoredData = {}) {
  return (await generateResumePDFWithMeta(masterResume, tailoredData)).buffer;
}