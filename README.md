# VPS Console Manager

🚀 **Professional VPS Management Dashboard** - Comprehensive web-based console with noVNC, SFTP, Terminal, and System Monitoring.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![Express](https://img.shields.io/badge/express-4.18.2-lightgrey.svg)

## ✨ Features

### 🖥️ **System Monitoring**
- Real-time CPU, Memory, and Disk usage
- System information display
- Load average monitoring
- Uptime tracking
- Network interface information

### 💻 **Web Terminal**
- Full-featured web-based terminal
- Real-time command execution
- Multiple terminal sessions
- WebSocket-based communication

### 🖼️ **Remote Desktop (noVNC)**
- Browser-based VNC client
- Full desktop access
- No client software required
- Fullscreen support

### 📁 **SFTP File Manager**
- Browse remote files and directories
- Upload/Download files
- Create folders
- Delete and rename files
- Beautiful file browser interface

### ⚙️ **Service Management**
- Start/Stop/Restart services
- Service status checking
- Support for systemctl commands
- Real-time output display

### 🔐 **Security**
- Session-based authentication
- Password encryption with bcrypt
- Rate limiting
- Helmet.js security headers
- CORS protection

## 📋 Requirements

- Node.js >= 14.0.0
- npm or yarn
- Linux/Unix system (for full functionality)
- VNC server (optional, for remote desktop)
- SSH/SFTP server access

## 🚀 Installation

### 1. Clone or download the repository

```bash
cd vps-console-manager
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` file:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Session Secret (CHANGE THIS!)
SESSION_SECRET=your-super-secret-session-key-change-this

# VNC Configuration
VNC_HOST=localhost
VNC_PORT=5900
VNC_PASSWORD=

# SSH/SFTP Configuration
SSH_HOST=localhost
SSH_PORT=22

# Default Admin Credentials (CHANGE THESE!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# File Upload Settings
MAX_FILE_SIZE=100MB
UPLOAD_DIR=./uploads

# Security
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### 4. Start the server

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000`

## 📖 Usage

### Login

1. Open your browser and navigate to `http://localhost:3000`
2. Enter your credentials (default: admin/admin123)
3. Click "Login"

**⚠️ Important:** Change the default credentials immediately after first login!

### System Overview

The dashboard shows:
- CPU usage percentage
- Memory usage and details
- Disk space usage
- System uptime
- System information
- Load averages

Data refreshes automatically every 5 seconds.

### Web Terminal

1. Click on "Terminal" in the sidebar
2. The terminal will automatically connect
3. Type commands and press Enter
4. Use "Clear" to clear the terminal
5. Use "New" to create additional terminal sessions

**Supported features:**
- Full bash/shell commands
- Real-time output
- Command history (use arrow keys)
- Auto-scrolling

### Remote Desktop (noVNC)

1. Ensure VNC server is running on your system
2. Click on "Remote Desktop" in the sidebar
3. Click "Connect" to start the VNC session
4. Use "Fullscreen" for full-screen mode
5. Click "Disconnect" to end the session

**Setup VNC server:**
```bash
# Install VNC server (Ubuntu/Debian)
sudo apt-get install tightvncserver

# Start VNC server
vncserver :1 -geometry 1280x800 -depth 24
```

### SFTP File Manager

1. Click on "File Manager" in the sidebar
2. Enter SSH/SFTP credentials:
   - Host (default: localhost)
   - Port (default: 22)
   - Username
   - Password
3. Click "Connect"
4. Browse files and folders

**Features:**
- **Upload**: Click "Upload" button and select file
- **Download**: Click download icon next to file
- **New Folder**: Click "New Folder" and enter name
- **Rename**: Click edit icon and enter new name
- **Delete**: Click delete icon (confirmation required)
- **Navigate**: Click on folders to browse

### Service Management

1. Click on "Services" in the sidebar
2. Enter service name (e.g., nginx, apache2, mysql)
3. Click action button:
   - **Start**: Start the service
   - **Stop**: Stop the service
   - **Restart**: Restart the service
   - **Status**: Check service status

**Note:** Requires appropriate system permissions (sudo access).

### Network Information

1. Click on "Network" in the sidebar
2. View all network interfaces and their details:
   - IP addresses
   - MAC addresses
   - Netmasks
   - Interface names

## 🏗️ Project Structure

```
vps-console-manager/
├── server.js                 # Main server file
├── package.json             # Dependencies
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore file
├── routes/                 # API routes
│   ├── auth.js            # Authentication routes
│   ├── sftp.js            # SFTP routes
│   ├── vnc.js             # VNC routes
│   └── system.js          # System routes
├── services/              # Business logic
│   ├── sftp.js           # SFTP service
│   └── terminal.js       # Terminal service
├── middleware/           # Express middleware
│   └── auth.js          # Authentication middleware
├── public/              # Frontend files
│   ├── index.html      # Main HTML
│   ├── css/
│   │   └── style.css   # Styles
│   └── js/
│       └── app.js      # Frontend JavaScript
└── uploads/            # File upload directory
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/check` - Check authentication status
- `POST /api/auth/change-password` - Change password

### System
- `GET /api/system/info` - Get system information
- `GET /api/system/stats` - Get system statistics
- `GET /api/system/processes` - Get running processes
- `POST /api/system/execute` - Execute system command
- `POST /api/system/service/:action` - Manage services
- `GET /api/system/network` - Get network information

### SFTP
- `POST /api/sftp/connect` - Connect to SFTP
- `POST /api/sftp/disconnect` - Disconnect from SFTP
- `GET /api/sftp/list` - List directory contents
- `GET /api/sftp/download` - Download file
- `POST /api/sftp/upload` - Upload file
- `POST /api/sftp/mkdir` - Create directory
- `DELETE /api/sftp/delete` - Delete file/directory
- `POST /api/sftp/rename` - Rename file/directory
- `GET /api/sftp/info` - Get file information

### VNC
- `GET /api/vnc/config` - Get VNC configuration
- `GET /api/vnc/status` - Get VNC status
- `POST /api/vnc/proxy` - Start VNC proxy

### WebSocket
- `ws://localhost:3000/ws` - WebSocket endpoint for terminal

## 🛡️ Security Considerations

### Production Deployment

1. **Change default credentials immediately**
2. **Use strong SESSION_SECRET**
3. **Enable HTTPS with reverse proxy (nginx)**
4. **Use environment variables for sensitive data**
5. **Implement IP whitelisting if needed**
6. **Regular security updates:**
   ```bash
   npm audit
   npm audit fix
   ```

7. **Firewall configuration:**
   ```bash
   sudo ufw allow 3000/tcp
   ```

8. **Run as non-root user**
9. **Use PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start server.js --name vps-console
   pm2 startup
   pm2 save
   ```

## 🔧 Troubleshooting

### Terminal not working
- Check if `node-pty` is properly installed
- Ensure shell (bash/powershell) is available
- Check WebSocket connection

### SFTP connection fails
- Verify SSH server is running
- Check credentials
- Ensure port 22 is accessible
- Check firewall settings

### VNC not connecting
- Ensure VNC server is running
- Check VNC_HOST and VNC_PORT in .env
- Verify VNC server allows connections

### Permission denied errors
- Run services with appropriate permissions
- Some commands require sudo access
- Check file/directory permissions

## 🎨 Customization

### Change Theme Colors

Edit `public/css/style.css`:

```css
:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    /* Add your colors */
}
```

### Add New Features

1. Create route in `routes/` directory
2. Add service logic in `services/`
3. Update frontend in `public/js/app.js`
4. Add UI in `public/index.html`

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🎯 Roadmap

- [ ] Multi-user support with roles
- [ ] Database integration
- [ ] Docker support
- [ ] Real-time notifications
- [ ] Mobile responsive improvements
- [ ] File editor integration
- [ ] Process manager integration
- [ ] Backup/restore functionality
- [ ] SSL certificate management
- [ ] Log viewer

---

**Made with ❤️ for VPS Management**

*Version 1.0.0*