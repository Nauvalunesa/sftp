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
    this.previousNetworkStats = new Map(); // Per session
  }

  // Execute command via SSH
  async executeSSHCommand(sshConnection, command) {
    return new Promise((resolve, reject) => {
      sshConnection.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code, signal) => {
          if (code !== 0 && stderr) {
            reject(new Error(stderr));
          } else {
            resolve(stdout);
          }
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  // Get CPU usage via SSH
  async getCpuUsage(sshConnection) {
    try {
      // Use top command to get CPU usage
      const result = await this.executeSSHCommand(
        sshConnection,
        "top -bn2 -d 0.5 | grep '^%Cpu' | tail -n 1 | awk '{print $2}' | sed 's/%us,//'"
      );

      const cpuUsage = parseFloat(result.trim()) || 0;
      return cpuUsage;
    } catch (error) {
      console.error('CPU usage error:', error);
      return 0;
    }
  }

  // Get memory usage via SSH
  async getMemoryUsage(sshConnection) {
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        "free -m | grep Mem | awk '{print $1,$2,$3,$4}'"
      );

      const parts = result.trim().split(/\s+/);
      if (parts.length >= 4) {
        const totalMem = parseInt(parts[1]) * 1024 * 1024; // MB to bytes
        const usedMem = parseInt(parts[2]) * 1024 * 1024;
        const freeMem = parseInt(parts[3]) * 1024 * 1024;

        return {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          percentage: ((usedMem / totalMem) * 100).toFixed(2),
          totalGB: (totalMem / 1024 / 1024 / 1024).toFixed(2),
          usedGB: (usedMem / 1024 / 1024 / 1024).toFixed(2),
          freeGB: (freeMem / 1024 / 1024 / 1024).toFixed(2)
        };
      }

      return null;
    } catch (error) {
      console.error('Memory usage error:', error);
      return null;
    }
  }

  // Get disk usage via SSH
  async getDiskUsage(sshConnection) {
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        "df -h / | tail -1"
      );

      const parts = result.trim().split(/\s+/);

      if (parts.length >= 6) {
        return {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          percentage: parseFloat(parts[4]),
          mountpoint: parts[5]
        };
      }

      return null;
    } catch (error) {
      console.error('Disk usage error:', error);
      return null;
    }
  }

  // Get network stats via SSH
  async getNetworkStats(sshConnection, sessionId) {
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        "cat /proc/net/dev"
      );

      const lines = result.trim().split('\n');
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

      const prevStats = this.previousNetworkStats.get(sessionId);
      if (prevStats) {
        const timeDiff = Date.now() - prevStats.timestamp;
        rxSpeed = (totalRx - prevStats.rx) / (timeDiff / 1000);
        txSpeed = (totalTx - prevStats.tx) / (timeDiff / 1000);
      }

      this.previousNetworkStats.set(sessionId, {
        rx: totalRx,
        tx: totalTx,
        timestamp: Date.now()
      });

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

  // Get system info via SSH
  async getSystemInfo(sshConnection) {
    try {
      const [hostname, platform, arch, release, uptime, cpuInfo, loadAvg] = await Promise.all([
        this.executeSSHCommand(sshConnection, 'hostname'),
        this.executeSSHCommand(sshConnection, 'uname -s'),
        this.executeSSHCommand(sshConnection, 'uname -m'),
        this.executeSSHCommand(sshConnection, 'uname -r'),
        this.executeSSHCommand(sshConnection, 'cat /proc/uptime | awk \'{print $1}\''),
        this.executeSSHCommand(sshConnection, 'cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2'),
        this.executeSSHCommand(sshConnection, 'cat /proc/loadavg | awk \'{print $1,$2,$3}\'')
      ]);

      const uptimeSec = parseFloat(uptime.trim());
      const loadAvgParts = loadAvg.trim().split(/\s+/).map(parseFloat);
      const cpuCount = await this.getCpuCount(sshConnection);

      return {
        hostname: hostname.trim(),
        platform: platform.trim(),
        arch: arch.trim(),
        release: release.trim(),
        uptime: uptimeSec,
        uptimeFormatted: this.formatUptime(uptimeSec),
        cpuCount: cpuCount,
        cpuModel: cpuInfo.trim(),
        loadAverage: loadAvgParts
      };
    } catch (error) {
      console.error('System info error:', error);
      return null;
    }
  }

  // Get CPU count via SSH
  async getCpuCount(sshConnection) {
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        'cat /proc/cpuinfo | grep processor | wc -l'
      );
      return parseInt(result.trim()) || 1;
    } catch (error) {
      return 1;
    }
  }

  // Get top processes via SSH
  async getTopProcesses(sshConnection, limit = 10) {
    try {
      const result = await this.executeSSHCommand(
        sshConnection,
        `ps aux --sort=-%cpu | head -n ${limit + 1}`
      );

      const lines = result.trim().split('\n');
      const processes = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 11) {
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
      }

      return processes;
    } catch (error) {
      console.error('Process list error:', error);
      return [];
    }
  }

  // Get all stats at once via SSH
  async getAllStats(sshConnection, sessionId) {
    try {
      const [cpu, memory, disk, network, systemInfo, processes] = await Promise.all([
        this.getCpuUsage(sshConnection),
        this.getMemoryUsage(sshConnection),
        this.getDiskUsage(sshConnection),
        this.getNetworkStats(sshConnection, sessionId),
        this.getSystemInfo(sshConnection),
        this.getTopProcesses(sshConnection)
      ]);

      // Update history per session
      if (!this.history[sessionId]) {
        this.history[sessionId] = {
          cpu: [],
          memory: [],
          network: []
        };
      }

      const sessionHistory = this.history[sessionId];

      sessionHistory.cpu.push({ time: Date.now(), value: cpu });
      if (memory) {
        sessionHistory.memory.push({ time: Date.now(), value: parseFloat(memory.percentage) });
      }
      if (network) {
        sessionHistory.network.push({
          time: Date.now(),
          rx: network.rxSpeed,
          tx: network.txSpeed
        });
      }

      // Limit history size
      const limit = 60;
      if (sessionHistory.cpu.length > limit) sessionHistory.cpu.shift();
      if (sessionHistory.memory.length > limit) sessionHistory.memory.shift();
      if (sessionHistory.network.length > limit) sessionHistory.network.shift();

      return {
        cpu: {
          usage: cpu,
          cores: systemInfo ? systemInfo.cpuCount : 1,
          model: systemInfo ? systemInfo.cpuModel : 'Unknown',
          loadAverage: systemInfo ? systemInfo.loadAverage : [0, 0, 0]
        },
        memory,
        disk,
        network,
        system: systemInfo,
        processes,
        history: sessionHistory,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Get all stats error:', error);
      throw error;
    }
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

  // Cleanup session history
  cleanupSession(sessionId) {
    if (this.history[sessionId]) {
      delete this.history[sessionId];
    }
    this.previousNetworkStats.delete(sessionId);
  }
}

module.exports = new MonitorService();
