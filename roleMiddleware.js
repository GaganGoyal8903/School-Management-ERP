// Role-based access control middleware
// Usage: authorize('admin', 'teacher')

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role '${req.user.role}' is not authorized to access this route. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

// Check if user is admin or teacher
const isAdminOrTeacher = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Admin or Teacher access required' });
  }

  next();
};

module.exports = { authorize, isAdmin, isAdminOrTeacher };

