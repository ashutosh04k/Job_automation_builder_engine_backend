import mongoose from 'mongoose';

const jobTargetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    jobDescription: {
      type: String,
      default: '',
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
    // Email Open & Link Tracking Fields
    isOpened: {
      type: Boolean,
      default: false,
    },
    openedAt: {
      type: Date,
      default: null,
    },
    lastOpenedAt: {
      type: Date,
      default: null,
    },
    openCount: {
      type: Number,
      default: 0,
    },
    clickedAt: {
      type: Date,
      default: null,
    },
    clickCount: {
      type: Number,
      default: 0,
    },
    lastOpenedIp: {
      type: String,
      default: '',
    },
    lastOpenedUserAgent: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.model('JobTarget', jobTargetSchema);
