const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

// Import configuration
const config = require('./config');

// Import routes
const authRoutes = require('./routes/auth');
const sftpRoutes = require('./routes/sftp');
const vncRoutes = require('./routes/vnc');
const systemRoutes = require('./routes/system');
const terminalHandler = require('./services/terminal');
const vncProxy = require('./services/vnc-proxy');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindow * 60 * 1000,
  max: config.security.rateLimitMax,
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Session configuration
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.server.nodeEnv === 'production',
    maxAge: config.session.maxAge
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sftp', sftpRoutes);
app.use('/api/vnc', vncRoutes);
app.use('/api/system', systemRoutes);

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection established');

  ws.on('message', (message) => {
    try {
      // Check if message is binary (VNC data)
      if (message instanceof Buffer) {
        // Forward binary data to VNC if handler exists
        if (ws._vncMessageHandler) {
          ws._vncMessageHandler(message);
        }
        return;
      }

      const data = JSON.parse(message);

      if (data.type === 'terminal') {
        terminalHandler.handleTerminal(ws, data);
      } else if (data.type === 'vnc') {
        if (data.action === 'connect') {
          // Create VNC proxy connection
          const vncConfig = {
            host: data.host || config.vnc.host,
            port: data.port || config.vnc.port
          };

          const connectionId = vncProxy.createProxy(ws, vncConfig);
          console.log(`VNC proxy created: ${connectionId}`);
        } else if (data.action === 'disconnect') {
          // Connection will be closed by proxy service
          console.log('VNC disconnect requested');
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      // Only send error for non-binary messages
      if (!(message instanceof Buffer)) {
        try {
          ws.send(JSON.stringify({
            type: 'error',
            message: error.message
          }));
        } catch (e) {
          console.error('Error sending error message:', e);
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    terminalHandler.closeTerminal(ws);
    // VNC proxy will handle its own cleanup via ws.on('close') in proxy service
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  VPS Console Manager Server                               ║
║  --------------------------------------------------------  ║
║  Server running on: http://localhost:${PORT}              ║
║  Environment: ${config.server.nodeEnv}                    ║
║                                                           ║
║  Features:                                                ║
║  - noVNC Remote Desktop                                   ║
║  - SFTP File Manager                                      ║
║  - Web Terminal                                           ║
║  - System Monitor                                         ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, wss };
