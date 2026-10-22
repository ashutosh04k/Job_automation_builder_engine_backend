// Small, self-contained profile for tests (no personal data).
export const PROFILE = {
  fullName: 'Test Candidate',
  email: 'candidate@example.com',
  phone: '+91 90000 00000',
  linkedin: 'https://linkedin.com/in/example',
  location: 'Gurugram, Haryana',
  title: 'Software Developer',
  skills: [
    { category: 'Frontend', items: ['React.js', 'Redux', 'TypeScript', 'Tailwind CSS', 'HTML5/CSS3'] },
    { category: 'Backend', items: ['Node.js', 'Express.js', 'MongoDB', 'REST APIs'] },
    { category: 'DevOps', items: ['AWS', 'Docker', 'GitHub Actions'] }
  ],
  experience: [
    {
      company: 'Acme Mobility', role: 'Software Developer', period: 'July 2025 - Present',
      highlights: [
        'Built a React.js dashboard with Redux for live fleet tracking used by 300 dispatchers.',
        'Wrote Node.js REST APIs with Express.js and MongoDB for bulk order import.',
        'Set up Docker builds and GitHub Actions CI/CD for three services.'
      ]
    },
    {
      company: 'Beta Realty', role: 'Software Developer', period: 'Oct 2023 - June 2025',
      highlights: [
        'Improved listing page load time by 45% with virtualization and memoization in React.js.',
        'Deployed services on AWS EC2 behind Nginx.'
      ]
    }
  ],
  education: [{ degree: 'B.Tech Computer Science', institution: 'Example University', period: '2019 - 2023' }],
  projects: [
    { name: 'Resume Tailor', technologies: ['React.js', 'Node.js'], highlights: ['Generates a tailored PDF per job description.'] }
  ]
};

export const FRONTEND_JD = `Frontend Developer (ReactJS)
Requirements:
- 2+ years of experience building web apps with ReactJS and TypeScript
- Strong Redux and Tailwind CSS skills
- Experience with Jest
Nice to have:
- GraphQL
- Next.js`;
