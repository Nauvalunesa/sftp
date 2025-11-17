const fs = require('fs');
const path = require('path');
const sshAuthService = require('./ssh-auth');

class SFTPService {
  constructor() {
    this.sftpSessions = new Map(); // Store SFTP instances per session
  }

  // Get or create SFTP instance for a session
  async getSFTP(sessionId) {
    // Check if we already have SFTP for this session
    if (this.sftpSessions.has(sessionId)) {
      return this.sftpSessions.get(sessionId);
    }

    // Get SSH connection from session
    const session = sshAuthService.getSession(sessionId);
    if (!session || !session.connection) {
      throw new Error('Invalid or expired SSH session');
    }

    // Create SFTP from existing SSH connection
    return new Promise((resolve, reject) => {
      session.connection.sftp((err, sftp) => {
        if (err) {
          reject(new Error(`Failed to create SFTP: ${err.message}`));
          return;
        }

        // Store SFTP instance
        this.sftpSessions.set(sessionId, sftp);
        resolve(sftp);
      });
    });
  }

  // Clean up SFTP session
  closeSFTP(sessionId) {
    if (this.sftpSessions.has(sessionId)) {
      const sftp = this.sftpSessions.get(sessionId);
      if (sftp && sftp.end) {
        sftp.end();
      }
      this.sftpSessions.delete(sessionId);
    }
  }

  // Get home directory for session
  async getHomeDirectory(sessionId) {
    const session = sshAuthService.getSession(sessionId);
    if (!session || !session.connection) {
      throw new Error('Invalid or expired SSH session');
    }

    return new Promise((resolve, reject) => {
      session.connection.exec('pwd', (err, stream) => {
        if (err) {
          // Fallback to /root or /home/username
          resolve('/root');
          return;
        }

        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.on('close', () => {
          const homeDir = output.trim() || '/root';
          resolve(homeDir);
        });

        stream.on('error', () => {
          resolve('/root');
        });
      });
    });
  }

  async listDirectory(sessionId, directory) {
    const sftp = await this.getSFTP(sessionId);

    // If no directory specified, use home directory
    if (!directory || directory === '/') {
      directory = await this.getHomeDirectory(sessionId);
    }

    return new Promise((resolve, reject) => {
      sftp.readdir(directory, (err, list) => {
        if (err) {
          reject(err);
          return;
        }

        const files = list.map(item => ({
          name: item.filename,
          type: item.longname.startsWith('d') ? 'directory' : 'file',
          size: item.attrs.size,
          permissions: item.attrs.mode,
          modified: item.attrs.mtime * 1000,
          owner: item.attrs.uid,
          group: item.attrs.gid
        }));

        resolve(files);
      });
    });
  }

  async downloadFile(sessionId, remotePath) {
    const sftp = await this.getSFTP(sessionId);
    return sftp.createReadStream(remotePath);
  }

  async uploadFile(sessionId, localPath, remotePath) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);

      writeStream.on('close', () => {
        // Clean up local file
        fs.unlink(localPath, () => {});
        resolve(true);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });

      readStream.pipe(writeStream);
    });
  }

  async createDirectory(sessionId, dirPath) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      sftp.mkdir(dirPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  async delete(sessionId, targetPath, isDirectory = false) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      if (isDirectory) {
        sftp.rmdir(targetPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      } else {
        sftp.unlink(targetPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      }
    });
  }

  async rename(sessionId, oldPath, newPath) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  async getFileInfo(sessionId, filePath) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      sftp.stat(filePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          size: stats.size,
          permissions: stats.mode,
          modified: stats.mtime * 1000,
          accessed: stats.atime * 1000,
          owner: stats.uid,
          group: stats.gid,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile()
        });
      });
    });
  }

  async readFile(sessionId, filePath) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      sftp.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  async writeFile(sessionId, filePath, content) {
    const sftp = await this.getSFTP(sessionId);

    return new Promise((resolve, reject) => {
      sftp.writeFile(filePath, content, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }
}

// Export singleton instance
module.exports = new SFTPService();
