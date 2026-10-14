import mongoose from 'mongoose';

const logEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobTarget' },
    recipientEmail: { type: String, required: true },
    jobDescriptionSnippet: { type: String },
    status: { type: String, enum: ['success', 'failed', 'simulated'], required: true },
    triggeredBy: { type: String, enum: ['cron', 'manual', 'test'], default: 'cron' },
    details: { type: String },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('LogEntry', logEntrySchema);
