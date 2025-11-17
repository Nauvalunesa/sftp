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

// Get home directory
router.get('/home', async (req, res) => {
  try {
    const sessionId = req.session.sshSessionId;
    const homeDir = await sftpService.getHomeDirectory(sessionId);

    res.json({
      success: true,
      path: homeDir
    });
  } catch (error) {
    console.error('Get home directory error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// List directory contents (SFTP auto-connects using existing SSH session)
router.get('/list', async (req, res) => {
  try {
    const sessionId = req.session.sshSessionId;
    let directory = req.query.path;

    // Get actual directory path (resolves home if needed)
    if (!directory || directory === '/') {
      directory = await sftpService.getHomeDirectory(sessionId);
    }

    const files = await sftpService.listDirectory(sessionId, directory);

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

// Read file content (for Monaco Editor)
router.get('/read', async (req, res) => {
  try {
    const sessionId = req.session.sshSessionId;
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    const content = await sftpService.readFile(sessionId, filePath);

    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Read file error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Write file content (for Monaco Editor)
router.post('/write', async (req, res) => {
  try {
    const sessionId = req.session.sshSessionId;
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    await sftpService.writeFile(sessionId, filePath, content || '');

    res.json({
      success: true,
      message: 'File saved successfully'
    });
  } catch (error) {
    console.error('Write file error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Download file
router.get('/download', async (req, res) => {
  try {
    const sessionId = req.session.sshSessionId;
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    const fileStream = await sftpService.downloadFile(sessionId, filePath);
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
    const sessionId = req.session.sshSessionId;
    const remotePath = req.body.remotePath || '/';
    const localFile = req.file;

    if (!localFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    await sftpService.uploadFile(
      sessionId,
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
    const sessionId = req.session.sshSessionId;
    const { path: dirPath } = req.body;

    if (!dirPath) {
      return res.status(400).json({
        success: false,
        message: 'Directory path is required'
      });
    }

    await sftpService.createDirectory(sessionId, dirPath);

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
    const sessionId = req.session.sshSessionId;
    const { path: targetPath, isDirectory } = req.body;

    if (!targetPath) {
      return res.status(400).json({
        success: false,
        message: 'Path is required'
      });
    }

    await sftpService.delete(sessionId, targetPath, isDirectory);

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
    const sessionId = req.session.sshSessionId;
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({
        success: false,
        message: 'Old and new paths are required'
      });
    }

    await sftpService.rename(sessionId, oldPath, newPath);

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
    const sessionId = req.session.sshSessionId;
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    const info = await sftpService.getFileInfo(sessionId, filePath);

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
