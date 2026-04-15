const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { body, validationResult, query } = require('express-validator');

// Security Headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'"],
    },
  },
});

// Rate Limiting
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100) => rateLimit({
  windowMs,
  max,
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints (stricter)
const authLimiter = createRateLimiter(15 * 60 * 1000, 5);

// General API
const apiLimiter = createRateLimiter();

// Validation Helper
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  };
};

// Input Sanitizers
const sanitizeCommonFields = [
  body('fullName', 'Name is required').trim().notEmpty().escape().isLength({ min: 2 }),
  body('email', 'Valid email required').optional().isEmail().normalizeEmail(),
  body('phone', 'Valid phone required').optional().isMobilePhone('en-IN'),
  body('class', 'Class is required').trim().notEmpty(),
  body('section', 'Section is required').trim().notEmpty().isLength({ max: 10 }),
  body('rollNumber', 'Roll number required').trim().notEmpty(),
];

module.exports = {
  securityHeaders,
  authLimiter,
  apiLimiter,
  validate,
  sanitizeCommonFields,
};

