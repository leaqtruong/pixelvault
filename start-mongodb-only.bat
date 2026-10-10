@echo off
setlocal EnableDelayedExpansion
title PixelVault MongoDB
rem Starts only MongoDB, without the website. Safe to run at any time.
rem On this machine the "PixelVault MongoDB" Windows service already provides
rem MongoDB, so this script normally exits straight away — it is the fallback
rem for machines where the service is not installed. Because it bails out when
rem port 27017 is already taken, running it twice never creates a second mongod.

netstat -ano | findstr LISTENING | findstr ":27017 " >nul
if not errorlevel 1 exit /b 0

for /f "usebackq tokens=1,* delims==" %%k in (`node "%~dp0seed\find-mongo.js"`) do set "%%k=%%l"
if not defined MONGOD (
  echo [PixelVault MongoDB] mongod.exe not found. Set MONGOD_EXE and retry.
  exit /b 1
)
if not exist "!DBPATH!" mkdir "!DBPATH!" >nul 2>&1

rem Keep a log instead of holding a console window open.
if not exist "%~dp0.mongo-logs" mkdir "%~dp0.mongo-logs" >nul 2>&1
start "PixelVault MongoDB" /min "!MONGOD!" --dbpath "!DBPATH!" --port 27017 --bind_ip 127.0.0.1 ^
  --logpath "%~dp0.mongo-logs\mongod.log" --logappend

for /l %%i in (1,1,20) do (
  netstat -ano | findstr LISTENING | findstr ":27017 " >nul
  if not errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1