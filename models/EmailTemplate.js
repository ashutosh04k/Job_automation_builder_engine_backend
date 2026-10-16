import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    subject: {
      type: String,
      default: 'Application for {{role}} at {{company}} || (3+ Years) | Open to {{role}} Roles'
    },
    body: {
      type: String,
      default: `Hi Sir/Maam,

I hope you're doing well.

My name is {{name}}, and I'm a Full Stack Developer with over 3 years of experience building and shipping production applications. I came across your profile and wanted to reach out directly.

My core stack includes React.js, Next.js, TypeScript, Node.js, Express.js, and MongoDB, supported by hands-on experience with Redux, REST APIs, WebSockets, Tailwind CSS, Material UI, AWS, Docker, and CI/CD pipelines. I have delivered applications across SaaS, real estate, logistics, and CRM platforms, with a consistent focus on performance and clean, maintainable architecture.

I'm currently exploring {{role}} opportunities. I've attached my resume for your reference and would welcome the chance to connect if there is a suitable opening on your team, or if you know of a relevant role elsewhere.

LinkedIn: {{linkedin}}
GitHub: {{github}}
Portfolio: {{portfolio}}
Resume: {{resume}}

Thank you for your time and consideration.

Best regards,
{{name}}
{{phone}} | {{email}}`
    }
  },
  { timestamps: true }
);

export default mongoose.model('EmailTemplate', emailTemplateSchema);
