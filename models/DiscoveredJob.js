import mongoose from 'mongoose';

const discoveredJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    jobId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    jobUrl: {
      type: String,
      required: true,
      trim: true,
    },
    applyType: {
      type: String,
      enum: ['easy_apply', 'external'],
      default: 'external',
    },
    isEasyApply: {
      type: Boolean,
      default: false,
    },
    postedTime: {
      type: String,
      default: '',
      trim: true,
    },
    jobDescription: {
      type: String,
      default: '',
    },
    atsScore: {
      type: Number,
      default: 85,
    },
    status: {
      type: String,
      enum: ['new', 'applied', 'queued', 'archived'],
      default: 'new',
    },
  },
  { timestamps: true }
);

// Compound index so a user doesn't duplicate the same job ID
discoveredJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export default mongoose.model('DiscoveredJob', discoveredJobSchema);
