const sshAuthService = require('./ssh-auth');

class TerminalService {
  constructor() {
    this.terminals = new Map();
  }

  handleTerminal(ws, data, sessionId) {
    const terminalId = data.terminalId || this.generateId();

    if (data.action === 'create') {
      this.createTerminal(ws, terminalId, sessionId);
    } else if (data.action === 'input') {
      this.sendInput(terminalId, data.input);
    } else if (data.action === 'resize') {
      this.resizeTerminal(terminalId, data.cols, data.rows);
    }
  }

  createTerminal(ws, terminalId, sessionId) {
    if (this.terminals.has(terminalId)) {
      return;
    }

    // Get SSH session
    const session = sshAuthService.getSession(sessionId);
    if (!session || !session.connection) {
      ws.send(JSON.stringify({
        type: 'terminal',
        terminalId,
        action: 'error',
        message: 'SSH session not found or expired'
      }));
      return;
    }

    const sshConnection = session.connection;

    // Create SSH shell
    sshConnection.shell({
      term: 'xterm-256color',
      cols: 80,
      rows: 24,
      modes: {
        // Enable CTRL+C, CTRL+D, etc.
        ECHO: 1,
        ISIG: 1,
        ICANON: 1,
        ICRNL: 1,
        OPOST: 1
      }
    }, (err, stream) => {
      if (err) {
        console.error('Shell creation error:', err);
        ws.send(JSON.stringify({
          type: 'terminal',
          terminalId,
          action: 'error',
          message: err.message
        }));
        return;
      }

      // Store terminal session
      this.terminals.set(terminalId, {
        stream: stream,
        ws: ws,
        sessionId: sessionId
      });

      // Handle output from SSH
      stream.on('data', (data) => {
        try {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(JSON.stringify({
              type: 'terminal',
              terminalId,
              action: 'output',
              data: data.toString()
            }));
          }
        } catch (error) {
          console.error('Error sending terminal data:', error);
        }
      });

      // Handle SSH stream close
      stream.on('close', () => {
        console.log(`Terminal ${terminalId} stream closed`);
        this.terminals.delete(terminalId);

        try {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'terminal',
              terminalId,
              action: 'exit',
              message: 'Terminal session ended'
            }));
          }
        } catch (error) {
          console.error('Error sending exit notification:', error);
        }
      });

      // Send created confirmation
      ws.send(JSON.stringify({
        type: 'terminal',
        terminalId,
        action: 'created',
        message: 'Terminal created successfully'
      }));
    });
  }

  sendInput(terminalId, input) {
    const terminal = this.terminals.get(terminalId);
    if (terminal && terminal.stream) {
      terminal.stream.write(input);
    }
  }

  resizeTerminal(terminalId, cols, rows) {
    const terminal = this.terminals.get(terminalId);
    if (terminal && terminal.stream) {
      terminal.stream.setWindow(rows, cols, 0, 0);
    }
  }

  closeTerminal(ws) {
    // Close all terminals associated with this WebSocket
    for (const [terminalId, terminal] of this.terminals.entries()) {
      if (terminal.ws === ws) {
        if (terminal.stream) {
          terminal.stream.end();
        }
        this.terminals.delete(terminalId);
      }
    }
  }

  closeSessionTerminals(sessionId) {
    // Close all terminals for a specific session
    for (const [terminalId, terminal] of this.terminals.entries()) {
      if (terminal.sessionId === sessionId) {
        if (terminal.stream) {
          terminal.stream.end();
        }
        this.terminals.delete(terminalId);
      }
    }
  }

  generateId() {
    return 'term_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = new TerminalService();
