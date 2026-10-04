// Minimal HTTP static file server (no HTTPS, no dependencies, no cert needed).
// Use this with cloudflared tunnel for PWA testing:
//   terminal 1: node server-http.js
//   terminal 2: cloudflared tunnel --url http://localhost:8090

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = fs.realpathSync(__dirname);
const PORT = process.env.PORT || 8090;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ip = Object.values(require('os').networkInterfaces())
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .sort((a) => a.address.startsWith('192.168.') ? -1 : 1)
    .map((i) => i.address)[0] || '127.0.0.1';
  console.log(`\n  Practice Hanzi HTTP server ready\n  http://${ip}:${PORT}\n`);
});