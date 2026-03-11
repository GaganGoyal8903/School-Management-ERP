const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  grade: { type: String, required: true },
  description: { type: String },
  fileUrl: { type: String },
  fileName: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Material', materialSchema);

