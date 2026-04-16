const crypto = require('crypto');
const AuthAttempt = require('../models/AuthAttempt');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTH_HASH_SECRET =
  process.env.AUTH_HASH_SECRET || process.env.JWT_SECRET || 'school_mgmt_auth_secret_dev';

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const normalizeCaptcha = (value = '') => String(value).trim().toUpperCase().replace(/\s+/g, '');
const normalizeOtp = (value = '') => String(value).trim();

const hashAuthValue = (value = '') => {
  return crypto.createHmac('sha256', AUTH_HASH_SECRET).update(String(value)).digest('hex');
};

const safeHashCompare = (rawValue, expectedHash) => {
  if (!expectedHash) return false;
  const computedHash = hashAuthValue(rawValue);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');

  if (expectedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
};

const createSessionToken = () => crypto.randomBytes(32).toString('hex');

const createCaptchaCode = (length = 6) => {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    const randomCharIndex = crypto.randomInt(0, CAPTCHA_CHARS.length);
    code += CAPTCHA_CHARS.charAt(randomCharIndex);
  }
  return code;
};

const createOtpCode = () => {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
};

const buildCaptchaImage = (code) => {
  const width = 190;
  const height = 64;
  const chars = code.split('');
  const perCharSpace = width / (chars.length + 1);
  const lineMarkup = Array.from({ length: 6 })
    .map(() => {
      const x1 = crypto.randomInt(0, width);
      const y1 = crypto.randomInt(0, height);
      const x2 = crypto.randomInt(0, width);
      const y2 = crypto.randomInt(0, height);
      const opacity = (crypto.randomInt(20, 45) / 100).toFixed(2);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1F4BA6" stroke-opacity="${opacity}" stroke-width="1.2" />`;
    })
    .join('');

  const circleMarkup = Array.from({ length: 10 })
    .map(() => {
      const cx = crypto.randomInt(0, width);
      const cy = crypto.randomInt(0, height);
      const r = crypto.randomInt(1, 3);
      const opacity = (crypto.randomInt(10, 30) / 100).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0E357D" fill-opacity="${opacity}" />`;
    })
    .join('');

  const textMarkup = chars
    .map((character, index) => {
      const rotate = crypto.randomInt(-14, 15);
      const x = Math.round((index + 1) * perCharSpace);
      const y = crypto.randomInt(38, 52);
      const fontSize = crypto.randomInt(26, 32);
      return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#0B2F73" transform="rotate(${rotate} ${x} ${y})">${character}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Captcha image">
  <defs>
    <linearGradient id="captchaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E6F1FF" />
      <stop offset="100%" stop-color="#C9E2FF" />
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="10" ry="10" fill="url(#captchaGradient)" stroke="#8AB0E8" stroke-width="1.5" />
  ${lineMarkup}
  ${circleMarkup}
  ${textMarkup}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const ttlDate = (ms) => new Date(Date.now() + ms);

const getRateLimitRecord = async (action, key) => {
  return AuthAttempt.findOne({ action, key });
};

const isRateLimitBlocked = (attemptRecord) => {
  if (!attemptRecord?.blockedUntil) return false;
  return attemptRecord.blockedUntil.getTime() > Date.now();
};

const ensureNotBlocked = async ({ action, key }) => {
  const attemptRecord = await getRateLimitRecord(action, key);
  if (!isRateLimitBlocked(attemptRecord)) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((attemptRecord.blockedUntil.getTime() - Date.now()) / 1000)
    ),
  };
};

const registerFailure = async ({ action, key, maxAttempts, windowMs, blockMs }) => {
  const now = new Date();
  let attemptRecord = await getRateLimitRecord(action, key);

  if (!attemptRecord) {
    attemptRecord = await AuthAttempt.create({
      action,
      key,
      attempts: 1,
      windowStart: now,
      lastAttemptAt: now,
      expiresAt: ttlDate(7 * ONE_DAY_MS),
    });
    return { blocked: false, attemptsLeft: Math.max(0, maxAttempts - 1), retryAfterSeconds: 0 };
  }

  if (isRateLimitBlocked(attemptRecord)) {
    return {
      blocked: true,
      attemptsLeft: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((attemptRecord.blockedUntil.getTime() - Date.now()) / 1000)
      ),
    };
  }

  const windowExpired = now.getTime() - attemptRecord.windowStart.getTime() > windowMs;
  if (windowExpired) {
    attemptRecord.attempts = 1;
    attemptRecord.windowStart = now;
  } else {
    attemptRecord.attempts += 1;
  }

  attemptRecord.lastAttemptAt = now;
  attemptRecord.expiresAt = ttlDate(7 * ONE_DAY_MS);

  if (attemptRecord.attempts > maxAttempts) {
    attemptRecord.blockedUntil = ttlDate(blockMs);
    await attemptRecord.save();
    return {
      blocked: true,
      attemptsLeft: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1000)),
    };
  }

  attemptRecord.blockedUntil = null;
  await attemptRecord.save();

  return {
    blocked: false,
    attemptsLeft: Math.max(0, maxAttempts - attemptRecord.attempts),
    retryAfterSeconds: 0,
  };
};

const clearRateLimit = async ({ action, key }) => {
  await AuthAttempt.deleteOne({ action, key });
};

module.exports = {
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
};

