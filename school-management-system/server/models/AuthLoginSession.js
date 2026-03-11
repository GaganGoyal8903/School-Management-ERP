const mongoose = require('mongoose');

const authLoginSessionSchema = new mongoose.Schema(
  {
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      default: '',
      trim: true,
    },
    userAgent: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['credentials_verified', 'captcha_verified', 'otp_sent', 'otp_verified', 'completed'],
      default: 'credentials_verified',
    },
    sessionExpiresAt: {
      type: Date,
      required: true,
    },
    captchaHash: {
      type: String,
      required: true,
      trim: true,
    },
    captchaExpiresAt: {
      type: Date,
      required: true,
    },
    captchaAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    captchaRefreshCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    captchaVerifiedAt: {
      type: Date,
      default: null,
    },
    otpHash: {
      type: String,
      default: null,
      trim: true,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    otpSendCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    otpLastSentAt: {
      type: Date,
      default: null,
    },
    otpVerifiedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

authLoginSessionSchema.index({ sessionExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthLoginSession', authLoginSessionSchema);
