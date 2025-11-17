const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
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

// Start VNC proxy for WebSocket connection
router.post('/proxy', (req, res) => {
  res.json({
    success: true,
    message: 'VNC proxy available via WebSocket',
    endpoint: '/ws'
  });
});

module.exports = router;
