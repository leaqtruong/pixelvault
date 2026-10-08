@echo off
title PixelVault One-Click Setup
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [PixelVault] Node.js not found. Install it from https://nodejs.org/ then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo [PixelVault] Installing backend packages...
  call npm install --no-audit --no-fund
)
if not exist client\node_modules (
  echo [PixelVault] Installing frontend packages...
  call npm install --prefix client --no-audit --no-fund
)
if not exist .env (
  echo [PixelVault] Creating .env from defaults...
  copy .env.example .env >nul
)
echo [PixelVault] Seeding demo catalog (needs MongoDB on mongodb://127.0.0.1:27017 ^(see README^))...
call node seed/import-steam.js
call node seed/seed-toys.js
call node seed/blank-reviews.js
echo [PixelVault] Building React frontend...
call npm run build --prefix client
echo.
echo [PixelVault] Done! Start with start-website.bat - demo logins gamer@vault.gg / password123
pause
