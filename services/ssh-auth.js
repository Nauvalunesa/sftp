const { Client } = require('ssh2');

class SSHAuthService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Authenticate SSH connection
   * @param {Object} credentials - SSH credentials
   * @returns {Promise<Object>} Authentication result
   */
  async authenticate(credentials) {
    const { host, port, username, password } = credentials;
    const sessionId = this.generateSessionId();

    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        console.log(`SSH authentication successful for ${username}@${host}`);

        // Store session
        this.sessions.set(sessionId, {
          host,
          port,
          username,
          timestamp: Date.now(),
          connection: conn
        });

        resolve({
          success: true,
          sessionId,
          message: 'SSH authentication successful',
          user: username,
          host
        });
      });

      conn.on('error', (err) => {
        console.error('SSH authentication error:', err.message);
        reject(new Error(`SSH authentication failed: ${err.message}`));
      });

      // Connect with timeout
      const connectionConfig = {
        host: host || 'localhost',
        port: port || 22,
        username,
        password,
        readyTimeout: 10000,
        keepaliveInterval: 30000
      };

      try {
        conn.connect(connectionConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Verify if session is valid
   * @param {string} sessionId - Session ID
   * @returns {boolean} Session validity
   */
  isSessionValid(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    // Check if session is older than 1 hour
    const maxAge = 60 * 60 * 1000; // 1 hour
    const age = Date.now() - session.timestamp;

    if (age > maxAge) {
      this.closeSession(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Get session information (including connection)
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session info with connection
   */
  getSession(sessionId) {
    if (!this.isSessionValid(sessionId)) {
      return null;
    }

    return this.sessions.get(sessionId);
  }

  /**
   * Get session metadata (without connection)
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session metadata
   */
  getSessionInfo(sessionId) {
    if (!this.isSessionValid(sessionId)) {
      return null;
    }

    const session = this.sessions.get(sessionId);

    if (session) {
      return {
        sessionId,
        host: session.host,
        port: session.port,
        username: session.username,
        timestamp: session.timestamp
      };
    }

    return null;
  }

  /**
   * Create SSH tunnel for VNC
   * @param {string} sessionId - Session ID
   * @param {Object} vncConfig - VNC configuration
   * @returns {Promise<Object>} Tunnel information
   */
  async createVNCTunnel(sessionId, vncConfig) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Invalid or expired SSH session');
    }

    const { connection } = session;
    const { vncHost, vncPort } = vncConfig;

    return new Promise((resolve, reject) => {
      connection.forwardOut(
        '127.0.0.1',
        0,
        vncHost || 'localhost',
        vncPort || 5900,
        (err, stream) => {
          if (err) {
            reject(new Error(`Failed to create SSH tunnel: ${err.message}`));
            return;
          }

          resolve({
            success: true,
            stream,
            message: 'SSH tunnel created for VNC'
          });
        }
      );
    });
  }

  /**
   * Execute command via SSH
   * @param {string} sessionId - Session ID
   * @param {string} command - Command to execute
   * @returns {Promise<Object>} Command result
   */
  async executeCommand(sessionId, command) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Invalid or expired SSH session');
    }

    const { connection } = session;

    return new Promise((resolve, reject) => {
      connection.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        stream.on('close', (code) => {
          resolve({
            success: code === 0,
            exitCode: code,
            stdout,
            stderr
          });
        });
      });
    });
  }

  /**
   * Close SSH session
   * @param {string} sessionId - Session ID
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (session && session.connection) {
      // Clean up SFTP sessions
      const sftpService = require('./sftp');
      sftpService.closeSFTP(sessionId);

      // Clean up terminal sessions
      const terminalService = require('./terminal');
      terminalService.closeSessionTerminals(sessionId);

      // Clean up monitor history
      const monitorService = require('./monitor');
      monitorService.cleanupSession(sessionId);

      // Close SSH connection
      session.connection.end();
      this.sessions.delete(sessionId);
      console.log(`SSH session closed: ${sessionId}`);
    }
  }

  /**
   * Close all sessions
   */
  closeAllSessions() {
    for (const [sessionId] of this.sessions) {
      this.closeSession(sessionId);
    }
  }

  /**
   * Get active sessions count
   * @returns {number} Number of active sessions
   */
  getSessionCount() {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [sessionId, session] of this.sessions) {
      const age = Date.now() - session.timestamp;

      if (age > maxAge) {
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return 'ssh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// Export singleton instance
const sshAuthService = new SSHAuthService();

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  sshAuthService.cleanupExpiredSessions();
}, 10 * 60 * 1000);

module.exports = sshAuthService;
