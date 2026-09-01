#!/usr/bin/env node
// Robust launcher for Opus 5 — fixes blank-page race and Windows spawn issues
// Usage: node server.js [port]

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = parseInt(process.argv[2] || '5173', 10);
const HOST = '127.0.0.1';
const hasVite = existsSync('node_modules/.bin/vite') || existsSync('node_modules/vite/dist/node/cli.js');

if (hasVite) {
  console.log(`[server] Starting Vite dev at http://${HOST}:${PORT} ...`);
  // Use shell:true on Windows so npx.cmd resolves, and --open so browser waits until ready (no blank race)
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(cmd, ['vite', '--port', String(PORT), '--host', HOST, '--open'], {
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', code => process.exit(code ?? 0));
  child.on('error', err => {
    console.error('[server] Vite spawn failed:', err);
    process.exit(1);
  });
} else {
  console.log('[server] Vite not found — run: npm install');
  process.exit(1);
}
