import PDFDocument from 'pdfkit';

/**
 * Smart ATS Keyword Matcher & Bullet Ranker
 * Scores and reorders resume items based on job description keywords
 */
function scoreTextAgainstKeywords(text, keywords = []) {
  if (!text || !keywords || keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 1;
  }
  return score;
}

export function extractJdKeywords(jobDescription = '', targetRole = '') {
  const combined = `${jobDescription} ${targetRole}`.toLowerCase();
  const keywordDict = [
    'react', 'react.js', 'next.js', 'nextjs', 'typescript', 'javascript', 'node', 'node.js',
    'express', 'mongodb', 'sql', 'postgres', 'postgresql', 'mysql', 'aws', 'docker', 'kubernetes',
    'redux', 'rtk query', 'tailwind', 'material ui', 'websockets', 'firebase', 'stripe', 'payment',
    'ci/cd', 'github actions', 'nginx', 'graphql', 'rest api', 'microservices', 'seo', 'crm',
    'llm', 'ai', 'langchain', 'jest', 'cypress', 'performance', 'virtualization', 'memoization',
    'rbac', 'push notification', 'google maps', 'tracking', 'order', 'ecommerce', 'e-commerce',
    'saas', 'python', 'java', 'frontend', 'backend', 'full stack', 'cloud'
  ];

  return keywordDict.filter(kw => combined.includes(kw));
}

/**
 * Generate a Tailored ATS PDF Resume Buffer
 * Recreates Ashutosh Kumar's LaTeX Resume dynamically adapted to target role & JD
 * @param {Object} masterResume 
 * @param {Object} tailoredData { targetRole, companyName, jobDescription, matchedKeywords }
 * @returns {Promise<Buffer>} PDF Buffer
 */
export function generateResumePDF(masterResume = {}, tailoredData = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 22,
        bufferPages: true
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      const pageWidth = doc.page.width; // 595.28
      const pageHeight = doc.page.height; // 841.89
      const margin = 22;
      const contentWidth = pageWidth - (margin * 2);

      const primaryColor = '#0f172a'; // Deep slate navy
      const subtitleColor = '#0284c7'; // Professional accent blue
      const textColor = '#334155'; // Dark slate body text
      const lightLineColor = '#cbd5e1'; // Muted border
      const metaColor = '#64748b'; // Gray metadata

      const targetRole = tailoredData.targetRole || masterResume?.title || 'Software Developer | Full Stack Developer';
      const jd = tailoredData.jobDescription || '';
      const keywords = extractJdKeywords(jd, targetRole);

      // --- 1. HEADER (LaTeX-matched) ---
      doc.font('Helvetica-Bold').fontSize(18).fillColor(primaryColor)
         .text('Ashutosh Kumar', { align: 'center', link: 'https://ashutosh-portfolio-8x6q.onrender.com/' });
      doc.moveDown(0.12);

      // Dynamic Subheading: Tailored to role + tech stack
      let roleSubtitle = `${targetRole} | React.js | Node.js | TypeScript | AWS`;
      if (targetRole.toLowerCase().includes('frontend') || targetRole.toLowerCase().includes('react') || targetRole.toLowerCase().includes('ui')) {
        roleSubtitle = `${targetRole} | React.js | Next.js | TypeScript | Redux | Tailwind CSS`;
      } else if (targetRole.toLowerCase().includes('backend') || targetRole.toLowerCase().includes('node') || targetRole.toLowerCase().includes('api')) {
        roleSubtitle = `${targetRole} | Node.js | Express | REST APIs | MongoDB | AWS | Docker`;
      }
      doc.font('Helvetica-Bold').fontSize(9).fillColor(subtitleColor).text(roleSubtitle, { align: 'center' });
      doc.moveDown(0.12);

      // Contact Row with Clickable Hyperlinks
      doc.font('Helvetica').fontSize(8).fillColor(textColor);
      doc.text('Gurgaon, Haryana  |  ', { continued: true, align: 'center' })
         .text('+91 85219 75695', { link: 'tel:+918521975695', continued: true, underline: false })
         .text('  |  ', { continued: true })
         .text('Portfolio', { link: 'https://ashutosh-portfolio-8x6q.onrender.com/', continued: true, underline: true })
         .text('  |  ', { continued: true })
         .text('Mail', { link: 'mailto:kumarasutosh2014@gmail.com', continued: true, underline: true })
         .text('  |  ', { continued: true })
         .text('LinkedIn', { link: 'https://www.linkedin.com/in/ashutosh-kumar-sde/', continued: true, underline: true })
         .text('  |  ', { continued: true })
         .text('GitHub', { link: 'https://github.com/ashutosh04k', underline: true });

      doc.moveDown(0.2);

      // Helper for Section Titles (LaTeX rSection equivalent)
      function renderSectionHeader(title) {
        doc.moveDown(0.22);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(primaryColor).text(title.toUpperCase());
        const lineY = doc.y + 1;
        doc.strokeColor(lightLineColor).lineWidth(0.6).moveTo(margin, lineY).lineTo(pageWidth - margin, lineY).stroke();
        doc.moveDown(0.25);
      }

      // --- 2. EXPERIENCE SECTION ---
      renderSectionHeader('EXPERIENCE');

      const experiencesData = [
        {
          company: 'Togopool Pvt Ltd',
          role: targetRole.toLowerCase().includes('lead') ? 'Software Developer' : (targetRole.toLowerCase().includes('frontend') ? 'Frontend / Full Stack Developer' : 'Software Developer'),
          period: 'July 2025 - Present',
          bullets: [
            'Engineered a full-stack order-import workflow mapping bulk data to application schemas, validating records, surfacing errors, processing 200k+ orders/upload, and triggering route optimization for driver assignment.',
            'Orchestrated a Real-time Notification service using Firebase & Service Workers for push delivery and event-driven updates.',
            'Integrated Stripe payment gateway into client booking workflows, handling checkout, secure card capture, and payment confirmation.',
            'Delivered a Chat support system for Dubai Emirates, enabling communication between Drivers, Pilots, and support teams.',
            'Designed a full-stack corporate management panel for a taxi client, integrating booking workflows, driver operations, real-time tracking, RBAC, and backend APIs.',
            'Implemented real-time driver/vehicle tracking using Google Maps with live location updates for Secure Express operations.',
            'Configured driver operations with RBAC, shift scheduling, and push notifications for role-specific Gala workflows.',
            'Optimized navigation performance by 25% through asset splitting, route-level lazy loading, and optimized bundle delivery.',
            'Contributing to an AI-powered code generation platform using LLM-driven scaffolding and component generation.'
          ]
        },
        {
          company: '100acress',
          role: 'Software Developer',
          period: 'Oct 2024 - June 2025',
          bullets: [
            'Architected a CRM lead-management module with auto-allocation, status tracking, and priority management, automatically returning inactive leads to upper management after a defined period.',
            'Developed Node.js REST APIs for CRM workflows, implementing lead allocation, status updates, and role-based business logic.',
            'Automated deployments using GitHub Actions, Docker, and AWS, replacing manual releases with a CI/CD pipeline.',
            'Managed application deployment on AWS EC2 with Nginx, configuring production environments and reverse-proxy routing.',
            'Crafted pixel-accurate, responsive React interfaces from Figma specifications with keyboard navigation and ARIA labeling.',
            'Restructured client state using Redux and RTK Query, eliminating stale-cache issues and improving API data synchronization.',
            'Accelerated large datasets using virtualization and memoization, reducing application load times by 45%.'
          ]
        },
        {
          company: 'TawglUp',
          role: 'Software Developer - Intern',
          period: 'Jan 2024 - Sep 2024',
          bullets: [
            'Created an interactive interview Chat system & Dashboard using WebSockets for real-time messaging and client updates.',
            'Established a real-time notification service using WebSockets, implementing backend event handling for server-to-client interview status updates.'
          ]
        }
      ];

      experiencesData.forEach(exp => {
        // Company & Role Header line
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor(primaryColor).text(`${exp.role}`, { continued: true });
        doc.font('Helvetica').fontSize(8.8).fillColor(textColor).text(` at `, { continued: true });
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor(primaryColor).text(`${exp.company}`, { continued: true });
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(metaColor).text(`${exp.period}`, { align: 'right' });
        doc.moveDown(0.12);

        // Smart ATS Reorder: Sort bullets with matched keywords first
        const sortedBullets = [...exp.bullets].sort((a, b) => {
          const scoreB = scoreTextAgainstKeywords(b, keywords);
          const scoreA = scoreTextAgainstKeywords(a, keywords);
          return scoreB - scoreA;
        });

        sortedBullets.forEach(b => {
          doc.font('Helvetica').fontSize(7.8).fillColor(textColor)
             .text(`•  ${b}`, { indent: 6, lineGap: 1.1 });
        });
        doc.moveDown(0.18);
      });

      // --- 3. SKILLS SECTION ---
      renderSectionHeader('SKILLS');

      const skillsList = [
        { label: 'Languages', text: 'JavaScript, TypeScript, C++, C' },
        { label: 'Frontend', text: 'React.js, Next.js, Redux, RTK Query, HTML5, CSS3, SCSS, Tailwind CSS' },
        { label: 'Backend', text: 'Node.js, Express, REST APIs, WebSockets' },
        { label: 'Databases', text: 'MongoDB, SQL, Mongoose' },
        { label: 'Cloud / DevOps', text: 'AWS (EC2, S3), Docker, Firebase, CI/CD, GitHub Actions, Nginx' },
        { label: 'Testing', text: 'Jest, React Testing Library, API Testing' },
        { label: 'Engineering', text: 'Data Structures & Algorithms, OOPS, RBAC, Performance Optimization' }
      ];

      // Reorder skills list so relevant categories match JD first
      skillsList.sort((a, b) => {
        const scoreB = scoreTextAgainstKeywords(b.text, keywords);
        const scoreA = scoreTextAgainstKeywords(a.text, keywords);
        return scoreB - scoreA;
      });

      skillsList.forEach(item => {
        doc.font('Helvetica-Bold').fontSize(7.8).fillColor(primaryColor).text(`${item.label}: `, { continued: true, indent: 4 });
        doc.font('Helvetica').fontSize(7.8).fillColor(textColor).text(item.text, { lineGap: 1.1 });
      });

      // --- 4. EDUCATION SECTION ---
      renderSectionHeader('EDUCATION');
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(primaryColor).text('Bachelor of Computer Science', { continued: true });
      doc.font('Helvetica').fontSize(8.2).fillColor(textColor).text(', J.I.E.T Jodhpur (SGPA: 8.5/10)', { continued: true });
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(metaColor).text('2019 - 2023', { align: 'right' });

      // --- 5. PROJECTS SECTION ---
      renderSectionHeader('PROJECTS');

      const projectsData = [
        {
          title: 'Real Estate SAAS Platform',
          tech: 'React JS, Node JS, Express, MongoDB, AWS',
          linkText: '(Try It)',
          url: 'https://www.100acress.com/',
          bullets: [
            'Engineered a full-stack property platform with React/Next.js, Node/Express, MongoDB, and dynamic admin management.',
            'Automated dynamic SEO configuration via admin panel, managing metadata, slugs, and page settings without code changes.',
            'Enhanced On-Page SEO and load performance with server-side rendering, raising Lighthouse score from 27 to 73.',
            'Deployed on AWS EC2 with Nginx reverse proxy, SSL, and caching, serving 10k+ users with stable production performance.'
          ]
        },
        {
          title: 'E-commerce Platform',
          tech: 'React, Node/Express, MongoDB',
          linkText: '(GitHub)',
          url: 'https://github.com/ashutosh04k/console-frontend-app',
          bullets: [
            'Constructed an e-commerce platform with React, Node/Express, and MongoDB covering products, cart, checkout, and orders.',
            'Developed backend APIs for product management and admin workflows across two applications with product allocation.',
            'Integrated payment, delivery tracking, and inventory management with synchronized stock updates across customer and admin portals.'
          ]
        }
      ];

      // Sort projects by JD relevance
      projectsData.sort((a, b) => {
        const scoreB = scoreTextAgainstKeywords(`${b.title} ${b.tech} ${b.bullets.join(' ')}`, keywords);
        const scoreA = scoreTextAgainstKeywords(`${a.title} ${a.tech} ${a.bullets.join(' ')}`, keywords);
        return scoreB - scoreA;
      });

      projectsData.forEach(p => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor).text(p.title, { continued: true });
        doc.font('Helvetica').fontSize(8).fillColor(textColor).text(` --- ${p.tech}`, { continued: true });
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(subtitleColor).text(`  ${p.linkText}`, { align: 'right', link: p.url, underline: true });
        doc.moveDown(0.1);

        const sortedProjBullets = [...p.bullets].sort((a, b) => {
          return scoreTextAgainstKeywords(b, keywords) - scoreTextAgainstKeywords(a, keywords);
        });

        sortedProjBullets.forEach(b => {
          doc.font('Helvetica').fontSize(7.8).fillColor(textColor).text(`•  ${b}`, { indent: 6, lineGap: 1.1 });
        });
        doc.moveDown(0.15);
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
