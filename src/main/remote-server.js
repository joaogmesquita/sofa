// Servidor do controle remoto: serve a PWA do celular e recebe ações via WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..', 'remote');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png'
};

class RemoteServer extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.state = {};
  }

  start() {
    this.http = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      fs.readFile(file, (err, data) => {
        if (err) return res.writeHead(404).end('não encontrado');
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws' });
    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'state', state: this.state }));
      this.emit('clients', this.wss.clients.size);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'action' && msg.action) this.emit('action', msg.action);
        } catch {}
      });
      ws.on('close', () => this.emit('clients', this.wss.clients.size));
    });
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.port, '0.0.0.0', resolve);
    });
  }

  setState(patch) {
    Object.assign(this.state, patch);
    const msg = JSON.stringify({ type: 'state', state: this.state });
    for (const c of this.wss?.clients || []) if (c.readyState === 1) c.send(msg);
  }
}

module.exports = RemoteServer;
