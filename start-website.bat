@echo off
title PixelVault Store
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [PixelVault] Node.js not found. Install it from https://nodejs.org/ then double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo [PixelVault] First run - installing packages, one moment...
  call npm install --no-audit --no-fund
)
if not exist .env (
  echo [PixelVault] Creating .env from defaults...
  copy .env.example .env >nul
)
if not exist client\node_modules (
  echo [PixelVault] First run - installing frontend packages, one moment...
  call npm install --prefix client --no-audit --no-fund
)
echo [PixelVault] Building latest frontend, one moment...
call npm run build --prefix client
if errorlevel 1 (
  echo [PixelVault] Frontend build failed - fix errors above and retry.
  pause
  exit /b 1
)
echo [PixelVault] Starting store at http://localhost:3000 ...
echo [PixelVault] Leave this window open. Press Ctrl+C to stop the website.
start "" "http://localhost:3000"
call npm start
pause
