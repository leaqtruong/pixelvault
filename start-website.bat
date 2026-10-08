@echo off
title PixelVault Store
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [PixelVault] Node.js not found. Install it from https://nodejs.org/ then double-click this file again.
  pause
  exit /b 1
)
netstat -ano | findstr :27017 >nul
if errorlevel 1 (
  if exist "E:\MongolDB\mongodb-win32-x86_64-windows-8.3.8\bin\mongod.exe" (
    echo [PixelVault] Starting local MongoDB, one moment...
    start "PixelVault MongoDB" "E:\MongolDB\mongodb-win32-x86_64-windows-8.3.8\bin\mongod.exe" --dbpath E:\MongolDB\data\db --port 27017 --bind_ip 127.0.0.1
    timeout /t 5 >nul
  ) else (
    echo [PixelVault] WARNING: no MongoDB on :27017 - catalog will be empty. See README.
  )
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
