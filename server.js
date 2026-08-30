#!/usr/bin/env node
// Minimal zero-dep static server + Vite dev launcher for Opus 5 Zen Sanctuary
// Usage: node server.js  [port]   -> serves dist/ or src/ and opens browser
// This file enables "double-click to run" without manual npm commands.
// If vite is available, it launches Vite dev server for HMR; otherwise falls back to static.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const PORT = parseInt(process.argv[2] || '5173', 10);
const HOST = '127.0.0.1';

const hasVite = existsSync('node_modules/.bin/vite') || existsSync('node_modules/vite/dist/node/cli.js');
const hasDist = existsSync('dist/index.html');

if (hasVite) {
  console.log(`[server] Launching Vite dev server on http://${HOST}:${PORT} ...`);
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--host', HOST], { stdio: 'inherit', shell: false });
  child.on('exit', code => process.exit(code ?? 0));
  // try to open browser after 1.2s
  setTimeout(() => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`[server] Opening ${url}`);
    try {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      import('node:child_process').then(({ exec }) => exec(cmd));
    } catch {}
  }, 1400);
} else {
  // fallback static server (no vite, serves dist or project root)
  const root = hasDist ? resolve('dist') : resolve('.');
  const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm' };
  console.log(`[server] Vite not found, serving static "${root}" on http://${HOST}:${PORT}`);
  const srv = createServer(async (req, res) => {
    let url = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
    if (url === '/') url = '/index.html';
    const file = join(root, url);
    try {
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream'});
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
  srv.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`[server] Static server listening at ${url}`);
    try {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      import('node:child_process').then(({ exec }) => exec(cmd));
    } catch {}
  });
}
