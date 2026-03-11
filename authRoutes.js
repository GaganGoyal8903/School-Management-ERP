const express = require('express');
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

// Public routes
router.post('/login', login);
router.post('/login/legacy', legacyLogin);
router.post('/login/captcha/generate', refreshCaptcha);
router.post('/login/captcha/refresh', refreshCaptcha);
router.post('/login/captcha/verify', verifyCaptchaAndSendOtp);
router.post('/login/otp/resend', resendOtp);
router.post('/login/otp/verify', verifyOtpAndCompleteLogin);
router.post('/register', register);

// Protected routes
router.use(protect);

router.get('/me', getMe);
router.post('/logout', logout);
router.put('/profile', updateProfile);
router.post('/change-password', changePassword);

module.exports = router;

