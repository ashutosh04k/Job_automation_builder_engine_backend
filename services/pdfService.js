import PDFDocument from 'pdfkit';

/**
 * Generate a PDF Resume Buffer for Ashutosh Kumar
 * @param {Object} masterResume 
 * @param {Object} tailoredData 
 * @returns {Promise<Buffer>} PDF Buffer
 */
export function generateResumePDF(masterResume, tailoredData = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      const primaryColor = '#0f172a';
      const accentColor = '#0284c7';
      const textColor = '#334155';

      // --- HEADER ---
      doc.fillColor(primaryColor).fontSize(22).font('Helvetica-Bold').text('Ashutosh Kumar', { align: 'left' });
      doc.fillColor(accentColor).fontSize(12).font('Helvetica-Bold').text('Software Developer | Full Stack Developer', { align: 'left' });
      doc.moveDown(0.2);

      doc.fillColor(textColor).fontSize(9.5).font('Helvetica')
         .text('📍 Gurgaon, Haryana  |  ✉️ kumarasutosh2014@gmail.com  |  📞 +91 8521975695');
      doc.fillColor(accentColor).fontSize(9)
         .text('Portfolio: https://ashutosh-portfolio-8x6q.onrender.com/  |  LinkedIn: https://www.linkedin.com/in/ashutosh-kumar-sde');
      
      doc.moveDown(0.5);
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
      doc.moveDown(0.5);

      // --- SUMMARY ---
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('SUMMARY');
      doc.moveDown(0.2);
      const summaryText = tailoredData.tailoredSummary || masterResume?.summary || 
        'Full Stack Software Developer with 3+ years of experience building scalable web applications, REST APIs, real-time systems, CRM platforms, and data-intensive workflows using React.js, Node.js, MongoDB, TypeScript, AWS, and Docker.';
      doc.fillColor(textColor).fontSize(9).font('Helvetica').text(summaryText, { align: 'justify', lineGap: 2 });
      doc.moveDown(0.5);

      // --- SKILLS ---
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('TECHNICAL SKILLS');
      doc.moveDown(0.2);

      const skills = masterResume?.skills || [
        { category: 'Frontend', items: ['React.js', 'Next.js', 'JavaScript', 'TypeScript', 'Redux', 'RTK Query', 'HTML5/CSS3', 'Tailwind CSS'] },
        { category: 'Backend & DB', items: ['Node.js', 'Express.js', 'REST APIs', 'WebSockets', 'MongoDB', 'SQL', 'Mongoose'] },
        { category: 'Cloud & DevOps', items: ['AWS', 'EC2', 'S3', 'Docker', 'GitHub Actions', 'CI/CD', 'Nginx', 'Firebase'] },
        { category: 'Engineering', items: ['Jest', 'API Testing', 'RBAC', 'Performance Optimization', 'DSA', 'OOP'] }
      ];

      skills.forEach(cat => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor).text(`${cat.category}: `, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(textColor).text(cat.items.join(', '));
      });
      doc.moveDown(0.5);

      // --- EXPERIENCE ---
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('WORK EXPERIENCE');
      doc.moveDown(0.3);

      const experiences = masterResume?.experience || [
        {
          company: 'Togopool Pvt Ltd',
          role: 'Software Developer',
          period: 'July 2025 - Present',
          highlights: [
            'Engineered a full-stack order-import workflow mapping bulk data to application schemas, validating records, processing 200k+ orders per upload.',
            'Built real-time notification workflows using Firebase and Service Workers for push delivery and event-driven updates.',
            'Integrated Stripe payment workflows into client booking systems, handling checkout, card capture, and payment confirmation.',
            'Developed a full-stack corporate management panel for taxi clients, integrating booking workflows, driver operations, tracking, and RBAC.',
            'Implemented real-time driver and vehicle tracking using Google Maps with live location updates.'
          ]
        },
        {
          company: '100acress',
          role: 'Software Developer',
          period: 'October 2024 - June 2025',
          highlights: [
            'Architected a CRM lead-management module with auto-allocation, status tracking, and reassignment of inactive leads.',
            'Developed Node.js REST APIs for CRM workflows, implementing lead allocation and role-based business logic.',
            'Automated deployments using GitHub Actions, Docker, and AWS, replacing manual releases with a CI/CD pipeline.',
            'Optimized large datasets using virtualization and memoization, reducing application load times by 45%.'
          ]
        },
        {
          company: 'TawglUp',
          role: 'Software Developer Intern',
          period: 'January 2024 - September 2024',
          highlights: [
            'Built interactive interview chat and dashboard using WebSockets for real-time messaging and client status updates.'
          ]
        }
      ];

      experiences.forEach(exp => {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(primaryColor).text(`${exp.role} — ${exp.company}`, { continued: true });
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(accentColor).text(`  (${exp.period})`, { align: 'right' });
        doc.moveDown(0.2);

        exp.highlights.forEach(bullet => {
          doc.font('Helvetica').fontSize(8.5).fillColor(textColor).text(`•  ${bullet}`, { lineGap: 1.5, indent: 8 });
        });
        doc.moveDown(0.3);
      });

      // --- EDUCATION & PROJECTS ---
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('PROJECTS & EDUCATION');
      doc.moveDown(0.2);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryColor).text('Real Estate SaaS Platform: ', { continued: true });
      doc.font('Helvetica').fontSize(8.5).fillColor(textColor).text('Built full-stack property platform (React, Node, Express, MongoDB, AWS) serving 10k+ users.');

      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryColor).text('Education: ', { continued: true });
      doc.font('Helvetica').fontSize(8.5).fillColor(textColor).text('Bachelor of Computer Science — J.I.E.T Jodhpur (2019 - 2023 | SGPA: 8.5/10)');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
