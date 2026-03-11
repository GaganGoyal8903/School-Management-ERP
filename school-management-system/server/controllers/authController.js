const User = require('../models/User');
const Student = require('../models/Student');
const AuthLoginSession = require('../models/AuthLoginSession');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const { sendOtpEmail } = require('../services/mailService');
const {
  normalizeEmail,
  normalizeCaptcha,
  normalizeOtp,
  hashAuthValue,
  safeHashCompare,
  createSessionToken,
  createCaptchaCode,
  createOtpCode,
  buildCaptchaImage,
  ttlDate,
  ensureNotBlocked,
  registerFailure,
  clearRateLimit,
} = require('../services/authSecurityService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOGIN_SESSION_TTL_MS = Number(process.env.LOGIN_SESSION_TTL_MS || 15 * 60 * 1000);
const CAPTCHA_EXPIRY_MS = Number(process.env.CAPTCHA_EXPIRY_MS || 5 * 60 * 1000);
const CAPTCHA_MAX_ATTEMPTS = Number(process.env.CAPTCHA_MAX_ATTEMPTS || 5);
const CAPTCHA_MAX_REFRESH = Number(process.env.CAPTCHA_MAX_REFRESH || 6);
const OTP_EXPIRY_MS = Number(process.env.OTP_EXPIRY_MS || 5 * 60 * 1000);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_MAX_SENDS = Number(process.env.OTP_MAX_SENDS || 5);
const OTP_RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS || 60 * 1000);

const CREDENTIAL_MAX_FAILURES = Number(process.env.CREDENTIAL_MAX_FAILURES || 8);
const CREDENTIAL_WINDOW_MS = Number(process.env.CREDENTIAL_WINDOW_MS || 15 * 60 * 1000);
const CREDENTIAL_BLOCK_MS = Number(process.env.CREDENTIAL_BLOCK_MS || 15 * 60 * 1000);

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const sanitizeDisplayText = (value = '') => String(value).trim().replace(/[<>]/g, '');

const getStudentProfileIfRequired = async (user) => {
  if (user.role !== 'student') {
    return null;
  }

  return Student.findOne({ userId: user._id });
};

const buildUserPayload = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  phone: user.phone,
});

const buildCredentialRateKey = (email, ipAddress) => hashAuthValue(`credential:${email}:${ipAddress}`);

const getActiveLoginSession = async (sessionToken) => {
  if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 40) {
    return null;
  }

  const session = await AuthLoginSession.findOne({ sessionToken: String(sessionToken).trim() });
  if (!session) {
    return null;
  }

  if (session.sessionExpiresAt.getTime() <= Date.now()) {
    await AuthLoginSession.deleteOne({ _id: session._id });
    return null;
  }

  return session;
};

const createLoginSession = async ({ user, req }) => {
  const captchaCode = createCaptchaCode();
  const sessionToken = createSessionToken();
  const session = await AuthLoginSession.create({
    sessionToken,
    userId: user._id,
    email: user.email,
    ipAddress: getClientIp(req),
    userAgent: sanitizeDisplayText(req.headers['user-agent'] || ''),
    status: 'credentials_verified',
    sessionExpiresAt: ttlDate(LOGIN_SESSION_TTL_MS),
    captchaHash: hashAuthValue(normalizeCaptcha(captchaCode)),
    captchaExpiresAt: ttlDate(CAPTCHA_EXPIRY_MS),
  });

  return { session, captchaCode };
};

const applyNewCaptchaToSession = async (session) => {
  const captchaCode = createCaptchaCode();
  session.captchaHash = hashAuthValue(normalizeCaptcha(captchaCode));
  session.captchaExpiresAt = ttlDate(CAPTCHA_EXPIRY_MS);
  session.captchaAttempts = 0;
  session.status = 'credentials_verified';
  await session.save();
  return captchaCode;
};

const issueOtpForSession = async ({ session, user }) => {
  const otpCode = createOtpCode();
  const otpHash = hashAuthValue(normalizeOtp(otpCode));
  const otpExpiresAt = ttlDate(OTP_EXPIRY_MS);

  await sendOtpEmail({
    to: user.email,
    fullName: user.fullName,
    otp: otpCode,
    expiresInMinutes: Math.max(1, Math.ceil(OTP_EXPIRY_MS / 60000)),
  });

  session.otpHash = otpHash;
  session.otpExpiresAt = otpExpiresAt;
  session.otpAttempts = 0;
  session.otpSendCount += 1;
  session.otpLastSentAt = new Date();
  session.status = 'otp_sent';
  await session.save();
};

const credentialsValidationError = (res, message) =>
  res.status(400).json({ success: false, message });

// @desc    Step 1: Verify credentials and start auth session with CAPTCHA
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return credentialsValidationError(res, 'Please provide email and password');
  }

  if (!EMAIL_REGEX.test(email)) {
    return credentialsValidationError(res, 'Please provide a valid email address');
  }

  const clientIp = getClientIp(req);
  const credentialRateKey = buildCredentialRateKey(email, clientIp);
  const blockedStatus = await ensureNotBlocked({
    action: 'login_credentials',
    key: credentialRateKey,
  });

  if (blockedStatus.blocked) {
    return res.status(429).json({
      success: false,
      message: `Too many failed login attempts. Try again in ${blockedStatus.retryAfterSeconds} seconds.`,
      retryAfterSeconds: blockedStatus.retryAfterSeconds,
    });
  }

  const user = await User.findOne({ email });
  const isPasswordCorrect = user ? await user.comparePassword(password) : false;

  if (!user || !isPasswordCorrect) {
    const failureState = await registerFailure({
      action: 'login_credentials',
      key: credentialRateKey,
      maxAttempts: CREDENTIAL_MAX_FAILURES,
      windowMs: CREDENTIAL_WINDOW_MS,
      blockMs: CREDENTIAL_BLOCK_MS,
    });

    if (failureState.blocked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed login attempts. Try again in ${failureState.retryAfterSeconds} seconds.`,
        retryAfterSeconds: failureState.retryAfterSeconds,
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
      attemptsLeft: failureState.attemptsLeft,
    });
  }

  if (user.isActive === false) {
    return res.status(403).json({
      success: false,
      message: 'Account is inactive. Please contact administrator.',
    });
  }

  await clearRateLimit({ action: 'login_credentials', key: credentialRateKey });

  const { session, captchaCode } = await createLoginSession({ user, req });

  return res.json({
    success: true,
    nextStep: 'captcha',
    message: 'Credentials verified. Please complete CAPTCHA verification.',
    sessionToken: session.sessionToken,
    captcha: {
      image: buildCaptchaImage(captchaCode),
      expiresAt: session.captchaExpiresAt,
    },
  });
});

// @desc    Legacy direct login endpoint (backward compatibility)
// @route   POST /api/auth/login/legacy
// @access  Public
const legacyLogin = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (user.isActive === false) {
    return res.status(401).json({ success: false, message: 'Account is inactive. Please contact administrator.' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = generateToken(user._id);
  const studentProfile = await getStudentProfileIfRequired(user);
  user.lastLogin = new Date();
  await user.save();

  return res.json({
    success: true,
    token,
    user: buildUserPayload(user),
    studentProfile,
  });
});

// @desc    Step 2A: Refresh captcha for current auth session
// @route   POST /api/auth/login/captcha/refresh
// @access  Public
const refreshCaptcha = asyncHandler(async (req, res) => {
  const sessionToken = String(req.body.sessionToken || '').trim();
  const session = await getActiveLoginSession(sessionToken);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (session.captchaVerifiedAt) {
    return res.status(400).json({
      success: false,
      message: 'CAPTCHA is already verified for this session.',
    });
  }

  if (session.captchaRefreshCount >= CAPTCHA_MAX_REFRESH) {
    return res.status(429).json({
      success: false,
      message: 'CAPTCHA refresh limit reached. Please restart login.',
    });
  }

  session.captchaRefreshCount += 1;
  const captchaCode = await applyNewCaptchaToSession(session);

  return res.json({
    success: true,
    message: 'CAPTCHA refreshed successfully.',
    captcha: {
      image: buildCaptchaImage(captchaCode),
      expiresAt: session.captchaExpiresAt,
    },
  });
});

// @desc    Step 2B + 3: Verify captcha and send OTP email
// @route   POST /api/auth/login/captcha/verify
// @access  Public
const verifyCaptchaAndSendOtp = asyncHandler(async (req, res) => {
  const sessionToken = String(req.body.sessionToken || '').trim();
  const captchaValue = normalizeCaptcha(req.body.captcha || '');
  const session = await getActiveLoginSession(sessionToken);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  const user = await User.findById(session.userId);
  if (!user || user.isActive === false) {
    return res.status(401).json({ success: false, message: 'Unable to continue login for this account.' });
  }

  if (!session.captchaVerifiedAt) {
    if (!captchaValue) {
      return res.status(400).json({ success: false, message: 'Please enter the CAPTCHA text.' });
    }

    if (session.captchaAttempts >= CAPTCHA_MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: 'Maximum CAPTCHA attempts reached. Please restart login.',
      });
    }

    if (!session.captchaExpiresAt || session.captchaExpiresAt.getTime() <= Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'CAPTCHA expired. Please refresh and try again.',
      });
    }

    const isCaptchaValid = safeHashCompare(captchaValue, session.captchaHash);
    if (!isCaptchaValid) {
      session.captchaAttempts += 1;
      await session.save();
      const remainingAttempts = Math.max(0, CAPTCHA_MAX_ATTEMPTS - session.captchaAttempts);
      const statusCode = remainingAttempts === 0 ? 429 : 400;

      return res.status(statusCode).json({
        success: false,
        message:
          remainingAttempts === 0
            ? 'CAPTCHA attempt limit reached. Please restart login.'
            : 'Invalid CAPTCHA. Please try again.',
        attemptsLeft: remainingAttempts,
      });
    }

    session.captchaVerifiedAt = new Date();
    session.status = 'captcha_verified';
    session.captchaAttempts = 0;
    await session.save();
  }

  if (session.otpSendCount >= OTP_MAX_SENDS) {
    return res.status(429).json({
      success: false,
      message: 'OTP resend limit reached. Please restart login.',
    });
  }

  if (
    session.otpLastSentAt &&
    Date.now() - session.otpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    const retryAfterSeconds = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS - (Date.now() - session.otpLastSentAt.getTime())) / 1000
    );
    return res.status(429).json({
      success: false,
      message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP.`,
      retryAfterSeconds,
    });
  }

  try {
    await issueOtpForSession({ session, user });
  } catch (error) {
    console.error('OTP email send error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to send OTP email right now. Please try again in a moment.',
    });
  }

  return res.json({
    success: true,
    nextStep: 'otp',
    message: 'OTP sent to your registered email address.',
    otp: {
      expiresAt: session.otpExpiresAt,
      resendAvailableAt: ttlDate(OTP_RESEND_COOLDOWN_MS),
      maxAttempts: OTP_MAX_ATTEMPTS,
      remainingSends: Math.max(0, OTP_MAX_SENDS - session.otpSendCount),
    },
  });
});

// @desc    Step 3 (resend): resend OTP after cooldown
// @route   POST /api/auth/login/otp/resend
// @access  Public
const resendOtp = asyncHandler(async (req, res) => {
  const sessionToken = String(req.body.sessionToken || '').trim();
  const session = await getActiveLoginSession(sessionToken);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (!session.captchaVerifiedAt) {
    return res.status(400).json({ success: false, message: 'Please complete CAPTCHA verification first.' });
  }

  if (session.otpSendCount >= OTP_MAX_SENDS) {
    return res.status(429).json({
      success: false,
      message: 'OTP resend limit reached. Please restart login.',
    });
  }

  if (
    session.otpLastSentAt &&
    Date.now() - session.otpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    const retryAfterSeconds = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS - (Date.now() - session.otpLastSentAt.getTime())) / 1000
    );
    return res.status(429).json({
      success: false,
      message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP.`,
      retryAfterSeconds,
    });
  }

  const user = await User.findById(session.userId);
  if (!user || user.isActive === false) {
    return res.status(401).json({ success: false, message: 'Unable to continue login for this account.' });
  }

  try {
    await issueOtpForSession({ session, user });
  } catch (error) {
    console.error('OTP resend error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to resend OTP email right now. Please try again in a moment.',
    });
  }

  return res.json({
    success: true,
    message: 'A new OTP has been sent to your email.',
    otp: {
      expiresAt: session.otpExpiresAt,
      resendAvailableAt: ttlDate(OTP_RESEND_COOLDOWN_MS),
      maxAttempts: OTP_MAX_ATTEMPTS,
      remainingSends: Math.max(0, OTP_MAX_SENDS - session.otpSendCount),
    },
  });
});

// @desc    Step 4: Verify OTP and complete login
// @route   POST /api/auth/login/otp/verify
// @access  Public
const verifyOtpAndCompleteLogin = asyncHandler(async (req, res) => {
  const sessionToken = String(req.body.sessionToken || '').trim();
  const otp = normalizeOtp(req.body.otp || '');
  const session = await getActiveLoginSession(sessionToken);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (!session.captchaVerifiedAt) {
    return res.status(400).json({ success: false, message: 'Please complete CAPTCHA verification first.' });
  }

  if (!otp || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
  }

  if (!session.otpHash || !session.otpExpiresAt) {
    return res.status(400).json({
      success: false,
      message: 'OTP was not generated for this session. Please request a new OTP.',
    });
  }

  if (session.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'OTP attempt limit reached. Please restart login.',
    });
  }

  if (session.otpExpiresAt.getTime() <= Date.now()) {
    return res.status(400).json({
      success: false,
      message: 'OTP has expired. Please request a new OTP.',
    });
  }

  const isOtpValid = safeHashCompare(otp, session.otpHash);
  if (!isOtpValid) {
    session.otpAttempts += 1;
    await session.save();

    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - session.otpAttempts);
    const statusCode = attemptsLeft === 0 ? 429 : 400;
    return res.status(statusCode).json({
      success: false,
      message:
        attemptsLeft === 0
          ? 'OTP attempt limit reached. Please restart login.'
          : 'Invalid OTP. Please try again.',
      attemptsLeft,
    });
  }

  const user = await User.findById(session.userId);
  if (!user || user.isActive === false) {
    return res.status(401).json({ success: false, message: 'Unable to complete login for this account.' });
  }

  session.otpVerifiedAt = new Date();
  session.completedAt = new Date();
  session.status = 'completed';
  session.sessionExpiresAt = ttlDate(2 * 60 * 1000);
  await session.save();

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user._id);
  const studentProfile = await getStudentProfileIfRequired(user);

  return res.json({
    success: true,
    message: 'Login successful.',
    token,
    user: buildUserPayload(user),
    studentProfile,
  });
});

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (admin can register users)
const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, role, phone } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  const sanitizedFullName = sanitizeDisplayText(fullName);
  const sanitizedEmail = normalizeEmail(email);

  const existingUser = await User.findOne({ email: sanitizedEmail });
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const user = await User.create({
    fullName: sanitizedFullName,
    email: sanitizedEmail,
    password,
    role: role || 'student',
    phone: sanitizeDisplayText(phone || ''),
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user: buildUserPayload(user),
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const studentProfile = await getStudentProfileIfRequired(user);

  res.json({
    success: true,
    user: buildUserPayload(user),
    studentProfile,
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (fullName) user.fullName = sanitizeDisplayText(fullName);
  if (phone) user.phone = sanitizeDisplayText(phone);

  await user.save();

  res.json({
    success: true,
    user: buildUserPayload(user),
  });
});

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Please provide current and new password' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long' });
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password updated successfully',
  });
});

module.exports = {
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
  changePassword,
};

