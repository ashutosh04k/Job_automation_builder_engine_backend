import mongoose from 'mongoose';

const masterResumeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    website: { type: String, default: '' },
    resumeUrl: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    title: { type: String, default: '' },
    summary: { type: String, default: '' },
    skills: [
      {
        category: { type: String, default: 'Core Skills' },
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
    certifications: [{ type: String }],
    achievements: [{ type: String }],
    projects: [
      {
        name: String,
        link: { type: String, default: '' },
        technologies: [String],
        highlights: [String],
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('MasterResume', masterResumeSchema);
