const mongoose = require('mongoose');

const authAttemptSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    windowStart: {
      type: Date,
      default: Date.now,
    },
    blockedUntil: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

authAttemptSchema.index({ action: 1, key: 1 }, { unique: true });
authAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthAttempt', authAttemptSchema);

