const net = require('net');

class VNCProxyService {
  constructor() {
    this.connections = new Map();
  }

  /**
   * Create a proxy connection between WebSocket client and VNC server
   * @param {WebSocket} ws - WebSocket client
   * @param {Object} config - VNC server configuration
   */
  createProxy(ws, config) {
    const { host, port } = config;
    const connectionId = this.generateConnectionId();

    console.log(`Creating VNC proxy connection to ${host}:${port}`);

    // Create TCP connection to VNC server
    const vncSocket = new net.Socket();

    // Handle VNC server connection
    vncSocket.connect(port, host, () => {
      console.log(`Connected to VNC server: ${host}:${port}`);

      ws.send(JSON.stringify({
        type: 'vnc',
        action: 'connected',
        connectionId,
        message: 'Connected to VNC server'
      }));
    });

    // Forward data from VNC server to WebSocket client
    vncSocket.on('data', (data) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        try {
          // Send binary data as ArrayBuffer
          ws.send(data, { binary: true });
        } catch (error) {
          console.error('Error sending VNC data to WebSocket:', error);
        }
      }
    });

    // Handle WebSocket messages and forward to VNC server
    const messageHandler = (message) => {
      try {
        // Check if message is binary data (VNC protocol data)
        if (message instanceof Buffer) {
          vncSocket.write(message);
        } else {
          // Try to parse as JSON for control messages
          const data = JSON.parse(message);

          if (data.type === 'vnc' && data.action === 'disconnect') {
            this.closeConnection(connectionId);
          } else if (data.type === 'vnc' && data.data) {
            // Handle base64 encoded binary data
            const buffer = Buffer.from(data.data, 'base64');
            vncSocket.write(buffer);
          }
        }
      } catch (error) {
        // If not JSON, treat as raw binary data
        if (message instanceof Buffer) {
          vncSocket.write(message);
        }
      }
    };

    // Store message handler reference
    ws._vncMessageHandler = messageHandler;

    // Handle VNC socket errors
    vncSocket.on('error', (error) => {
      console.error('VNC socket error:', error);

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'vnc',
          action: 'error',
          message: error.message
        }));
      }

      this.closeConnection(connectionId);
    });

    // Handle VNC socket close
    vncSocket.on('close', () => {
      console.log('VNC socket closed');

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'vnc',
          action: 'disconnected',
          message: 'VNC connection closed'
        }));
      }

      this.connections.delete(connectionId);
    });

    // Handle WebSocket close
    ws.on('close', () => {
      console.log('WebSocket closed, closing VNC connection');
      this.closeConnection(connectionId);
    });

    // Store connection
    this.connections.set(connectionId, {
      ws,
      vncSocket,
      messageHandler
    });

    return connectionId;
  }

  /**
   * Close a VNC proxy connection
   * @param {string} connectionId - Connection ID
   */
  closeConnection(connectionId) {
    const connection = this.connections.get(connectionId);

    if (connection) {
      const { ws, vncSocket, messageHandler } = connection;

      // Remove WebSocket message handler
      if (ws && messageHandler) {
        ws.removeListener('message', messageHandler);
      }

      // Close VNC socket
      if (vncSocket && !vncSocket.destroyed) {
        vncSocket.destroy();
      }

      this.connections.delete(connectionId);
      console.log(`Closed VNC connection: ${connectionId}`);
    }
  }

  /**
   * Close all connections
   */
  closeAll() {
    for (const [connectionId] of this.connections) {
      this.closeConnection(connectionId);
    }
  }

  /**
   * Generate unique connection ID
   * @returns {string} Connection ID
   */
  generateConnectionId() {
    return 'vnc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get active connections count
   * @returns {number} Number of active connections
   */
  getConnectionCount() {
    return this.connections.size;
  }
}

// Export singleton instance
module.exports = new VNCProxyService();
