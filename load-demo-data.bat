@echo off
title PixelVault Demo Data
cd /d "%~dp0"
echo [PixelVault] Loading demo games, users, mods and forum posts...
echo [PixelVault] This needs MongoDB running at the address in .env
echo.
call npm run seed
pause
