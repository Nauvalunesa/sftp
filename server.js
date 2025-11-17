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
const sftpRoutes = require('./routes/sftp');
const monitorRoutes = require('./routes/monitor');
const systemRoutes = require('./routes/system');
const terminalHandler = require('./services/terminal');
const sshAuthService = require('./services/ssh-auth');

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
app.use('/api/sftp', sftpRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/system', systemRoutes);

// SSH Authentication endpoint
app.post('/api/ssh/auth', async (req, res) => {
  try {
    const { host, port, username, password } = req.body;

    if (!host || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Host, username, and password are required'
      });
    }

    const result = await sshAuthService.authenticate({
      host,
      port: port || 22,
      username,
      password
    });

    req.session.sshSessionId = result.sessionId;
    req.session.sshHost = host;
    req.session.sshUsername = username;

    res.json({
      success: true,
      message: 'SSH authentication successful',
      sessionId: result.sessionId,
      user: result.user,
      host: result.host
    });
  } catch (error) {
    console.error('SSH auth error:', error);
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// SSH session status
app.get('/api/ssh/status', (req, res) => {
  const sessionId = req.session.sshSessionId;

  if (!sessionId) {
    return res.json({
      success: true,
      authenticated: false
    });
  }

  const isValid = sshAuthService.isSessionValid(sessionId);
  const session = sshAuthService.getSession(sessionId);

  res.json({
    success: true,
    authenticated: isValid,
    host: req.session.sshHost,
    username: req.session.sshUsername,
    session: session || null
  });
});

// SSH disconnect
app.post('/api/ssh/disconnect', (req, res) => {
  const sessionId = req.session.sshSessionId;

  if (sessionId) {
    sshAuthService.closeSession(sessionId);
    delete req.session.sshSessionId;
    delete req.session.sshHost;
    delete req.session.sshUsername;
  }

  res.json({
    success: true,
    message: 'SSH session closed'
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection established');

  // Parse session from cookies
  let sessionId = null;
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});

    // Extract session ID from cookie (adjust cookie name if needed)
    const sessionCookie = cookies['connect.sid'];
    if (sessionCookie) {
      // Decode session cookie to get sessionId
      // Session middleware stores it in format: s:{sessionId}.{signature}
      const decodedCookie = decodeURIComponent(sessionCookie);
      const match = decodedCookie.match(/^s:([^.]+)\./);
      if (match) {
        sessionId = match[1];
      }
    }
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'terminal') {
        // Pass sessionId from data or from cookie
        const sshSessionId = data.sessionId || sessionId;
        terminalHandler.handleTerminal(ws, data, sshSessionId);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      try {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      } catch (e) {
        console.error('Error sending error message:', e);
      }
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    terminalHandler.closeTerminal(ws);
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
║  - SSH Authentication                                     ║
║  - SFTP File Manager                                      ║
║  - Web Terminal                                           ║
║  - Real-time Server Monitoring                            ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, wss };
