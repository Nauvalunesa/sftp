const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const sftpService = require('../services/sftp');
const multer = require('multer');
const path = require('path');
const config = require('../config');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize
  }
});

// Apply authentication to all SFTP routes
router.use(requireAuth);

// Connect to SFTP
router.post('/connect', async (req, res) => {
  try {
    const { host, port, username, password } = req.body;

    if (!host || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Host, username, and password are required'
      });
    }

    const connection = await sftpService.connect({
      host,
      port: port || 22,
      username,
      password
    });

    req.session.sftpConnected = true;

    res.json({
      success: true,
      message: 'SFTP connection established'
    });
  } catch (error) {
    console.error('SFTP connection error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Disconnect from SFTP
router.post('/disconnect', async (req, res) => {
  try {
    await sftpService.disconnect();
    req.session.sftpConnected = false;

    res.json({
      success: true,
      message: 'SFTP disconnected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// List directory contents
router.get('/list', async (req, res) => {
  try {
    const directory = req.query.path || '/';
    const files = await sftpService.listDirectory(directory);

    res.json({
      success: true,
      path: directory,
      files
    });
  } catch (error) {
    console.error('List directory error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Download file
router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    const fileStream = await sftpService.downloadFile(filePath);
    const fileName = path.basename(filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const remotePath = req.body.remotePath || '/';
    const localFile = req.file;

    if (!localFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    await sftpService.uploadFile(
      localFile.path,
      path.join(remotePath, localFile.originalname)
    );

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: localFile.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create directory
router.post('/mkdir', async (req, res) => {
  try {
    const { path: dirPath } = req.body;

    if (!dirPath) {
      return res.status(400).json({
        success: false,
        message: 'Directory path is required'
      });
    }

    await sftpService.createDirectory(dirPath);

    res.json({
      success: true,
      message: 'Directory created successfully'
    });
  } catch (error) {
    console.error('Create directory error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete file or directory
router.delete('/delete', async (req, res) => {
  try {
    const { path: targetPath, isDirectory } = req.body;

    if (!targetPath) {
      return res.status(400).json({
        success: false,
        message: 'Path is required'
      });
    }

    await sftpService.delete(targetPath, isDirectory);

    res.json({
      success: true,
      message: 'Deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Rename file or directory
router.post('/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({
        success: false,
        message: 'Old and new paths are required'
      });
    }

    await sftpService.rename(oldPath, newPath);

    res.json({
      success: true,
      message: 'Renamed successfully'
    });
  } catch (error) {
    console.error('Rename error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get file info
router.get('/info', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    const info = await sftpService.getFileInfo(filePath);

    res.json({
      success: true,
      info
    });
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
