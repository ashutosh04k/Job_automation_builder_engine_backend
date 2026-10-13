/**
 * Smart Resume Tailor Service - Ashutosh Kumar Email Generator
 * Plain personal email style to land in Gmail Primary (not Updates/Promotions)
 */

export function generateTailoredResume(masterResume, jobDescription = '', targetRole = 'Software Developer | Frontend / Full Stack') {
  const jdText = (jobDescription || '').toLowerCase();

  // Primary curated skill list in clean Title Case
  const defaultSkillsList = [
    'React.js',
    'JavaScript',
    'TypeScript',
    'Redux',
    'Node.js',
    'Express.js',
    'MongoDB',
    'REST APIs',
    'Tailwind CSS',
    'Material UI',
    'Next.js',
    'AWS',
    'Docker',
    'WebSockets',
    'CI/CD'
  ];

  // Match JD keywords case-insensitively
  const matched = defaultSkillsList.filter(skill => jdText.includes(skill.toLowerCase()));

  const fullName = masterResume?.fullName || 'Ashutosh Kumar';
  const email = masterResume?.email || 'kumarasutosh2014@gmail.com';
  const phone = masterResume?.phone || '8521975695';
  const website = masterResume?.website || 'https://ashutosh-portfolio-8x6q.onrender.com/';
  const linkedin = masterResume?.linkedin || 'https://www.linkedin.com/in/ashutosh-kumar-sde';
  const github = masterResume?.github || 'https://github.com/ashutosh04k';

  const tailoredSummary = `Results-driven Full Stack Developer with 3+ years of experience building scalable production-ready software.`;

  // Clean personal-style outreach email
  const htmlTemplate = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.7; max-width: 600px; margin: 0; padding: 20px;">

<p>Hi Sir/Maam,</p>

<p>I hope you're doing well.</p>

<p>My name is <strong>${fullName}</strong>, and I'm a Full Stack Developer with over 3 years of experience building and shipping production applications. I came across your profile and wanted to reach out directly.</p>

<p>My core stack includes React.js, Next.js, TypeScript, Node.js, Express.js, and MongoDB, supported by hands-on experience with Redux, REST APIs, WebSockets, Tailwind CSS, Material UI, AWS, Docker, and CI/CD pipelines. I have delivered applications across SaaS, real estate, logistics, and CRM platforms, with a consistent focus on performance and clean, maintainable architecture.</p>

<p>I'm currently exploring Frontend and Full Stack Developer opportunities. I've attached my resume for your reference and would welcome the chance to connect if there is a suitable opening on your team, or if you know of a relevant role elsewhere.</p>

<p>
  LinkedIn: <a href="${linkedin}">${linkedin}</a><br>
  GitHub: <a href="${github}">${github}</a><br>
  Portfolio: <a href="${website}">${website}</a>
</p>

<p>Thank you for your time and consideration.</p>

<p>
  Best regards,<br>
  <strong>${fullName}</strong><br>
  ${phone} | <a href="mailto:${email}">${email}</a>
</p>

</body>
</html>`;

  return {
    tailoredSummary,
    matchedKeywords: matched,
    htmlTemplate,
    subjectLine: `Full Stack Developer (3+ Years) | Open to Frontend / Full Stack Roles`
  };
}
