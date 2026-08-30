@echo off
title Voxel Zen Sanctuary - Launcher
echo [Opus 5] Checking Node...
where node >nul 2>nul || (echo Node.js not found. Install from https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo [Opus 5] Installing dependencies...
  call npm install
)
echo [Opus 5] Building...
call npm run build
echo [Opus 5] Starting server at http://127.0.0.1:5173
start "" http://127.0.0.1:5173
call node server.js 5173
pause
