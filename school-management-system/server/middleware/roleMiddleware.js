// Role-based access control middleware
// Usage: authorize('admin', 'teacher')

const normalize = (role) => String(role || "").toLowerCase();

const authorize = (...roles) => {
  const allowedRoles = roles.map(normalize);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const userRole = normalize(req.user.role);

    if (!allowedRoles.includes(userRole)) {
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

  const role = normalize(req.user.role);

  if (role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

// Check if user is admin or teacher
const isAdminOrTeacher = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const role = normalize(req.user.role);

  if (!['admin', 'teacher'].includes(role)) {
    return res.status(403).json({ message: 'Admin or Teacher access required' });
  }

  next();
};

module.exports = { authorize, isAdmin, isAdminOrTeacher };