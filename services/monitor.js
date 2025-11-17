const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class MonitorService {
  constructor() {
    this.history = {};
    this.previousNetworkStats = new Map();
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

  // Get all stats at once with a single SSH command
  async getAllStats(sshConnection, sessionId) {
    try {
      // Combine all commands into one SSH exec to avoid channel limit
      const combinedCommand = `
        echo "===CPU==="
        top -bn2 -d 0.5 | grep '^%Cpu' | tail -n 1 | awk '{print $2}' | sed 's/%us,//'
        echo "===MEMORY==="
        free -m | grep Mem | awk '{print $2,$3,$4}'
        echo "===DISK==="
        df -h / | tail -1
        echo "===NETWORK==="
        cat /proc/net/dev
        echo "===SYSTEM==="
        echo "HOSTNAME:$(hostname)"
        echo "PLATFORM:$(uname -s)"
        echo "ARCH:$(uname -m)"
        echo "RELEASE:$(uname -r)"
        echo "UPTIME:$(cat /proc/uptime | awk '{print $1}')"
        echo "CPUCOUNT:$(cat /proc/cpuinfo | grep processor | wc -l)"
        echo "CPUMODEL:$(cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d: -f2 | xargs)"
        echo "LOADAVG:$(cat /proc/loadavg | awk '{print $1,$2,$3}')"
        echo "===PROCESSES==="
        ps aux --sort=-%cpu | head -n 11
      `;

      const result = await this.executeSSHCommand(sshConnection, combinedCommand);

      // Parse the combined output
      const sections = this.parseCombinedOutput(result);

      // Process each section
      const stats = {
        cpu: this.parseCpuSection(sections.CPU),
        memory: this.parseMemorySection(sections.MEMORY),
        disk: this.parseDiskSection(sections.DISK),
        network: this.parseNetworkSection(sections.NETWORK, sessionId),
        system: this.parseSystemSection(sections.SYSTEM),
        processes: this.parseProcessesSection(sections.PROCESSES),
        timestamp: Date.now()
      };

      // Update history
      if (!this.history[sessionId]) {
        this.history[sessionId] = { cpu: [], memory: [], network: [] };
      }

      const sessionHistory = this.history[sessionId];

      if (stats.cpu && stats.cpu.usage !== undefined) {
        sessionHistory.cpu.push({ time: Date.now(), value: stats.cpu.usage });
      }

      if (stats.memory && stats.memory.percentage !== undefined) {
        sessionHistory.memory.push({ time: Date.now(), value: parseFloat(stats.memory.percentage) });
      }

      if (stats.network) {
        sessionHistory.network.push({
          time: Date.now(),
          rx: stats.network.rxSpeed,
          tx: stats.network.txSpeed
        });
      }

      // Limit history size
      const limit = 60;
      if (sessionHistory.cpu.length > limit) sessionHistory.cpu.shift();
      if (sessionHistory.memory.length > limit) sessionHistory.memory.shift();
      if (sessionHistory.network.length > limit) sessionHistory.network.shift();

      stats.history = sessionHistory;

      return stats;
    } catch (error) {
      console.error('Get all stats error:', error);
      throw error;
    }
  }

  // Parse combined output into sections
  parseCombinedOutput(output) {
    const sections = {};
    const lines = output.split('\n');
    let currentSection = null;
    let sectionContent = [];

    for (const line of lines) {
      if (line.startsWith('===') && line.endsWith('===')) {
        if (currentSection) {
          sections[currentSection] = sectionContent.join('\n');
        }
        currentSection = line.replace(/===/g, '');
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }

    if (currentSection) {
      sections[currentSection] = sectionContent.join('\n');
    }

    return sections;
  }

  // Parse CPU section
  parseCpuSection(content) {
    try {
      const cpuUsage = parseFloat(content.trim()) || 0;
      return { usage: cpuUsage };
    } catch (error) {
      return { usage: 0 };
    }
  }

  // Parse memory section
  parseMemorySection(content) {
    try {
      const parts = content.trim().split(/\s+/);
      if (parts.length >= 3) {
        const totalMem = parseInt(parts[0]) * 1024 * 1024; // MB to bytes
        const usedMem = parseInt(parts[1]) * 1024 * 1024;
        const freeMem = parseInt(parts[2]) * 1024 * 1024;

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
    } catch (error) {
      console.error('Memory parse error:', error);
    }
    return null;
  }

  // Parse disk section
  parseDiskSection(content) {
    try {
      const parts = content.trim().split(/\s+/);
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
    } catch (error) {
      console.error('Disk parse error:', error);
    }
    return null;
  }

  // Parse network section
  parseNetworkSection(content, sessionId) {
    try {
      const lines = content.trim().split('\n');
      let totalRx = 0, totalTx = 0;

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('lo:')) continue;

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
      console.error('Network parse error:', error);
    }
    return null;
  }

  // Parse system section
  parseSystemSection(content) {
    try {
      const lines = content.trim().split('\n');
      const sysInfo = {};

      for (const line of lines) {
        const [key, value] = line.split(':');
        if (key && value) {
          sysInfo[key] = value.trim();
        }
      }

      const uptime = parseFloat(sysInfo.UPTIME || 0);

      return {
        hostname: sysInfo.HOSTNAME || 'Unknown',
        platform: sysInfo.PLATFORM || 'Unknown',
        arch: sysInfo.ARCH || 'Unknown',
        release: sysInfo.RELEASE || 'Unknown',
        uptime: uptime,
        uptimeFormatted: this.formatUptime(uptime),
        cpuCount: parseInt(sysInfo.CPUCOUNT) || 1,
        cpuModel: sysInfo.CPUMODEL || 'Unknown',
        loadAverage: sysInfo.LOADAVG ? sysInfo.LOADAVG.split(' ').map(parseFloat) : [0, 0, 0]
      };
    } catch (error) {
      console.error('System parse error:', error);
    }
    return null;
  }

  // Parse processes section
  parseProcessesSection(content) {
    try {
      const lines = content.trim().split('\n');
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
      console.error('Processes parse error:', error);
    }
    return [];
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
