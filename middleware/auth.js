// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
};

module.exports = {
  requireAuth,
  requireAdmin
};
