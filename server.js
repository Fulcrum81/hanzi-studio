// Static HTTPS server for PWA testing. Uses openssl for a proper certificate.
// Phone access: https://<your-pc-ip>:8443

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = fs.realpathSync(__dirname);
const PORT = process.env.PORT || 8443;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---- Self-signed certificate ----
const certDir = path.join(ROOT, '.cert');
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

const keyPath  = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log('Generating self-signed certificate...');

  let openssl = 'openssl';
  // On Windows, find openssl from Git for Windows
  if (process.platform === 'win32') {
    const gitPaths = [
      'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
      'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    ];
    for (const p of gitPaths) {
      if (fs.existsSync(p)) { openssl = p; break; }
    }
  }

  try {
    execSync(
      `"${openssl}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=localhost"`,
      { stdio: 'ignore', timeout: 15000 }
    );
    console.log('  OK');
  } catch (e) {
    console.error('  Failed to generate certificate.');
    console.error('  Install Git for Windows: https://git-scm.com/download/win');
    process.exit(1);
  }
}

// ---- HTTPS server ----
const server = https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
}, (req, res) => {
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
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = Object.values(require('os').networkInterfaces())
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .sort((a) => a.address.startsWith('192.168.') ? -1 : 1)
    .map((i) => i.address)[0] || '127.0.0.1';
  console.log(`\n  Practice Hanzi HTTPS server ready!\n`);
  console.log(`  Local:    https://127.0.0.1:${PORT}`);
  console.log(`  Network:  https://${ip}:${PORT}`);
  console.log(`\n  Browser warning: tap "Proceed anyway" / "Advanced → Continue".\n`);
});
