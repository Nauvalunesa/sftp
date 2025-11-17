const pty = require('node-pty');
const os = require('os');

class TerminalService {
  constructor() {
    this.terminals = new Map();
  }

  handleTerminal(ws, data) {
    const terminalId = data.terminalId || this.generateId();

    if (data.action === 'create') {
      this.createTerminal(ws, terminalId);
    } else if (data.action === 'input') {
      this.sendInput(terminalId, data.input);
    } else if (data.action === 'resize') {
      this.resizeTerminal(terminalId, data.cols, data.rows);
    }
  }

  createTerminal(ws, terminalId) {
    if (this.terminals.has(terminalId)) {
      return;
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.cwd(),
      env: process.env
    });

    this.terminals.set(terminalId, {
      pty: ptyProcess,
      ws: ws
    });

    ptyProcess.onData((data) => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(JSON.stringify({
            type: 'terminal',
            terminalId,
            action: 'output',
            data
          }));
        }
      } catch (error) {
        console.error('Error sending terminal data:', error);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Terminal ${terminalId} exited with code ${exitCode}`);
      this.terminals.delete(terminalId);

      try {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'terminal',
            terminalId,
            action: 'exit',
            exitCode,
            signal
          }));
        }
      } catch (error) {
        console.error('Error sending exit notification:', error);
      }
    });

    ws.send(JSON.stringify({
      type: 'terminal',
      terminalId,
      action: 'created',
      message: 'Terminal created successfully'
    }));
  }

  sendInput(terminalId, input) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.pty.write(input);
    }
  }

  resizeTerminal(terminalId, cols, rows) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.pty.resize(cols, rows);
    }
  }

  closeTerminal(ws) {
    // Close all terminals associated with this WebSocket
    for (const [terminalId, terminal] of this.terminals.entries()) {
      if (terminal.ws === ws) {
        terminal.pty.kill();
        this.terminals.delete(terminalId);
      }
    }
  }

  generateId() {
    return 'term_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = new TerminalService();
