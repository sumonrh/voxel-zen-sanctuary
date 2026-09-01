@echo off
setlocal
cd /d "%~dp0"
title Voxel Zen Sanctuary - Launcher
echo ==========================================
echo  Voxel Zen Sanctuary - Crimson Ronin
echo  Folder: %CD%
echo ==========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found in PATH
  echo Install from https://nodejs.org and RESTART your PC
  echo Then double-click start.bat again
  pause
  exit /b 1
)
for /f "delims=" %%i in ('node --version') do echo [OK] Node %%i
echo.

if not exist node_modules (
  echo [1/2] Installing dependencies - first time, ~30s...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
) else (
  echo [1/2] Dependencies OK
)
echo.
echo [2/2] Starting dev server at http://127.0.0.1:5173
echo       Keep this window open - press Ctrl+C to stop
echo.

:: Kill old vite on 5173
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul

:: Prefer local vite - no PATH needed, avoids npx issues
if exist "%~dp0\node_modules\.bin\vite.cmd" (
  echo [INFO] Launching local vite...
  call "%~dp0\node_modules\.bin\vite.cmd" --port 5173 --host 127.0.0.1 --open
) else (
  echo [INFO] Local vite not found, trying npm...
  call npm run dev -- --port 5173 --host 127.0.0.1 --open
)

if %errorlevel% neq 0 (
  echo.
  echo [WARN] Vite dev failed, trying built preview on 4173...
  call npm run build
  if exist "%~dp0\node_modules\.bin\vite.cmd" (
    call "%~dp0\node_modules\.bin\vite.cmd" preview --port 4173 --host 127.0.0.1 --open
  ) else (
    call npm run preview -- --port 4173 --host 127.0.0.1 --open
  )
)

pause
