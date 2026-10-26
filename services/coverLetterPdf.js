// One-page cover letter PDF (PDFKit), same typeface as the resume.
import PDFDocument from 'pdfkit';

const MARGIN = 64;
const BODY_PT = 11;

/**
 * @param {object} master master resume (name + contact for the header)
 * @param {{ date: string, paragraphs: string[] }} letter  paragraphs include greeting and sign-off blocks
 * @returns {Promise<Buffer>}
 */
export function renderCoverLetterPdf(master = {}, letter = {}) {
  return new Promise((resolve, reject) => {
    try {
      const name = String(master.fullName || 'Cover Letter').trim();
      const doc = new PDFDocument({
        size: 'letter',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: { Title: `${name} - Cover Letter`, Author: name },
        displayTitle: true
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      const width = doc.page.width - MARGIN * 2;

      // Header: name + contact, then date
      doc.font('Times-Bold').fontSize(18).fillColor('#000').text(name.toUpperCase(), { width });
      const shortUrl = (u) => String(u || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      const contact = [master.location, master.phone, master.email, shortUrl(master.linkedin)].map((v) => String(v || '').trim()).filter(Boolean).join('  |  ');
      if (contact) doc.font('Times-Roman').fontSize(10).fillColor('#333').text(contact, { width });
      doc.moveTo(MARGIN, doc.y + 6).lineTo(MARGIN + width, doc.y + 6).lineWidth(0.5).strokeColor('#000').stroke();
      doc.moveDown(1.4);
      if (letter.date) doc.font('Times-Roman').fontSize(BODY_PT).fillColor('#000').text(letter.date, { width }).moveDown(1);

      // Body: shrink a little if a long edited letter would overflow one page
      const blocks = (letter.paragraphs || []).map((p) => String(p).trim()).filter(Boolean);
      let size = BODY_PT;
      const heightAt = (pt) => {
        doc.font('Times-Roman').fontSize(pt);
        return blocks.reduce((h, b) => h + doc.heightOfString(b, { width, lineGap: 2 }) + pt * 0.9, 0);
      };
      while (size > 9.5 && doc.y + heightAt(size) > doc.page.height - MARGIN) size -= 0.5;
      doc.font('Times-Roman').fontSize(size).fillColor('#000');
      blocks.forEach((b) => {
        doc.text(b, { width, lineGap: 2, align: 'left' });
        doc.moveDown(0.9);
      });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
