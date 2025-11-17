# VPS Console Manager - SSH-First Authentication Implementation Guide

## Overview

Sistem telah diubah dari **Dashboard Login** menjadi **SSH-First Authentication**. Semua fitur (VNC, SFTP, Terminal) sekarang menggunakan SSH credentials yang sama.

## Major Changes

### 1. Authentication Flow (UPDATED)

**Before:**
```
User → Dashboard Login (admin/password) → Dashboard → Features
```

**After:**
```
User → SSH Login (host, port, username, password) → Dashboard → Features (auto-connected)
```

### 2. HTML Changes (✅ COMPLETED)

#### Login Screen (`public/index.html`)
- ✅ Changed from dashboard login to SSH login
- ✅ Added SSH host, port, username, password fields
- ✅ Form ID changed: `loginForm` → `sshLoginForm`
- ✅ Input IDs: `loginSshHost`, `loginSshPort`, `loginSshUsername`, `loginSshPassword`

#### Sidebar User Info
- ✅ Shows SSH connection info: `user@host`
- ✅ Connection status indicator
- ✅ Logout button renamed to "Disconnect"

#### SFTP File Manager
- ✅ Removed SFTP connection form (auto-connects with SSH)
- ✅ Added "New File" button
- ✅ Added "Parent Directory" navigation
- ✅ Enhanced toolbar layout
- ✅ Multiple file upload support

#### File Editor Modal
- ✅ Full-page Monaco Editor modal
- ✅ Syntax highlighting support
- ✅ Line numbers
- ✅ Save/Close buttons
- ✅ File name display

#### Move/Copy File Modal
- ✅ Source and destination path inputs
- ✅ Copy checkbox option
- ✅ Confirm/Cancel actions

### 3. CSS Styles (✅ COMPLETED)

Added styles for:
- ✅ Modal overlay and content
- ✅ Editor modal (95% screen size)
- ✅ Monaco Editor container
- ✅ Form controls
- ✅ Updated sidebar user info
- ✅ SFTP path bar
- ✅ File action buttons
- ✅ Loading states

### 4. Monaco Editor Integration (✅ COMPLETED)

- ✅ Monaco Editor CDN links added
- ✅ Editor scripts loaded
- ✅ Configuration setup

## JavaScript Changes Needed (app.js)

### Required Updates:

#### 1. SSH Login Function

```javascript
// Replace handleLogin with:
async function handleSSHLogin(e) {
    e.preventDefault();

    const host = document.getElementById('loginSshHost').value;
    const port = document.getElementById('loginSshPort').value;
    const username = document.getElementById('loginSshUsername').value;
    const password = document.getElementById('loginSshPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch('/api/vnc/ssh-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, username, password })
        });

        const data = await response.json();

        if (data.success) {
            // Store SSH session
            state.sshAuthenticated = true;
            state.sshSessionId = data.sessionId;
            state.sshCredentials = { host, port, username };

            // Show dashboard
            showDashboard();
            initializeDashboard();

            // Update user info
            document.getElementById('currentUser').textContent = `${username}@${host}`;
            document.getElementById('sshConnectionInfo').textContent = 'SSH Connected';

            // Auto-connect SFTP
            await autoConnectSFTP({ host, port, username, password });
        } else {
            errorDiv.textContent = data.message;
        }
    } catch (error) {
        errorDiv.textContent = 'SSH connection failed';
    }
}
```

#### 2. Auto-Connect SFTP

```javascript
async function autoConnectSFTP(credentials) {
    try {
        const response = await fetch('/api/sftp/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });

        const data = await response.json();

        if (data.success) {
            state.sftpConnected = true;
            // Load root directory
            loadFileList('/');
        }
    } catch (error) {
        console.error('SFTP auto-connect error:', error);
    }
}
```

#### 3. Monaco Editor Functions

```javascript
let monacoEditor = null;
let currentEditingFile = null;

async function openFileEditor(filePath, fileName) {
    try {
        // Read file content
        const response = await fetch(`/api/sftp/read-file?path=${encodeURIComponent(filePath)}`);
        const data = await response.json();

        if (!data.success) {
            showToast('Failed to read file', 'error');
            return;
        }

        // Detect language from extension
        const ext = fileName.split('.').pop();
        const language = getLanguageFromExtension(ext);

        // Show modal
        document.getElementById('fileEditorModal').classList.add('show');
        document.getElementById('editorFileName').textContent = `Editing: ${fileName}`;

        // Initialize Monaco Editor
        if (!monacoEditor) {
            require(['vs/editor/editor.main'], function() {
                monacoEditor = monaco.editor.create(document.getElementById('monacoEditor'), {
                    value: data.content,
                    language: language,
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on'
                });
            });
        } else {
            monacoEditor.setValue(data.content);
            monaco.editor.setModelLanguage(monacoEditor.getModel(), language);
        }

        currentEditingFile = filePath;
    } catch (error) {
        console.error('Open file error:', error);
        showToast('Failed to open file', 'error');
    }
}

async function saveFile() {
    if (!currentEditingFile || !monacoEditor) return;

    const content = monacoEditor.getValue();

    try {
        const response = await fetch('/api/sftp/write-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: currentEditingFile,
                content: content
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('File saved successfully', 'success');
        } else {
            showToast('Failed to save file', 'error');
        }
    } catch (error) {
        console.error('Save file error:', error);
        showToast('Failed to save file', 'error');
    }
}

function getLanguageFromExtension(ext) {
    const languageMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'json': 'json',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'less': 'less',
        'php': 'php',
        'py': 'python',
        'rb': 'ruby',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'rs': 'rust',
        'sh': 'shell',
        'bash': 'shell',
        'sql': 'sql',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'md': 'markdown',
        'txt': 'plaintext'
    };

    return languageMap[ext.toLowerCase()] || 'plaintext';
}
```

#### 4. Move/Copy File Function

```javascript
async function moveFile(sourcePath, destPath, copy = false) {
    try {
        const response = await fetch('/api/sftp/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: sourcePath,
                destination: destPath,
                copy: copy
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(copy ? 'File copied successfully' : 'File moved successfully', 'success');
            loadFileList(state.currentPath);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Move/copy error:', error);
        showToast('Operation failed', 'error');
    }
}
```

#### 5. Create New File

```javascript
async function createNewFile() {
    const fileName = prompt('Enter new file name:');
    if (!fileName) return;

    const filePath = state.currentPath === '/' ? `/${fileName}` : `${state.currentPath}/${fileName}`;

    try {
        const response = await fetch('/api/sftp/write-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: filePath,
                content: ''
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('File created successfully', 'success');
            loadFileList(state.currentPath);
            // Open in editor
            openFileEditor(filePath, fileName);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Create file error:', error);
        showToast('Failed to create file', 'error');
    }
}
```

## Backend Routes Needed (routes/sftp.js)

### Add these endpoints:

```javascript
// Read file content
router.get('/read-file', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    const content = await sftpService.readFile(filePath);

    res.json({
      success: true,
      content: content.toString('utf8')
    });
  } catch (error) {
    console.error('Read file error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Write file content
router.post('/write-file', async (req, res) => {
  try {
    const { path, content } = req.body;

    if (!path) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }

    await sftpService.writeFile(path, content);

    res.json({
      success: true,
      message: 'File written successfully'
    });
  } catch (error) {
    console.error('Write file error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Move/Copy file
router.post('/move', async (req, res) => {
  try {
    const { source, destination, copy } = req.body;

    if (!source || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination paths are required'
      });
    }

    if (copy) {
      await sftpService.copyFile(source, destination);
    } else {
      await sftpService.rename(source, destination);
    }

    res.json({
      success: true,
      message: copy ? 'File copied successfully' : 'File moved successfully'
    });
  } catch (error) {
    console.error('Move/copy error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
```

## SFTP Service Methods Needed (services/sftp.js)

```javascript
async readFile(remotePath) {
  if (!this.sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    this.sftp.readFile(remotePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
}

async writeFile(remotePath, content) {
  if (!this.sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(content, 'utf8');
    this.sftp.writeFile(remotePath, buffer, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(true);
    });
  });
}

async copyFile(source, destination) {
  // Read source, write to destination
  const data = await this.readFile(source);
  await this.writeFile(destination, data);
}
```

## Testing Checklist

- [ ] SSH login with valid credentials
- [ ] Dashboard loads after SSH auth
- [ ] User info shows username@host
- [ ] SFTP auto-connects
- [ ] File list loads
- [ ] Create new file
- [ ] Edit file (Monaco Editor opens)
- [ ] Save file changes
- [ ] Move file to different directory
- [ ] Copy file
- [ ] Delete file/folder
- [ ] Upload multiple files
- [ ] Download file
- [ ] Navigate directories
- [ ] Parent directory button works
- [ ] VNC connects with SSH session
- [ ] Terminal works
- [ ] Logout/disconnect closes SSH

## Features Summary

### ✅ Completed
- SSH-first authentication UI
- Monaco Editor integration (CDN)
- File editor modal
- Move/copy modal
- Enhanced SFTP UI
- CSS styling
- HTML structure

### ⏳ Pending Implementation
- JavaScript refactoring (app.js)
- Backend SFTP routes for file operations
- SFTP service methods for read/write

## Next Steps

1. Update `app.js` with SSH login and file operations
2. Add SFTP routes for file read/write/move
3. Update SFTP service with new methods
4. Test all functionality
5. Commit and deploy

---

**Version**: 2.0.0
**Date**: 2025-11-17
**Status**: In Progress
