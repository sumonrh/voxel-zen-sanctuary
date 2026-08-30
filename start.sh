#!/usr/bin/env bash
set -e
echo "[Opus 5] Checking Node..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install from https://nodejs.org"
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "[Opus 5] Installing dependencies..."
  npm install
fi
echo "[Opus 5] Building..."
npm run build
echo "[Opus 5] Starting at http://127.0.0.1:5173"
if command -v xdg-open >/dev/null; then xdg-open http://127.0.0.1:5173 &
elif command -v open >/dev/null; then open http://127.0.0.1:5173 &
fi
node server.js 5173
