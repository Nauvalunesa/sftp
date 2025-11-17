const express = require('express');
const router = express.Router();
const monitorService = require('../services/monitor');

// Middleware to check SSH authentication
const requireSSHAuth = (req, res, next) => {
  if (!req.session.sshSessionId) {
    return res.status(401).json({
      success: false,
      message: 'SSH authentication required'
    });
  }
  next();
};

// Apply SSH auth to all monitor routes
router.use(requireSSHAuth);

// Get all system stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await monitorService.getAllStats();
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
    const usage = await monitorService.getCpuUsage();
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
router.get('/memory', (req, res) => {
  try {
    const memory = monitorService.getMemoryUsage();
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
    const disk = await monitorService.getDiskUsage();
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
    const network = await monitorService.getNetworkStats();
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
router.get('/system', (req, res) => {
  try {
    const system = monitorService.getSystemInfo();
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
    const processes = await monitorService.getTopProcesses(limit);
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
