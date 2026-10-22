// Builds a realistic 2-page resume PDF in a layout different from ours
// (company and role on separate lines, MM/YYYY dates, "-" bullets, "Category:" skills,
// certifications, achievements and an unsupported "Languages" section).
import PDFDocument from 'pdfkit';

const ROLES = [
  { company: 'Acme Mobility Pvt Ltd', role: 'Senior Frontend Engineer', loc: 'Bengaluru, India', period: '07/2023 – Present', n: 8 },
  { company: 'Beta Realty', role: 'Software Engineer', loc: 'Gurugram, India', period: '01/2021 – 06/2023', n: 7 },
  { company: 'Gamma Labs', role: 'Frontend Developer', loc: 'Remote', period: '06/2019 – 12/2020', n: 6 },
  { company: 'Delta Soft', role: 'Software Engineering Intern', loc: 'Pune, India', period: '01/2019 – 05/2019', n: 4 }
];
const BULLETS = [
  'Built a React and TypeScript dashboard with Redux Toolkit used by 300+ dispatchers to monitor live fleet movement across 12 cities.',
  'Designed Node.js and Express REST APIs backed by MongoDB for bulk order import, processing 200k+ records per upload with validation.',
  'Cut page load time by 45% through code splitting, lazy loading, memoization and list virtualization on data-heavy screens.',
  'Set up GitHub Actions CI/CD with Docker images deployed to AWS EC2, reducing release time from hours to minutes.',
  'Introduced Jest and React Testing Library, raising unit test coverage from 20% to 75% on critical booking flows.',
  'Implemented WebSocket based real-time notifications for drivers and dispatchers, replacing a polling approach.',
  'Mentored three junior developers through code reviews and pairing sessions on accessibility and performance.',
  'Integrated Stripe payments with secure card capture, refunds and webhook-driven booking confirmation.'
];

export function buildLongResumePdf() {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const W = doc.page.width - 100;
    const heading = (t) => { doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).text(t.toUpperCase()); doc.moveDown(0.3); };
    const body = () => doc.font('Helvetica').fontSize(10.5);
    const bullet = (t) => { body(); doc.text(`- ${t}`, { indent: 0, width: W }); doc.moveDown(0.15); };

    doc.font('Helvetica-Bold').fontSize(24).text('Priya Sharma');
    doc.font('Helvetica').fontSize(12).text('Senior Frontend Engineer | React | TypeScript');
    body().text('priya.sharma@example.com | +91 98765 43210 | linkedin.com/in/priya-sharma-dev | Bengaluru, India');

    heading('Professional Summary');
    body().text('Frontend engineer with 6 years of experience building fast, accessible React applications for logistics and real estate products. Comfortable across Node.js services and AWS deployments.', { width: W });

    heading('Work Experience');
    for (const r of ROLES) {
      doc.font('Helvetica-Bold').fontSize(11).text(r.company);
      const y = doc.y;
      doc.font('Helvetica-Oblique').fontSize(10.5).text(`${r.role} | ${r.loc}`, 50, y);
      doc.font('Helvetica').fontSize(10.5).text(r.period, 50, y, { width: W, align: 'right' });
      doc.moveDown(0.2);
      BULLETS.slice(0, r.n).forEach(bullet);
      doc.moveDown(0.4);
    }

    heading('Technical Skills');
    body();
    doc.text('Languages: JavaScript, TypeScript, Python');
    doc.text('Frontend: React, Next.js, Redux Toolkit, Tailwind CSS, Storybook');
    doc.text('Backend: Node.js, Express, REST APIs, GraphQL');
    doc.text('Cloud & Tools: AWS, Docker, GitHub Actions, Jest, Cypress');

    heading('Projects');
    doc.font('Helvetica-Bold').fontSize(11).text('Fleet Tracker (React, Node.js, Socket.IO)');
    body().text('github.com/priya/fleet-tracker');
    bullet('Open-source live vehicle tracker with map clustering and offline support.');
    bullet('Used by two local delivery startups in production.');
    doc.font('Helvetica-Bold').fontSize(11).text('Recipe Planner — Next.js, Prisma, PostgreSQL');
    bullet('Meal planning app with server-side rendering and a shopping list generator.');

    heading('Education');
    body();
    doc.text('B.Tech in Computer Science, National Institute of Technology, 2015 – 2019, CGPA 8.2/10');
    doc.text('Class XII, Delhi Public School, 2015, 92%');

    heading('Certifications');
    bullet('AWS Certified Developer – Associate (2022)');
    bullet('Meta Front-End Developer Professional Certificate (2021)');

    heading('Achievements');
    bullet('Winner, Smart India Hackathon 2018 (logistics track).');
    bullet('Speaker at ReactFoo Bengaluru 2023 on list virtualization.');

    heading('Languages');
    body().text('English, Hindi, Kannada');
    doc.end();
  });
}
