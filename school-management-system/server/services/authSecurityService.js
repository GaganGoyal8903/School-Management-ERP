const crypto = require('crypto');
const {
  executeQuery,
  executeInTransaction,
  getSqlClient,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');

const AUTH_ATTEMPT_TABLE = 'dbo.SqlAuthAttempts';
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

const mapRateLimitRecord = (row) => {
  if (!row) {
    return null;
  }

  return {
    action: row.ActionName,
    key: row.RateKey,
    attempts: Number(row.Attempts || 0),
    windowStart: row.WindowStart ? new Date(row.WindowStart) : null,
    lastAttemptAt: row.LastAttemptAt ? new Date(row.LastAttemptAt) : null,
    blockedUntil: row.BlockedUntil ? new Date(row.BlockedUntil) : null,
    expiresAt: row.ExpiresAt ? new Date(row.ExpiresAt) : null,
  };
};

const getRateLimitRecord = async (action, key) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeQuery(
    `SELECT TOP 1
       ActionName,
       RateKey,
       Attempts,
       WindowStart,
       LastAttemptAt,
       BlockedUntil,
       ExpiresAt
     FROM ${AUTH_ATTEMPT_TABLE}
     WHERE ActionName = @action AND RateKey = @key`,
    [
      { name: 'action', type: sql.NVarChar(100), value: action },
      { name: 'key', type: sql.NVarChar(128), value: key },
    ]
  );

  return mapRateLimitRecord(result?.recordset?.[0]);
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
  await ensureAuthSqlReady();
  const sql = getSqlClient();

  return executeInTransaction(async ({ query }) => {
    const now = new Date();
    const selectResult = await query(
      `SELECT TOP 1
         ActionName,
         RateKey,
         Attempts,
         WindowStart,
         LastAttemptAt,
         BlockedUntil,
         ExpiresAt
       FROM ${AUTH_ATTEMPT_TABLE} WITH (UPDLOCK, HOLDLOCK)
       WHERE ActionName = @action AND RateKey = @key`,
      [
        { name: 'action', type: sql.NVarChar(100), value: action },
        { name: 'key', type: sql.NVarChar(128), value: key },
      ]
    );

    const attemptRecord = mapRateLimitRecord(selectResult?.recordset?.[0]);

    if (!attemptRecord) {
      const expiresAt = ttlDate(7 * ONE_DAY_MS);
      await query(
        `INSERT INTO ${AUTH_ATTEMPT_TABLE} (
           ActionName,
           RateKey,
           Attempts,
           WindowStart,
           LastAttemptAt,
           BlockedUntil,
           ExpiresAt,
           CreatedAt,
           UpdatedAt
         )
         VALUES (
           @action,
           @key,
           1,
           @windowStart,
           @lastAttemptAt,
           NULL,
           @expiresAt,
           @createdAt,
           @updatedAt
         )`,
        [
          { name: 'action', type: sql.NVarChar(100), value: action },
          { name: 'key', type: sql.NVarChar(128), value: key },
          { name: 'windowStart', type: sql.DateTime2(0), value: now },
          { name: 'lastAttemptAt', type: sql.DateTime2(0), value: now },
          { name: 'expiresAt', type: sql.DateTime2(0), value: expiresAt },
          { name: 'createdAt', type: sql.DateTime2(0), value: now },
          { name: 'updatedAt', type: sql.DateTime2(0), value: now },
        ]
      );

      return {
        blocked: false,
        attemptsLeft: Math.max(0, maxAttempts - 1),
        retryAfterSeconds: 0,
      };
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

    const windowExpired =
      !attemptRecord.windowStart || now.getTime() - attemptRecord.windowStart.getTime() > windowMs;
    const attempts = windowExpired ? 1 : attemptRecord.attempts + 1;
    const windowStart = windowExpired ? now : attemptRecord.windowStart;
    const blockedUntil = attempts > maxAttempts ? ttlDate(blockMs) : null;

    await query(
      `UPDATE ${AUTH_ATTEMPT_TABLE}
       SET Attempts = @attempts,
           WindowStart = @windowStart,
           LastAttemptAt = @lastAttemptAt,
           BlockedUntil = @blockedUntil,
           ExpiresAt = @expiresAt,
           UpdatedAt = @updatedAt
       WHERE ActionName = @action AND RateKey = @key`,
      [
        { name: 'attempts', type: sql.Int, value: attempts },
        { name: 'windowStart', type: sql.DateTime2(0), value: windowStart },
        { name: 'lastAttemptAt', type: sql.DateTime2(0), value: now },
        { name: 'blockedUntil', type: sql.DateTime2(0), value: blockedUntil },
        { name: 'expiresAt', type: sql.DateTime2(0), value: ttlDate(7 * ONE_DAY_MS) },
        { name: 'updatedAt', type: sql.DateTime2(0), value: now },
        { name: 'action', type: sql.NVarChar(100), value: action },
        { name: 'key', type: sql.NVarChar(128), value: key },
      ]
    );

    if (blockedUntil) {
      return {
        blocked: true,
        attemptsLeft: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1000)),
      };
    }

    return {
      blocked: false,
      attemptsLeft: Math.max(0, maxAttempts - attempts),
      retryAfterSeconds: 0,
    };
  });
};

const clearRateLimit = async ({ action, key }) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  await executeQuery(
    `DELETE FROM ${AUTH_ATTEMPT_TABLE} WHERE ActionName = @action AND RateKey = @key`,
    [
      { name: 'action', type: sql.NVarChar(100), value: action },
      { name: 'key', type: sql.NVarChar(128), value: key },
    ]
  );
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
