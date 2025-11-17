const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class MonitorService {
  constructor() {
    this.history = {
      cpu: [],
      memory: [],
      network: []
    };
    this.previousNetworkStats = null;
    this.previousCpuInfo = null;
  }

  // Get CPU usage percentage
  async getCpuUsage() {
    return new Promise((resolve) => {
      const startMeasure = this.cpuAverage();

      setTimeout(() => {
        const endMeasure = this.cpuAverage();
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);

        resolve(percentageCPU);
      }, 100);
    });
  }

  cpuAverage() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;

    cpus.forEach((cpu) => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return {
      idle: totalIdle / cpus.length,
      total: totalTick / cpus.length
    };
  }

  // Get memory usage
  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percentage: (usedMem / totalMem * 100).toFixed(2),
      totalGB: (totalMem / 1024 / 1024 / 1024).toFixed(2),
      usedGB: (usedMem / 1024 / 1024 / 1024).toFixed(2),
      freeGB: (freeMem / 1024 / 1024 / 1024).toFixed(2)
    };
  }

  // Get disk usage
  async getDiskUsage() {
    try {
      const { stdout } = await execPromise('df -h / | tail -1');
      const parts = stdout.trim().split(/\s+/);

      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        percentage: parseFloat(parts[4]),
        mountpoint: parts[5]
      };
    } catch (error) {
      console.error('Disk usage error:', error);
      return null;
    }
  }

  // Get network stats
  async getNetworkStats() {
    try {
      const { stdout } = await execPromise('cat /proc/net/dev');
      const lines = stdout.trim().split('\n');
      let totalRx = 0, totalTx = 0;

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('lo:')) continue; // Skip loopback

        const parts = line.split(/\s+/);
        const rx = parseInt(parts[1]) || 0;
        const tx = parseInt(parts[9]) || 0;

        totalRx += rx;
        totalTx += tx;
      }

      let rxSpeed = 0, txSpeed = 0;

      if (this.previousNetworkStats) {
        const timeDiff = Date.now() - this.previousNetworkStats.timestamp;
        rxSpeed = (totalRx - this.previousNetworkStats.rx) / (timeDiff / 1000);
        txSpeed = (totalTx - this.previousNetworkStats.tx) / (timeDiff / 1000);
      }

      this.previousNetworkStats = {
        rx: totalRx,
        tx: totalTx,
        timestamp: Date.now()
      };

      return {
        rx: totalRx,
        tx: totalTx,
        rxSpeed: rxSpeed > 0 ? rxSpeed : 0,
        txSpeed: txSpeed > 0 ? txSpeed : 0,
        rxSpeedMB: (rxSpeed / 1024 / 1024).toFixed(2),
        txSpeedMB: (txSpeed / 1024 / 1024).toFixed(2),
        totalRxGB: (totalRx / 1024 / 1024 / 1024).toFixed(2),
        totalTxGB: (totalTx / 1024 / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      console.error('Network stats error:', error);
      return null;
    }
  }

  // Get system info
  getSystemInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptime: os.uptime(),
      uptimeFormatted: this.formatUptime(os.uptime()),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      loadAverage: os.loadavg()
    };
  }

  // Get top processes
  async getTopProcesses(limit = 10) {
    try {
      const { stdout } = await execPromise(`ps aux --sort=-%cpu | head -n ${limit + 1}`);
      const lines = stdout.trim().split('\n');
      const processes = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        processes.push({
          user: parts[0],
          pid: parts[1],
          cpu: parseFloat(parts[2]),
          memory: parseFloat(parts[3]),
          vsz: parts[4],
          rss: parts[5],
          tty: parts[6],
          stat: parts[7],
          start: parts[8],
          time: parts[9],
          command: parts.slice(10).join(' ')
        });
      }

      return processes;
    } catch (error) {
      console.error('Process list error:', error);
      return [];
    }
  }

  // Get all stats at once
  async getAllStats() {
    const [cpu, memory, disk, network, processes] = await Promise.all([
      this.getCpuUsage(),
      Promise.resolve(this.getMemoryUsage()),
      this.getDiskUsage(),
      this.getNetworkStats(),
      this.getTopProcesses()
    ]);

    const systemInfo = this.getSystemInfo();

    // Add to history
    this.history.cpu.push({ time: Date.now(), value: cpu });
    this.history.memory.push({ time: Date.now(), value: parseFloat(memory.percentage) });

    if (network) {
      this.history.network.push({
        time: Date.now(),
        rx: network.rxSpeed,
        tx: network.txSpeed
      });
    }

    // Limit history size
    const limit = 60;
    if (this.history.cpu.length > limit) this.history.cpu.shift();
    if (this.history.memory.length > limit) this.history.memory.shift();
    if (this.history.network.length > limit) this.history.network.shift();

    return {
      cpu: {
        usage: cpu,
        cores: systemInfo.cpuCount,
        model: systemInfo.cpuModel,
        loadAverage: systemInfo.loadAverage
      },
      memory,
      disk,
      network,
      system: systemInfo,
      processes,
      history: this.history,
      timestamp: Date.now()
    };
  }

  // Format uptime to human readable
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || '0m';
  }

  // Format bytes to human readable
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new MonitorService();
