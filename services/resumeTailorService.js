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

  // Combine matched skills first, followed by remaining default skills, ensuring strict uniqueness
  const combinedSkillsSet = new Set();

  // Add matched skills first for emphasis
  matched.forEach(s => combinedSkillsSet.add(s));

  // Add remaining base skills
  defaultSkillsList.forEach(s => combinedSkillsSet.add(s));

  const uniqueSkillsArray = Array.from(combinedSkillsSet);

  // Format skills string cleanly without repetitive duplicates
  let highlightedSkills = '';
  if (uniqueSkillsArray.length > 1) {
    const lastSkill = uniqueSkillsArray.pop();
    highlightedSkills = uniqueSkillsArray.join(', ') + ', and ' + lastSkill;
  } else {
    highlightedSkills = uniqueSkillsArray.join('');
  }

  const fullName = masterResume?.fullName || 'Ashutosh Kumar';
  const email = masterResume?.email || 'kumarasutosh2014@gmail.com';
  const phone = masterResume?.phone || '+91 8521975695';
  const title = targetRole || masterResume?.title || 'Software Developer | Frontend / Full Stack';
  const website = masterResume?.website || 'https://ashutosh-portfolio-8x6q.onrender.com/';
  const linkedin = masterResume?.linkedin || 'https://www.linkedin.com/in/ashutosh-kumar-sde/';
  const github = masterResume?.github || 'https://github.com/ashutosh04k';

  const tailoredSummary = `Results-driven Full Stack Developer with 3+ years of experience building scalable production-ready software, tailored for the ${title} role.`;

  // Plain personal-style email — avoids Gmail "Updates" tab, lands in Primary
  // No fancy boxes, no background colors, no marketing-style containers
  const htmlTemplate = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.7; max-width: 580px; margin: 0; padding: 20px;">

<p>Hi,</p>

<p>I'm <strong>${fullName}</strong>, a Full Stack Developer with 3+ years of experience. I came across your profile and wanted to reach out directly.</p>

<p>I have strong hands-on experience with <strong>${highlightedSkills}</strong>. I've built and shipped production applications across SaaS, real estate, logistics, and CRM platforms — focused on performance and clean architecture.</p>

<p>I'm currently open to <strong>Frontend / Full Stack Developer</strong> roles. I've attached my resume — would love to connect if there's a fit or if you know of any relevant openings.</p>

<p>
  LinkedIn: <a href="${linkedin}">${linkedin}</a><br>
  GitHub: <a href="${github}">${github}</a><br>
  Portfolio: <a href="${website}">${website}</a>
</p>

<p>
  Thanks,<br>
  <strong>${fullName}</strong><br>
  ${phone} | <a href="mailto:${email}">${email}</a>
</p>

</body>
</html>`;

  return {
    tailoredSummary,
    matchedKeywords: matched,
    htmlTemplate,
    subjectLine: `Application for ${title} - ${fullName} (3+ Yrs Exp)`
  };
}
