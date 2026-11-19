// backend/services/groqBulletService.js
// Generates high-impact, ATS-optimized one-line resume bullets for added skills
// using Groq (llama-3.3-70b-versatile / llama-3.1-8b-instant), with a smart
// context-aware fallback when offline or when no API key is supplied.

import { findSkill } from '../shared/keywords.js';
import { termShownIn } from '../shared/jdTerms.js';

const BULLET_MIN = 15;
const BULLET_MAX = 220;

const WEAK_START = /^(?:worked (?:on|with)|responsible for|helped|assisted(?: in| with)?|involved in|participated in|was part of|part of|tasked with|duties included|handled|did|made|used|working on)\b/i;

/** Clean and format bullet into an ATS-friendly single line under 220 chars. */
export function sanitizeBullet(raw = '', term = '') {
  let text = String(raw || '')
    .replace(/^[\s•*#\-–—\d.)\]>]+/, '') // strip leading bullet symbols, numbers
    .replace(/^["'`“]+|["'`”]+$/g, '')   // strip surrounding quotes
    .replace(/[\r\n]+/g, ' ')            // single line
    .replace(/\s+/g, ' ')
    .trim();

  // If starts with weak phrasing like "Worked on...", replace with strong verb
  if (WEAK_START.test(text)) {
    text = text.replace(WEAK_START, 'Implemented').trim();
  }

  // Ensure initial uppercase
  if (text.length > 0) {
    text = text[0].toUpperCase() + text.slice(1);
  }

  // Ensure term is mentioned
  if (term && !termShownIn(term, text)) {
    if (text.endsWith('.')) text = text.slice(0, -1);
    text = `${text} using ${term}.`;
  }

  // Ensure trailing period
  if (!text.endsWith('.') && text.length > 0) {
    text += '.';
  }

  // Truncate to BULLET_MAX if needed while respecting word boundaries
  if (text.length > BULLET_MAX) {
    const suffix = (term && !termShownIn(term, text.slice(0, BULLET_MAX - 20))) ? ` with ${term}.` : '.';
    const cutLimit = Math.max(30, BULLET_MAX - suffix.length);
    const cut = text.slice(0, cutLimit);
    const lastSpace = cut.lastIndexOf(' ');
    const trimmedBase = (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).replace(/[;,:\s]+$/, '');
    text = trimmedBase + suffix;
  }

  return text;
}

/**
 * Context-aware smart fallback generator when Groq is unavailable or key not configured.
 * Builds realistic, metric-backed bullets mentioning the target skill.
 */
export function smartBulletFallback({ term = '', targetEntry = null, targetRole = '', companyName = '' } = {}) {
  const cleanTerm = term.trim();
  const skill = findSkill(cleanTerm);
  const group = skill?.group || 'general';
  const role = targetEntry?.role || targetRole || 'Developer';
  const company = targetEntry?.company || companyName || '';
  const atCompany = company ? ` at ${company}` : '';

  let bullet = '';
  switch (group) {
    case 'frontend':
      bullet = `Engineered responsive, accessible UI modules using ${cleanTerm}${atCompany}, enhancing rendering speed and cross-browser consistency by 25%.`;
      break;
    case 'backend':
      bullet = `Architected high-throughput backend services and APIs with ${cleanTerm}${atCompany}, reducing endpoint latency and optimizing database queries.`;
      break;
    case 'devops':
      bullet = `Automated CI/CD deployment pipelines and container workflows using ${cleanTerm}${atCompany}, accelerating release velocity by 35%.`;
      break;
    case 'testing':
      bullet = `Designed comprehensive automated test suites using ${cleanTerm}${atCompany}, boosting test coverage above 85% and minimizing regression issues.`;
      break;
    case 'data':
      bullet = `Implemented data pipelines and analytics extraction workflows with ${cleanTerm}${atCompany}, enabling real-time metrics and reliable reporting.`;
      break;
    case 'ai':
      bullet = `Integrated intelligent automation workflows and model pipelines leveraging ${cleanTerm}${atCompany}, enhancing feature efficiency and throughput.`;
      break;
    case 'mobile':
      bullet = `Developed robust cross-platform mobile app features with ${cleanTerm}${atCompany}, elevating user ratings and reducing app startup latency.`;
      break;
    default:
      bullet = `Applied ${cleanTerm} to streamline core features${atCompany}, boosting system maintainability, delivery velocity, and reliability.`;
      break;
  }

  return sanitizeBullet(bullet, cleanTerm);
}

/**
 * Generate a tailored bullet for a skill using Groq's high-speed LLM endpoint,
 * falling back gracefully to the smart generator if offline or key is missing.
 */
export async function generateBulletWithGroq({
  master = {},
  term = '',
  target = '',
  targetRole = '',
  companyName = '',
  jobDescription = '',
  apiKey = ''
} = {}) {
  const cleanTerm = String(term || '').trim();
  if (!cleanTerm) throw new Error('Skill term is required');

  // Resolve target entry from master resume
  let targetEntry = null;
  const mTarget = String(target).match(/^(exp|proj):(\d+)$/);
  if (mTarget) {
    const list = mTarget[1] === 'exp' ? (master.experience || []) : (master.projects || []);
    targetEntry = list[Number(mTarget[2])] || null;
  }

  const groqKey = apiKey || process.env.GROQ_API_KEY || '';

  if (!groqKey) {
    return {
      bullet: smartBulletFallback({ term: cleanTerm, targetEntry, targetRole, companyName }),
      provider: 'template',
      note: 'Generated via built-in ATS bullet engine. Add a Groq API key in Settings for custom AI generation.'
    };
  }

  const roleName = targetEntry?.role || targetEntry?.name || targetRole || 'Software Engineer';
  const compName = targetEntry?.company || companyName || 'Company';
  const existingHighlights = (targetEntry?.highlights || []).slice(0, 3).join(' | ');

  const systemPrompt = `You are a specialized technical resume author and ATS scoring expert.
Your job is to generate exactly ONE concise, high-impact resume bullet point that incorporates a specific skill into an existing job or project.

STRICT RULES:
1. Return ONLY the bullet point text. No conversational filler, quotes, or markdown bullets.
2. Must be exactly 1 sentence, strictly between 70 and 210 characters.
3. Must explicitly name "${cleanTerm}".
4. Must begin with a strong past-tense action verb (e.g. Architected, Engineered, Implemented, Designed, Streamlined, Built, Optimized).
5. Must include a realistic outcome or metric (e.g. latency reduction, % speedup, reliability).
6. Never start with "Worked on", "Responsible for", or "Helped".`;

  const userPrompt = `Role: ${roleName} at ${compName}
Skill to integrate: "${cleanTerm}"
Existing highlights for context: ${existingHighlights || 'Developed full-stack web applications.'}
Target Position: ${targetRole || 'Software Engineer'} ${companyName ? `at ${companyName}` : ''}

Generate one ATS-optimized bullet point featuring "${cleanTerm}".`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 120
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn('[Groq API Error]:', res.status, errBody?.error?.message || res.statusText);
      return {
        bullet: smartBulletFallback({ term: cleanTerm, targetEntry, targetRole, companyName }),
        provider: 'template',
        note: `Groq error (${res.status}): used smart ATS bullet engine fallback.`
      };
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new Error('Empty response from Groq');
    }

    const bullet = sanitizeBullet(rawContent, cleanTerm);
    if (bullet.length < BULLET_MIN || !termShownIn(cleanTerm, bullet)) {
      return {
        bullet: smartBulletFallback({ term: cleanTerm, targetEntry, targetRole, companyName }),
        provider: 'template'
      };
    }

    return {
      bullet,
      provider: 'groq',
      model: data.model || 'llama-3.3-70b-versatile'
    };

  } catch (err) {
    console.warn('[Groq Bullet Generation Warning]:', err.message);
    return {
      bullet: smartBulletFallback({ term: cleanTerm, targetEntry, targetRole, companyName }),
      provider: 'template',
      note: 'Groq unavailable; generated using built-in ATS engine.'
    };
  }
}
