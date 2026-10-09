/**
 * Smart Resume Tailor Service - Ashutosh Kumar Email Generator
 * Formats cold outreach email body, title-cases skills, and eliminates duplicates.
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

  // Professional Email HTML Template
  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; line-height: 1.6; }
    .email-container { max-width: 640px; margin: 20px auto; background: #ffffff; padding: 36px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .greeting { font-size: 16px; margin-bottom: 16px; font-weight: 500; }
    .paragraph { font-size: 15px; color: #334155; margin-bottom: 18px; line-height: 1.65; }
    .links-section { margin: 24px 0; font-size: 14.5px; }
    .links-section a { color: #0284c7; text-decoration: none; font-weight: 600; }
    .signature { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14.5px; color: #1e293b; }
    .attachment-notice { font-size: 13px; color: #059669; background: #ecfdf5; padding: 10px 14px; border-radius: 6px; border: 1px solid #a7f3d0; margin-top: 20px; display: inline-block; font-weight: 600; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="greeting">Hi,</div>
    
    <div class="paragraph">
      I’m <strong>${fullName}</strong>, a Software Developer with <strong>3 years of experience</strong> building scalable, production-ready software.
    </div>

    <div class="paragraph">
      My core expertise includes <strong>${highlightedSkills}</strong>. I’ve worked on SaaS, real estate, logistics, and complex admin platforms, with a strong focus on performance, reusable architecture, responsive UI, and seamless UX.
    </div>

    <div class="paragraph">
      I’m currently exploring <strong>Frontend / Full-Stack Developer</strong> opportunities where I can contribute to impactful products and grow with a strong engineering team.
    </div>

    <div class="paragraph">
      I’d appreciate it if you could consider my profile for any relevant openings or referrals.
    </div>

    <div class="attachment-notice">
      📎 Attached: Ashutosh_Kumar_Resume.pdf
    </div>

    <div class="links-section">
      LinkedIn: <a href="${linkedin}" target="_blank">${linkedin}</a><br/>
      GitHub: <a href="${github}" target="_blank">${github}</a><br/>
      Portfolio: <a href="${website}" target="_blank">${website}</a>
    </div>

    <div class="signature">
      Thanks,<br/>
      <strong>${fullName}</strong><br/>
      ${title}<br/>
      📞 ${phone}
    </div>
  </div>
</body>
</html>
  `;

  return {
    tailoredSummary,
    matchedKeywords: matched,
    htmlTemplate,
    subjectLine: `Application for ${title} - ${fullName} (3+ Yrs Exp)`
  };
}
