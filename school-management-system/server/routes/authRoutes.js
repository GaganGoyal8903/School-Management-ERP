const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { 
  login,
  legacyLogin,
  refreshCaptcha,
  verifyCaptchaAndSendOtp,
  resendOtp,
  verifyOtpAndCompleteLogin,
  register, 
  getMe, 
  logout,
  updateProfile,
  changePassword 
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const createAuthLimiter = ({ windowMs, max, message }) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message,
  },
});

const loginLimiter = createAuthLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please try again later.',
});

const otpLimiter = createAuthLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many OTP requests. Please try again later.',
});

const blockLegacyAuthInProduction = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LEGACY_AUTH !== 'true') {
    return res.status(404).json({
      success: false,
      message: 'This authentication route is not available.',
    });
  }

  return next();
};

// Public routes
router.post('/login', loginLimiter, login);
router.post('/login/legacy', loginLimiter, blockLegacyAuthInProduction, legacyLogin);
router.post('/login/captcha/generate', loginLimiter, refreshCaptcha);
router.post('/login/captcha/refresh', loginLimiter, refreshCaptcha);
router.post('/login/captcha/verify', loginLimiter, verifyCaptchaAndSendOtp);
router.post('/login/otp/resend', otpLimiter, resendOtp);
router.post('/login/otp/verify', otpLimiter, verifyOtpAndCompleteLogin);
router.post('/register', loginLimiter, protect, authorize('admin'), register);

// Protected routes
router.use(protect);

router.get('/me', getMe);
router.post('/logout', logout);
router.put('/profile', updateProfile);
router.post('/change-password', changePassword);

module.exports = router;

