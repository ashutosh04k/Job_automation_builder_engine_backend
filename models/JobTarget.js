import mongoose from 'mongoose';

const jobTargetSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    jobDescription: {
      type: String,
      required: true,
    },
    targetRole: {
      type: String,
      default: 'Software Engineer',
    },
    companyName: {
      type: String,
      default: 'Target Company',
    },
    cronSchedule: {
      type: String,
      default: '0 9 * * *', // Every day at 9:00 AM
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    totalSentCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'error', 'completed'],
      default: 'active',
    },
  },
  { timestamps: true }
);

export default mongoose.model('JobTarget', jobTargetSchema);
