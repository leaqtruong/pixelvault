@echo off
title PixelVault Restart-Clean
cd /d "%~dp0"
echo [PixelVault] Stopping anything holding :3000, then doing a clean start.
echo [PixelVault] (start-website.bat does this itself now, this file is just a shortcut.)
echo.
call "%~dp0start-website.bat"