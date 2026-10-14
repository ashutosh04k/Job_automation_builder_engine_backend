import mongoose from 'mongoose';

const questionItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  category: { type: String, default: 'General' }, // 'Contact', 'Links', 'Experience', 'Education', 'Custom Q&A'
  question: { type: String, required: true },
  keywords: { type: [String], default: [] },
  answer: { type: String, default: '' },
  type: { type: String, enum: ['text', 'textarea', 'number', 'select'], default: 'text' },
  isDefault: { type: Boolean, default: false }
});

const autoFillProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    rules: [questionItemSchema]
  },
  { timestamps: true }
);

export default mongoose.model('AutoFillProfile', autoFillProfileSchema);
