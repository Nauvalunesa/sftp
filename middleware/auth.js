const sshAuthService = require('../services/ssh-auth');

// SSH Authentication middleware
const requireSSHAuth = (req, res, next) => {
  const sessionId = req.session.sshSessionId;

  if (!sessionId) {
    return res.status(401).json({
      success: false,
      message: 'SSH authentication required'
    });
  }

  if (!sshAuthService.isSessionValid(sessionId)) {
    return res.status(401).json({
      success: false,
      message: 'SSH session expired or invalid'
    });
  }

  next();
};

module.exports = {
  requireAuth: requireSSHAuth, // Keep old name for compatibility
  requireSSHAuth
};
