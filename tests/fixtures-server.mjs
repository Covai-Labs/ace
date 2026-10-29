import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3333;
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  if (url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Ensure path starts with /fixtures/ or is exactly /fixtures
  if (!url.pathname.startsWith('/fixtures/') && url.pathname !== '/fixtures') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const subPath = url.pathname.replace(/^\/fixtures\/?/, '');
  const filePath = path.resolve(FIXTURES_DIR, subPath);

  // Prevent path traversal outside FIXTURES_DIR
  if (!filePath.startsWith(FIXTURES_DIR + path.sep) && filePath !== FIXTURES_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'text/html',
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`[fixtures-server] Serving fixtures on http://localhost:${PORT}`);
});
