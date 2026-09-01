#!/usr/bin/env bash
set -e
echo "=========================================="
echo " Voxel Zen Sanctuary — Crimson Ronin"
echo "=========================================="
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found — https://nodejs.org"
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "[1/2] Installing dependencies..."
  npm install
else
  echo "[1/2] Dependencies OK"
fi
echo "[2/2] Starting dev at http://127.0.0.1:5173 ..."
# Kill old vite on 5173 if any (best effort)
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
npx vite --port 5173 --host 127.0.0.1 --open
