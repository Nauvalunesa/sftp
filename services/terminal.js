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

    // Create SSH shell with live terminal modes
    sshConnection.shell({
      term: 'xterm-256color',
      cols: 80,
      rows: 24,
      modes: {
        // TTY modes for live interactive terminal
        ECHO: 1,      // Echo input characters
        ICANON: 0,    // Disable canonical mode for live input
        ISIG: 1,      // Enable signals (CTRL+C, CTRL+Z)
        ICRNL: 1,     // Map CR to NL on input
        ONLCR: 1,     // Map NL to CR-NL on output
        OPOST: 1,     // Enable output processing
        IEXTEN: 1     // Enable extended input processing
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

      // Track if we received any data
      let receivedData = false;
      let promptTimeout = null;

      // Handle output from SSH
      stream.on('data', (data) => {
        if (!receivedData) {
          console.log(`Terminal ${terminalId}: First data received (${data.length} bytes)`);
          receivedData = true;
        }

        // Clear timeout if we receive data
        if (promptTimeout) {
          clearTimeout(promptTimeout);
          promptTimeout = null;
        }

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

        if (promptTimeout) {
          clearTimeout(promptTimeout);
        }

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

      console.log(`Terminal ${terminalId} created, waiting for initial prompt...`);

      // Wait for initial prompt, if none received send newline to trigger it
      promptTimeout = setTimeout(() => {
        if (!receivedData && stream.writable) {
          console.log(`Terminal ${terminalId}: No prompt after 1s, sending newline to trigger`);
          stream.write('\n');

          // If still no response after another second, send another newline
          setTimeout(() => {
            if (!receivedData && stream.writable) {
              console.log(`Terminal ${terminalId}: Still no prompt, sending another newline`);
              stream.write('\n');
            }
          }, 1000);
        }
      }, 1000);
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
