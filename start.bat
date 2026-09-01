@echo off
title Voxel Zen Sanctuary - Launcher
echo ==========================================
echo  Voxel Zen Sanctuary — Crimson Ronin
echo ==========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found!
  echo Install from https://nodejs.org (LTS)
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] Installing dependencies (first time, ~30s)...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
) else (
  echo [1/2] Dependencies OK
)

echo.
echo [2/2] Starting dev server at http://127.0.0.1:5173
echo       (Vite will auto-open your browser — keep this window open)
echo       Press Ctrl+C to stop
echo.

:: Kill anything already on 5173 (optional, ignore errors)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul

:: Directly run Vite — --open handles browser timing correctly (no blank page race)
call npx vite --port 5173 --host 127.0.0.1 --open

:: If vite dev failed, fallback to built preview
if %errorlevel% neq 0 (
  echo.
  echo [WARN] Vite dev failed, trying built preview...
  call npm run build
  call npx vite preview --port 4173 --host 127.0.0.1 --open
)

pause
