const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

class SFTPService {
  constructor() {
    this.client = null;
    this.sftp = null;
  }

  async connect(config) {
    return new Promise((resolve, reject) => {
      this.client = new Client();

      this.client.on('ready', () => {
        this.client.sftp((err, sftp) => {
          if (err) {
            reject(err);
            return;
          }

          this.sftp = sftp;
          resolve(true);
        });
      });

      this.client.on('error', (err) => {
        reject(err);
      });

      this.client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 10000
      });
    });
  }

  async disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.sftp = null;
    }
  }

  async listDirectory(directory) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return new Promise((resolve, reject) => {
      this.sftp.readdir(directory, (err, list) => {
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

  async downloadFile(remotePath) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return this.sftp.createReadStream(remotePath);
  }

  async uploadFile(localPath, remotePath) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(localPath);
      const writeStream = this.sftp.createWriteStream(remotePath);

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

  async createDirectory(dirPath) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return new Promise((resolve, reject) => {
      this.sftp.mkdir(dirPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  async delete(targetPath, isDirectory = false) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return new Promise((resolve, reject) => {
      if (isDirectory) {
        this.sftp.rmdir(targetPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      } else {
        this.sftp.unlink(targetPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      }
    });
  }

  async rename(oldPath, newPath) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return new Promise((resolve, reject) => {
      this.sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  async getFileInfo(filePath) {
    if (!this.sftp) {
      throw new Error('SFTP not connected');
    }

    return new Promise((resolve, reject) => {
      this.sftp.stat(filePath, (err, stats) => {
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
}

// Export singleton instance
module.exports = new SFTPService();
