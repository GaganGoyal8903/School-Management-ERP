const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  grade: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);

