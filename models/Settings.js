import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    smtpHost: { type: String, default: 'smtp.gmail.com' },
    smtpPort: { type: Number, default: 587 },
    smtpSecure: { type: Boolean, default: false }, // true for 465, false for other ports
    smtpUser: { type: String, default: '' },
    smtpPass: { type: String, default: '' },
    senderName: { type: String, default: 'Resume Automation System' },
    senderEmail: { type: String, default: '' },
    cronTime: { type: String, default: '0 9 * * *' }, // Daily 9:00 AM
    enableCron: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Settings', settingsSchema);
