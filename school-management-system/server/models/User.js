const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true }, // Role-based unique enforced by SQL
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'teacher', 'student', 'parent'], 
    default: 'student' 
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  const rawPassword = String(this.password || '');
  if (!rawPassword) {
    return next();
  }

  if (BCRYPT_HASH_PATTERN.test(rawPassword)) {
    return next();
  }

  this.password = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  const storedPassword = String(this.password || '');
  if (!storedPassword) {
    return false;
  }

  if (!BCRYPT_HASH_PATTERN.test(storedPassword)) {
    return false;
  }

  return bcrypt.compare(String(candidatePassword || ''), storedPassword);
};

const User = mongoose.model('User', userSchema);

// Role-based cleanup (optional - run once)
User.cleanupDuplicates = async function() {
  const duplicates = await this.aggregate([
    { $group: { _id: '$email', docs: { $push: '$$ROOT' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  console.log(`Found ${duplicates.length} duplicate email groups`);
  for (const group of duplicates) {
    group.docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const toKeep = group.docs[0]._id;
    const deleted = await this.deleteMany({ email: group._id, _id: { $ne: toKeep } });
    console.log(`Email ${group._id}: Kept 1, deleted ${deleted.deletedCount}`);
  }
};

module.exports = User;
