const express = require('express');
const router = express.Router();
const monitorService = require('../services/monitor');
const sshAuthService = require('../services/ssh-auth');

// Middleware to check SSH authentication and get SSH connection
const requireSSHAuth = (req, res, next) => {
  const sessionId = req.session.sshSessionId;

  if (!sessionId) {
    return res.status(401).json({
      success: false,
      message: 'SSH authentication required'
    });
  }

  const session = sshAuthService.getSession(sessionId);
  if (!session || !session.connection) {
    return res.status(401).json({
      success: false,
      message: 'SSH session expired or invalid'
    });
  }

  // Attach SSH connection and sessionId to request
  req.sshConnection = session.connection;
  req.sshSessionId = sessionId;
  next();
};

// Apply SSH auth to all monitor routes
router.use(requireSSHAuth);

// Get all system stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await monitorService.getAllStats(req.sshConnection, req.sshSessionId);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get CPU usage only
router.get('/cpu', async (req, res) => {
  try {
    const usage = await monitorService.getCpuUsage(req.sshConnection);
    res.json({
      success: true,
      data: { usage }
    });
  } catch (error) {
    console.error('CPU error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get memory usage only
router.get('/memory', async (req, res) => {
  try {
    const memory = await monitorService.getMemoryUsage(req.sshConnection);
    res.json({
      success: true,
      data: memory
    });
  } catch (error) {
    console.error('Memory error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get disk usage only
router.get('/disk', async (req, res) => {
  try {
    const disk = await monitorService.getDiskUsage(req.sshConnection);
    res.json({
      success: true,
      data: disk
    });
  } catch (error) {
    console.error('Disk error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get network stats only
router.get('/network', async (req, res) => {
  try {
    const network = await monitorService.getNetworkStats(req.sshConnection, req.sshSessionId);
    res.json({
      success: true,
      data: network
    });
  } catch (error) {
    console.error('Network error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get system info
router.get('/system', async (req, res) => {
  try {
    const system = await monitorService.getSystemInfo(req.sshConnection);
    res.json({
      success: true,
      data: system
    });
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get top processes
router.get('/processes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const processes = await monitorService.getTopProcesses(req.sshConnection, limit);
    res.json({
      success: true,
      data: processes
    });
  } catch (error) {
    console.error('Processes error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
