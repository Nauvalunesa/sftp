const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs').promises;

// Apply authentication
router.use(requireAuth);

// Get system information
router.get('/info', async (req, res) => {
  try {
    const systemInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      nodeVersion: process.version
    };

    res.json({
      success: true,
      info: systemInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get system stats (CPU, memory, disk)
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      cpu: {
        usage: await getCPUUsage(),
        cores: os.cpus().length,
        model: os.cpus()[0].model
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
      },
      disk: await getDiskUsage(),
      uptime: os.uptime(),
      loadAverage: os.loadavg()
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get running processes
router.get('/processes', async (req, res) => {
  try {
    if (os.platform() === 'win32') {
      exec('tasklist', (error, stdout) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: error.message
          });
        }

        res.json({
          success: true,
          processes: stdout
        });
      });
    } else {
      exec('ps aux', (error, stdout) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: error.message
          });
        }

        res.json({
          success: true,
          processes: stdout
        });
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Execute system command
router.post('/execute', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        message: 'Command is required'
      });
    }

    // Security: whitelist allowed commands
    const allowedCommands = ['systemctl', 'service', 'pm2', 'docker', 'nginx'];
    const commandBase = command.split(' ')[0];

    if (!allowedCommands.includes(commandBase)) {
      return res.status(403).json({
        success: false,
        message: 'Command not allowed'
      });
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false,
          message: error.message,
          stderr
        });
      }

      res.json({
        success: true,
        output: stdout,
        stderr
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Service management endpoints
router.post('/service/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const { service } = req.body;

    if (!service) {
      return res.status(400).json({
        success: false,
        message: 'Service name is required'
      });
    }

    const allowedActions = ['start', 'stop', 'restart', 'status'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    const command = `systemctl ${action} ${service}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false,
          message: error.message,
          stderr
        });
      }

      res.json({
        success: true,
        message: `Service ${action} completed`,
        output: stdout
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Network information
router.get('/network', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    res.json({
      success: true,
      interfaces
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Helper functions
function getCPUUsage() {
  return new Promise((resolve) => {
    const startUsage = process.cpuUsage();
    const startTime = Date.now();

    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const endTime = Date.now();
      const elapTime = endTime - startTime;

      const userPercent = 100 * (endUsage.user / 1000) / (elapTime * os.cpus().length);
      const systemPercent = 100 * (endUsage.system / 1000) / (elapTime * os.cpus().length);

      resolve({
        user: userPercent.toFixed(2),
        system: systemPercent.toFixed(2),
        total: (userPercent + systemPercent).toFixed(2)
      });
    }, 100);
  });
}

async function getDiskUsage() {
  try {
    if (os.platform() === 'win32') {
      return { message: 'Disk usage not available on Windows' };
    }

    return new Promise((resolve, reject) => {
      exec('df -h /', (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const lines = stdout.trim().split('\n');
        if (lines.length < 2) {
          resolve({ message: 'Unable to parse disk usage' });
          return;
        }

        const values = lines[1].split(/\s+/);
        resolve({
          filesystem: values[0],
          size: values[1],
          used: values[2],
          available: values[3],
          usagePercent: values[4],
          mountPoint: values[5]
        });
      });
    });
  } catch (error) {
    return { message: error.message };
  }
}

module.exports = router;
