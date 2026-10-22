// Extract positioned text lines (and link URLs) from a PDF buffer.
// Output feeds shared/resumeParser.js. Uses Mozilla's pdf.js (no native deps).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PAGES = 5;
const Y_TOLERANCE = 2.5; // items whose baselines differ by less than this are one line

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<{ lines: Array<{text:string,x:number,y:number,page:number,size:number,links:string[]}>, pages:number }>}
 */
export async function extractPdfLines(buffer) {
  const data = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(Buffer.from(buffer));
  const pdf = await getDocument({ data, isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  const lines = [];

  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const annotations = (await page.getAnnotations()).filter((a) => a.subtype === 'Link' && a.url);

    // Group text items into lines by baseline.
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const size = Math.abs(it.transform[3]) || it.height || 0;
      let row = rows.find((r) => Math.abs(r.y - y) < Y_TOLERANCE);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ str: it.str, x, w: it.width || 0, size });
    }

    rows.sort((a, b) => b.y - a.y); // top of page first
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let text = '';
      let end = null;
      for (const it of row.items) {
        if (end !== null) {
          const gap = it.x - end;
          // A wide gap means a right-aligned column (e.g. dates): keep it as a tab.
          if (gap > 40) text += '\t';
          else if (gap > 1.5 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
        }
        text += it.str;
        end = it.x + it.w;
      }
      const first = row.items[0];
      const links = annotations
        .filter((a) => row.y >= a.rect[1] - 3 && row.y <= a.rect[3] + 3)
        .map((a) => a.url);
      lines.push({
        text: text.replace(/[ \u00a0]+/g, ' ').trim(),
        x: Math.round(first.x * 10) / 10,
        y: Math.round(row.y * 10) / 10,
        page: p,
        size: Math.round(Math.max(...row.items.map((i) => i.size)) * 10) / 10,
        links: [...new Set(links)]
      });
    }
  }
  await pdf.destroy();
  return { lines: lines.filter((l) => l.text), pages };
}
