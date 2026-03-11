const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Validate JWT_SECRET in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

// Default secret for development only (should not be used in production)
const DEFAULT_SECRET = 'mayo_college_secret_key_2024_dev_only';

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check for token in header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header (Bearer <token>)
      token = req.headers.authorization.split(' ')[1];

      // Verify token - use env secret in production, default in development
      const secret = JWT_SECRET || DEFAULT_SECRET;
      const decoded = jwt.verify(token, secret);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Generate JWT Token
const generateToken = (id) => {
  const secret = JWT_SECRET || DEFAULT_SECRET;
  return jwt.sign(
    { id },
    secret,
    { expiresIn: '7d' }
  );
};

module.exports = { protect, generateToken };

