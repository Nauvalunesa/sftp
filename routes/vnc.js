const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const sshAuthService = require('../services/ssh-auth');
const net = require('net');

// Apply authentication
router.use(requireAuth);

// Get VNC configuration
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      host: process.env.VNC_HOST || 'localhost',
      port: process.env.VNC_PORT || 5900,
      hasPassword: !!process.env.VNC_PASSWORD
    }
  });
});

// VNC connection status
router.get('/status', async (req, res) => {
  try {
    const host = process.env.VNC_HOST || 'localhost';
    const port = process.env.VNC_PORT || 5900;

    // Try to connect to VNC server
    const socket = new net.Socket();

    socket.setTimeout(3000);

    socket.on('connect', () => {
      socket.destroy();
      res.json({
        success: true,
        status: 'online',
        host,
        port
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      res.json({
        success: true,
        status: 'offline',
        message: 'VNC server timeout'
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      res.json({
        success: true,
        status: 'offline',
        message: err.message
      });
    });

    socket.connect(port, host);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// SSH authentication for VNC access
router.post('/ssh-auth', async (req, res) => {
  try {
    const { host, port, username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'SSH username and password are required'
      });
    }

    const result = await sshAuthService.authenticate({
      host: host || process.env.SSH_HOST || 'localhost',
      port: port || process.env.SSH_PORT || 22,
      username,
      password
    });

    // Store session ID in user session
    req.session.sshSessionId = result.sessionId;

    res.json({
      success: true,
      message: 'SSH authentication successful',
      sessionId: result.sessionId,
      user: result.user,
      host: result.host
    });
  } catch (error) {
    console.error('SSH auth error:', error);
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// Check SSH session status
router.get('/ssh-status', (req, res) => {
  const sessionId = req.session.sshSessionId;

  if (!sessionId) {
    return res.json({
      success: true,
      authenticated: false,
      message: 'No SSH session found'
    });
  }

  const isValid = sshAuthService.isSessionValid(sessionId);
  const session = sshAuthService.getSession(sessionId);

  res.json({
    success: true,
    authenticated: isValid,
    session: session || null
  });
});

// Disconnect SSH session
router.post('/ssh-disconnect', (req, res) => {
  const sessionId = req.session.sshSessionId;

  if (sessionId) {
    sshAuthService.closeSession(sessionId);
    delete req.session.sshSessionId;
  }

  res.json({
    success: true,
    message: 'SSH session closed'
  });
});

// Start VNC proxy for WebSocket connection (requires SSH auth)
router.post('/proxy', (req, res) => {
  const sessionId = req.session.sshSessionId;

  if (!sessionId || !sshAuthService.isSessionValid(sessionId)) {
    return res.status(401).json({
      success: false,
      message: 'SSH authentication required. Please login with SSH first.'
    });
  }

  res.json({
    success: true,
    message: 'VNC proxy available via WebSocket',
    endpoint: '/ws',
    sshSessionId: sessionId
  });
});

module.exports = router;
