import mongoose from 'mongoose';

const masterResumeSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: 'Ashutosh Kumar' },
    email: { type: String, default: 'kumarasutosh2014@gmail.com' },
    phone: { type: String, default: '8521975695' },
    location: { type: String, default: 'Gurgaon, Haryana' },
    website: { type: String, default: 'https://ashutosh-portfolio-8x6q.onrender.com/' },
    linkedin: { type: String, default: 'https://www.linkedin.com/in/ashutosh-kumar-sde' },
    github: { type: String, default: 'https://github.com/ashutosh04k' },
    title: { type: String, default: 'Software Developer | Full Stack Developer' },
    summary: {
      type: String,
      default:
        'Full Stack Software Developer with 3+ years of experience building scalable web applications, REST APIs, real-time systems, CRM platforms, and data-intensive workflows using React.js, Node.js, MongoDB, TypeScript, AWS, and Docker.',
    },
    skills: [
      {
        category: { type: String, default: 'Frontend' },
        items: [{ type: String }],
      },
    ],
    experience: [
      {
        company: String,
        role: String,
        period: String,
        location: String,
        highlights: [String],
      },
    ],
    education: [
      {
        degree: String,
        institution: String,
        period: String,
        score: String,
      },
    ],
    projects: [
      {
        name: String,
        technologies: [String],
        highlights: [String],
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('MasterResume', masterResumeSchema);
