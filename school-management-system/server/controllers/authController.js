const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const { sendOtpEmail } = require('../services/mailService');
const {
  ensureAuthSqlReady,
  getAuthUserById,
  getAuthUserByEmail,
  createAuthUser,
  updateAuthUser,
  loginLookup,
  startLoginSession,
  getActiveLoginSession,
  refreshCaptchaForSession,
  verifyCaptchaForSession,
  checkOtpResendCooldown,
  createOtpForSession,
  verifyOtpForSession,
} = require('../services/authSqlService');
const { getStudentByUserId } = require('../services/studentSqlService');
const {
  normalizeEmail,
  normalizeCaptcha,
  normalizeOtp,
  hashAuthValue,
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

const resolveOtpEmailErrorMessage = (error) => {
  const rawMessage = String(error?.message || '').toLowerCase();

  if (rawMessage.includes('not configured')) {
    return 'OTP email service is not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS and MAIL_FROM in server/.env, then restart backend.';
  }

  if (
    rawMessage.includes('auth') ||
    rawMessage.includes('invalid login') ||
    rawMessage.includes('authentication')
  ) {
    return 'SMTP authentication failed. Verify MAIL_USER and MAIL_PASS (for Gmail use an App Password).';
  }

  if (
    rawMessage.includes('econn') ||
    rawMessage.includes('etimedout') ||
    rawMessage.includes('enotfound') ||
    rawMessage.includes('ehostunreach')
  ) {
    return 'SMTP server connection failed. Verify MAIL_HOST, MAIL_PORT, MAIL_SECURE and network access.';
  }

  return 'Unable to send OTP email right now. Please try again in a moment.';
};

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

  return getStudentByUserId(user._id);
};

const buildUserPayload = (user) => ({
  id: user._id ?? user.id ?? user.UserId ?? null,
  fullName: user.fullName ?? user.FullName ?? null,
  email: user.email ?? user.Email ?? null,
  phone: user.phone ?? user.Phone ?? null,
  roleId: user.roleId ?? user.RoleId ?? null,
  role: user.role ?? user.RoleName ?? null,
});

const buildCredentialRateKey = (email, ipAddress) => hashAuthValue(`credential:${email}:${ipAddress}`);
const isSqlInactiveFlag = (value) => value === false || value === 0 || String(value).toLowerCase() === 'false';
const isBcryptHash = (value = '') => /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
const isStoredPasswordMatch = async (inputPassword, storedPassword) => {
  const normalizedInput = String(inputPassword || '');
  const normalizedStored = String(storedPassword || '');
  if (!normalizedStored) {
    return false;
  }

  if (isBcryptHash(normalizedStored)) {
    try {
      return await bcrypt.compare(normalizedInput, normalizedStored);
    } catch (error) {
      return false;
    }
  }

  return normalizedInput === normalizedStored;
};

const getSqlUserFromLookup = async (lookupRecord) => {
  if (!lookupRecord) {
    return null;
  }

  if (lookupRecord.MongoUserId) {
    const userById = await getAuthUserById(lookupRecord.MongoUserId);
    if (userById) {
      return userById;
    }
  }

  if (lookupRecord.Email) {
    return getAuthUserByEmail(lookupRecord.Email);
  }

  return null;
};

const getSqlUserFromSession = async (session) => {
  if (!session) {
    return null;
  }

  if (session.mongoUserId) {
    const userById = await getAuthUserById(session.mongoUserId);
    if (userById) {
      return userById;
    }
  }

  if (session.email) {
    return getAuthUserByEmail(session.email);
  }

  return null;
};

const issueOtpForSession = async ({ sessionToken, user }) => {
  const otpCode = createOtpCode();
  const otpHash = hashAuthValue(normalizeOtp(otpCode));
  const otpExpiresAt = ttlDate(OTP_EXPIRY_MS);
  const sentAt = new Date();

  await sendOtpEmail({
    to: user.email,
    fullName: user.fullName,
    otp: otpCode,
    expiresInMinutes: Math.max(1, Math.ceil(OTP_EXPIRY_MS / 60000)),
  });

  const otpResult = await createOtpForSession({
    sessionToken,
    otpHash,
    otpExpiresAt,
    sentAt,
    maxSends: OTP_MAX_SENDS,
  });

  if (!otpResult || otpResult.ResultCode !== 'ok') {
    throw new Error('Failed to persist OTP session state');
  }

  return {
    expiresAt: otpResult.OtpExpiresAt ? new Date(otpResult.OtpExpiresAt) : otpExpiresAt,
    resendAvailableAt: ttlDate(OTP_RESEND_COOLDOWN_MS),
    remainingSends: Math.max(0, Number(otpResult.RemainingSends || 0)),
  };
};

const credentialsValidationError = (res, message) =>
  res.status(400).json({ success: false, message });

// @desc    Step 1: Verify credentials and start auth session with CAPTCHA
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  await ensureAuthSqlReady();

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

  const lookupRecord = await loginLookup(email);
  const isPasswordCorrect = await isStoredPasswordMatch(password, lookupRecord?.PasswordHash);

  if (!lookupRecord || !isPasswordCorrect) {
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

  if (isSqlInactiveFlag(lookupRecord.IsActive)) {
    return res.status(403).json({
      success: false,
      message: 'Account is inactive. Please contact administrator.',
    });
  }

  const user = await getSqlUserFromLookup(lookupRecord);
  if (!user || user.isActive === false) {
    return res.status(401).json({
      success: false,
      message: 'Unable to continue login for this account.',
    });
  }

  await clearRateLimit({ action: 'login_credentials', key: credentialRateKey });

  const captchaCode = createCaptchaCode();
  const captchaExpiresAt = ttlDate(CAPTCHA_EXPIRY_MS);
  const session = await startLoginSession({
    sessionToken: createSessionToken(),
    mongoUserId: user._id,
    email: user.email,
    ipAddress: getClientIp(req),
    userAgent: sanitizeDisplayText(req.headers['user-agent'] || ''),
    status: 'credentials_verified',
    sessionExpiresAt: ttlDate(LOGIN_SESSION_TTL_MS),
    captchaHash: hashAuthValue(normalizeCaptcha(captchaCode)),
    captchaExpiresAt,
  });

  return res.json({
    success: true,
    nextStep: 'captcha',
    message: 'Credentials verified. Please complete CAPTCHA verification.',
    sessionToken: session.sessionToken,
    captcha: {
      image: buildCaptchaImage(captchaCode),
      expiresAt: session.captchaExpiresAt || captchaExpiresAt,
    },
  });
});

// @desc    Legacy direct login endpoint (backward compatibility)
// @route   POST /api/auth/login/legacy
// @access  Public
const legacyLogin = asyncHandler(async (req, res) => {
  await ensureAuthSqlReady();

  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  const lookupRecord = await loginLookup(email);
  if (!lookupRecord) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (isSqlInactiveFlag(lookupRecord.IsActive)) {
    return res
      .status(401)
      .json({ success: false, message: 'Account is inactive. Please contact administrator.' });
  }

  const isMatch = await isStoredPasswordMatch(password, lookupRecord?.PasswordHash);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const user = await getSqlUserFromLookup(lookupRecord);
  if (!user || user.isActive === false) {
    return res
      .status(401)
      .json({ success: false, message: 'Unable to complete login for this account.' });
  }

  const updatedUser = await updateAuthUser(user._id, { lastLogin: new Date() });
  const token = generateToken(user._id);
  const studentProfile = await getStudentProfileIfRequired(updatedUser || user);

  return res.json({
    success: true,
    token,
    user: buildUserPayload(updatedUser || user),
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

  const captchaCode = createCaptchaCode();
  const captchaExpiresAt = ttlDate(CAPTCHA_EXPIRY_MS);
  const refreshResult = await refreshCaptchaForSession({
    sessionToken,
    captchaHash: hashAuthValue(normalizeCaptcha(captchaCode)),
    captchaExpiresAt,
    maxRefresh: CAPTCHA_MAX_REFRESH,
  });

  if (!refreshResult || refreshResult.ResultCode === 'session_expired') {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (refreshResult.ResultCode === 'already_verified') {
    return res.status(400).json({
      success: false,
      message: 'CAPTCHA is already verified for this session.',
    });
  }

  if (refreshResult.ResultCode === 'refresh_limit') {
    return res.status(429).json({
      success: false,
      message: 'CAPTCHA refresh limit reached. Please restart login.',
    });
  }

  return res.json({
    success: true,
    message: 'CAPTCHA refreshed successfully.',
    captcha: {
      image: buildCaptchaImage(captchaCode),
      expiresAt: refreshResult.CaptchaExpiresAt ? new Date(refreshResult.CaptchaExpiresAt) : captchaExpiresAt,
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

  const user = await getSqlUserFromSession(session);
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

    const captchaResult = await verifyCaptchaForSession({
      sessionToken,
      captchaHash: hashAuthValue(captchaValue),
      maxAttempts: CAPTCHA_MAX_ATTEMPTS,
      verifiedAt: new Date(),
    });

    if (!captchaResult || captchaResult.ResultCode === 'session_expired') {
      return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
    }

    if (captchaResult.ResultCode === 'missing_captcha' || captchaResult.ResultCode === 'captcha_expired') {
      return res.status(400).json({
        success: false,
        message: 'CAPTCHA expired. Please refresh and try again.',
      });
    }

    if (captchaResult.ResultCode === 'captcha_attempt_limit') {
      return res.status(429).json({
        success: false,
        message: 'CAPTCHA attempt limit reached. Please restart login.',
        attemptsLeft: 0,
      });
    }

    if (captchaResult.ResultCode === 'invalid_captcha') {
      return res.status(400).json({
        success: false,
        message: 'Invalid CAPTCHA. Please try again.',
        attemptsLeft: Number(captchaResult.AttemptsLeft || 0),
      });
    }
  }

  const cooldownResult = await checkOtpResendCooldown({
    sessionToken,
    cooldownMs: OTP_RESEND_COOLDOWN_MS,
    maxSends: OTP_MAX_SENDS,
  });

  if (!cooldownResult || cooldownResult.ResultCode === 'session_expired') {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (cooldownResult.ResultCode === 'captcha_required') {
    return res.status(400).json({ success: false, message: 'Please complete CAPTCHA verification first.' });
  }

  if (cooldownResult.ResultCode === 'send_limit') {
    return res.status(429).json({
      success: false,
      message: 'OTP resend limit reached. Please restart login.',
    });
  }

  if (cooldownResult.ResultCode === 'cooldown_active') {
    const retryAfterSeconds = Number(cooldownResult.RetryAfterSeconds || 0);
    return res.status(429).json({
      success: false,
      message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP.`,
      retryAfterSeconds,
    });
  }

  let otpState;

  try {
    otpState = await issueOtpForSession({ sessionToken, user });
  } catch (error) {
    console.error('OTP email send error:', error.message);
    return res.status(500).json({
      success: false,
      message: resolveOtpEmailErrorMessage(error),
    });
  }

  return res.json({
    success: true,
    nextStep: 'otp',
    message: 'OTP sent to your registered email address.',
    otp: {
      expiresAt: otpState.expiresAt,
      resendAvailableAt: otpState.resendAvailableAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      remainingSends: otpState.remainingSends,
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

  const cooldownResult = await checkOtpResendCooldown({
    sessionToken,
    cooldownMs: OTP_RESEND_COOLDOWN_MS,
    maxSends: OTP_MAX_SENDS,
  });

  if (!cooldownResult || cooldownResult.ResultCode === 'session_expired') {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (cooldownResult.ResultCode === 'send_limit') {
    return res.status(429).json({
      success: false,
      message: 'OTP resend limit reached. Please restart login.',
    });
  }

  if (cooldownResult.ResultCode === 'cooldown_active') {
    const retryAfterSeconds = Number(cooldownResult.RetryAfterSeconds || 0);
    return res.status(429).json({
      success: false,
      message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP.`,
      retryAfterSeconds,
    });
  }

  const user = await getSqlUserFromSession(session);
  if (!user || user.isActive === false) {
    return res.status(401).json({ success: false, message: 'Unable to continue login for this account.' });
  }

  let otpState;

  try {
    otpState = await issueOtpForSession({ sessionToken, user });
  } catch (error) {
    console.error('OTP resend error:', error.message);
    return res.status(500).json({
      success: false,
      message: resolveOtpEmailErrorMessage(error),
    });
  }

  return res.json({
    success: true,
    message: 'A new OTP has been sent to your email.',
    otp: {
      expiresAt: otpState.expiresAt,
      resendAvailableAt: otpState.resendAvailableAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      remainingSends: otpState.remainingSends,
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

  const otpResult = await verifyOtpForSession({
    sessionToken,
    otpHash: hashAuthValue(otp),
    maxAttempts: OTP_MAX_ATTEMPTS,
    verifiedAt: new Date(),
    completedAt: new Date(),
    sessionExpiresAt: ttlDate(2 * 60 * 1000),
  });

  if (!otpResult || otpResult.ResultCode === 'session_expired') {
    return res.status(401).json({ success: false, message: 'Login session expired. Please login again.' });
  }

  if (otpResult.ResultCode === 'captcha_required') {
    return res.status(400).json({ success: false, message: 'Please complete CAPTCHA verification first.' });
  }

  if (otpResult.ResultCode === 'otp_missing') {
    return res.status(400).json({
      success: false,
      message: 'OTP was not generated for this session. Please request a new OTP.',
    });
  }

  if (otpResult.ResultCode === 'otp_expired') {
    return res.status(400).json({
      success: false,
      message: 'OTP has expired. Please request a new OTP.',
    });
  }

  if (otpResult.ResultCode === 'otp_attempt_limit') {
    return res.status(429).json({
      success: false,
      message: 'OTP attempt limit reached. Please restart login.',
      attemptsLeft: 0,
    });
  }

  if (otpResult.ResultCode === 'invalid_otp') {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP. Please try again.',
      attemptsLeft: Number(otpResult.AttemptsLeft || 0),
    });
  }

  const user = await getSqlUserFromSession(session);
  if (!user || user.isActive === false) {
    return res.status(401).json({ success: false, message: 'Unable to complete login for this account.' });
  }

  const updatedUser = await updateAuthUser(user._id, { lastLogin: new Date() });
  const token = generateToken(user._id);
  const studentProfile = await getStudentProfileIfRequired(updatedUser || user);

  return res.json({
    success: true,
    message: 'Login successful.',
    token,
    user: buildUserPayload(updatedUser || user),
    studentProfile,
  });
});

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (admin can register users)
const register = asyncHandler(async (req, res) => {
  await ensureAuthSqlReady();

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

  const existingUser = await getAuthUserByEmail(sanitizedEmail);
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const passwordHash = String(password);
  const user = await createAuthUser({
    fullName: sanitizedFullName,
    email: sanitizedEmail,
    passwordHash,
    role: role || 'student',
    phone: sanitizeDisplayText(phone || ''),
    isActive: true,
  });

  const token = generateToken(user._id);

  return res.status(201).json({
    success: true,
    token,
    user: buildUserPayload(user),
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await getAuthUserById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const studentProfile = await getStudentProfileIfRequired(user);

  return res.json({
    success: true,
    user: buildUserPayload(user),
    studentProfile,
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  return res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body;
  const payload = {};

  if (fullName) {
    payload.fullName = sanitizeDisplayText(fullName);
  }

  if (phone) {
    payload.phone = sanitizeDisplayText(phone);
  }

  const user = await updateAuthUser(req.user._id, payload);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
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

  const user = await getAuthUserById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const isMatch = await isStoredPasswordMatch(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  const passwordHash = String(newPassword);
  await updateAuthUser(req.user._id, { password: passwordHash });

  return res.json({
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
