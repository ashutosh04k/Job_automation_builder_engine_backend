/**
 * Smart Resume Tailor Service - Dynamic Email Pitch Generator
 * Renders user-customized templates with dynamic tags and recruiter alignment
 */

export function renderEmailTemplate(template, { masterResume, targetRole, companyName }) {
  const name = masterResume?.fullName || 'Applicant';
  const email = masterResume?.email || '';
  const phone = masterResume?.phone || '';
  const role = targetRole || masterResume?.title || 'Software Developer';
  const company = companyName || 'your company';
  const linkedin = masterResume?.linkedin || '';
  const github = masterResume?.github || '';
  const portfolio = masterResume?.website || '';

  // Extract skills string
  let skillsStr = 'React.js, Next.js, TypeScript, Node.js, Express.js, MongoDB, REST APIs, Tailwind CSS, AWS, and Docker';
  if (masterResume?.skills && Array.isArray(masterResume.skills) && masterResume.skills.length > 0) {
    const allItems = masterResume.skills.flatMap(s => s.items || []);
    if (allItems.length > 0) {
      skillsStr = allItems.slice(0, 10).join(', ');
    }
  }

  let rawSubject = template?.subject || '';
  if (!rawSubject || rawSubject.trim() === 'Full Stack Developer (3+ Years) | Open to Frontend / Full Stack Roles') {
    rawSubject = 'Application for {{role}} at {{company}} || (3+ Years) | Open to {{role}} Roles';
  }

  // Replace any legacy static role text in subject
  if (role) {
    rawSubject = rawSubject.replace(/Full Stack Developer/g, role);
    rawSubject = rawSubject.replace(/Frontend \/ Full Stack/g, role);
  }

  let rawBody = template?.body || '';
  if (role) {
    rawBody = rawBody.replace(/Frontend and Full Stack Developer/g, role);
    rawBody = rawBody.replace(/Frontend and Full Stack/g, role);
  }

  // Replace placeholders in subject
  const subjectLine = rawSubject
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*role\s*\}\}/gi, role)
    .replace(/\{\{\s*company\s*\}\}/gi, company)
    .replace(/\{\{\s*email\s*\}\}/gi, email)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone);

  // Replace placeholders in text body
  let textBody = rawBody
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*role\s*\}\}/gi, role)
    .replace(/\{\{\s*company\s*\}\}/gi, company)
    .replace(/\{\{\s*email\s*\}\}/gi, email)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*skills\s*\}\}/gi, skillsStr)
    .replace(/\{\{\s*linkedin\s*\}\}/gi, linkedin)
    .replace(/\{\{\s*github\s*\}\}/gi, github)
    .replace(/\{\{\s*portfolio\s*\}\}/gi, portfolio);

  // Convert paragraphs and auto-link URLs for HTML email body
  const htmlBody = textBody
    .split(/\n\n+/)
    .map(para => {
      const linked = para
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color: #0284c7; text-decoration: underline;">$1</a>')
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1" style="color: #0284c7; text-decoration: underline;">$1</a>')
        .replace(/\n/g, '<br>');
      return `<p style="margin: 0 0 16px 0;">${linked}</p>`;
    })
    .join('\n');

  const htmlTemplate = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.7; max-width: 600px; margin: 0; padding: 20px;">
${htmlBody}
</body>
</html>`;

  return { subjectLine, textBody, htmlTemplate };
}

export function generateTailoredResume(
  masterResume, 
  jobDescription = '', 
  targetRole = 'Software Developer | Frontend / Full Stack',
  template = null,
  companyName = ''
) {
  const jdText = (jobDescription || '').toLowerCase();

  const defaultSkillsList = [
    'React.js', 'JavaScript', 'TypeScript', 'Redux', 'Node.js',
    'Express.js', 'MongoDB', 'REST APIs', 'Tailwind CSS', 'Material UI',
    'Next.js', 'AWS', 'Docker', 'WebSockets', 'CI/CD'
  ];

  const matched = defaultSkillsList.filter(skill => jdText.includes(skill.toLowerCase()));

  // If a custom template is provided, use it
  if (template && (template.body || template.subject)) {
    const rendered = renderEmailTemplate(template, {
      masterResume,
      targetRole,
      companyName
    });

    return {
      tailoredSummary: `Personalized cold outreach tailored for ${targetRole}`,
      matchedKeywords: matched,
      htmlTemplate: rendered.htmlTemplate,
      subjectLine: rendered.subjectLine,
      textBody: rendered.textBody
    };
  }

  // Fallback default message
  const fullName = masterResume?.fullName || 'Applicant';
  const email = masterResume?.email || '';
  const phone = masterResume?.phone || '';
  const website = masterResume?.website || '';
  const linkedin = masterResume?.linkedin || '';
  const github = masterResume?.github || '';

  const defaultTemplate = {
    subject: `Application for {{role}} at {{company}} || (3+ Years) | Open to {{role}} Roles`,
    body: `Hi Sir/Maam,

I hope you're doing well.

My name is {{name}}, and I'm a Full Stack Developer with over 3 years of experience building and shipping production applications. I came across your profile and wanted to reach out directly.

My core stack includes React.js, Next.js, TypeScript, Node.js, Express.js, and MongoDB, supported by hands-on experience with Redux, REST APIs, WebSockets, Tailwind CSS, Material UI, AWS, Docker, and CI/CD pipelines. I have delivered applications across SaaS, real estate, logistics, and CRM platforms, with a consistent focus on performance and clean, maintainable architecture.

I'm currently exploring {{role}} opportunities. I've attached my resume for your reference and would welcome the chance to connect if there is a suitable opening on your team, or if you know of a relevant role elsewhere.

LinkedIn: {{linkedin}}
GitHub: {{github}}
Portfolio: {{portfolio}}

Thank you for your time and consideration.

Best regards,
{{name}}
{{phone}} | {{email}}`
  };

  const rendered = renderEmailTemplate(defaultTemplate, {
    masterResume,
    targetRole,
    companyName
  });

  return {
    tailoredSummary: `Results-driven Full Stack Developer tailored for ${targetRole}`,
    matchedKeywords: matched,
    htmlTemplate: rendered.htmlTemplate,
    subjectLine: rendered.subjectLine,
    textBody: rendered.textBody
  };
}
