@echo off
title PixelVault Restart-Clean
cd /d "%~dp0"
echo [PixelVault] Stopping any old server on :3000 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
timeout /t 2 >nul
call "%~dp0start-website.bat"
