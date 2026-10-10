@echo off
setlocal EnableDelayedExpansion
title PixelVault Store
cd /d "%~dp0"

echo(
echo  ==========================================================
echo   PixelVault - game + toy storefront
echo  ==========================================================
echo(

rem ---------------------------------------------------------------- node
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js was not found on this machine.
  echo      Install the LTS build from https://nodejs.org/ then run this file again.
  echo(
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODEVER=%%v"
if defined NODEVER (echo  [ok] Node !NODEVER!) else (echo  [ok] Node found)

rem ---------------------------------------------------- free port 3000
call :free_port
if errorlevel 1 (
  echo  [X] Port 3000 could not be released. Close whatever is holding it
  echo      ^(or run this file as Administrator^) and try again.
  echo(
  pause
  exit /b 1
)

rem ------------------------------------------------------------- MongoDB
netstat -ano | findstr LISTENING | findstr ":27017 " >nul
if not errorlevel 1 (
  echo  [ok] MongoDB is already listening on 27017.
  goto :mongo_done
)

echo  [..] Looking for mongod.exe ...
for /f "usebackq tokens=1,* delims==" %%k in (`node "%~dp0seed\find-mongo.js"`) do set "%%k=%%l"
if not defined MONGOD (
  echo  [X] mongod.exe was not found automatically.
  echo      Install MongoDB Community, or set MONGOD_EXE to the full path of
  echo      mongod.exe before running this file. The site still boots, but the
  echo      catalog stays empty until the database answers.
  goto :mongo_done
)

echo  [ok] Found: !MONGOD!
echo  [ok] Data folder: !DBPATH!
if not exist "!DBPATH!" (
  mkdir "!DBPATH!" >nul 2>&1
  if not exist "!DBPATH!" (echo  [warn] Could not create !DBPATH! - MongoDB may fail to start.)
)
start "PixelVault MongoDB" /min "!MONGOD!" --dbpath "!DBPATH!" --port 27017 --bind_ip 127.0.0.1
echo  [..] Waiting for MongoDB to accept connections ...
call :wait_port 27017 30
if errorlevel 1 (echo  [X] MongoDB did not answer within 30 seconds.) else (echo  [ok] MongoDB is up on 27017.)

:mongo_done
echo(

rem ------------------------------------------------------------- packages
if not exist "node_modules" (
  echo  [..] Installing server packages, one moment ...
  call npm install --no-audit --no-fund
)
if not exist ".env" (
  if exist ".env.example" (
    echo  [..] Creating .env from .env.example ...
    copy ".env.example" ".env" >nul
  )
)
if not exist "client\node_modules" (
  echo  [..] Installing frontend packages, one moment ...
  call npm install --prefix client --no-audit --no-fund
)

rem --------------------------------------------------------------- secrets
findstr /c:"change-me" ".env" >nul 2>&1
if not errorlevel 1 (
  echo(
  echo  [warn] .env still holds the placeholder secrets from .env.example.
  echo      Fine locally, but set real values before publishing:
  echo        SESSION_SECRET=^(60+ random chars^)
  echo        KEY_ENCRYPTION_SECRET=^(32+ chars^)
  echo      Rotate the key secret with: node seed/rotate-key-secret.js --apply
  echo(
)

rem --------------------------------------------------- database sanity check
echo  [..] Checking the catalog in MongoDB ...
for /f "usebackq delims=" %%r in (`node "%~dp0seed\check-db.js"`) do echo   %%r
echo(

rem ---------------------------------------------------------------- build
echo  [..] Building the frontend ...
call npm run build --prefix client
if errorlevel 1 (
  echo  [X] Frontend build failed - fix the errors listed above, then run again.
  echo(
  pause
  exit /b 1
)

echo(
echo  [ok] Starting the store on http://localhost:3000
echo  [..] Leave this window open. Press Ctrl+C to stop the website.
echo(
start "" "http://localhost:3000"
call npm start
echo(
echo  [X] The server stopped. Close this window.
pause
exit /b 0


rem =====================================================================
rem  :free_port  - make sure nothing is listening on 3000. errorlevel 1 if not.
rem =====================================================================
:free_port
set "BUSY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr LISTENING ^| findstr ":3000 "') do (
  if not defined BUSY set "BUSY=%%p"
)
if not defined BUSY exit /b 0
echo  [..] Port 3000 is busy ^(PID !BUSY!^) - stopping the old process.
rem Stop-Process is used instead of taskkill: taskkill refuses to run when
rem stdin is redirected, which happens under some launchers and CI shells.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Id !BUSY! -Force -ErrorAction SilentlyContinue" >nul 2>&1
call :wait_free 3000 10
if errorlevel 1 exit /b 1
echo  [ok] Port 3000 released.
exit /b 0

rem =====================================================================
rem  :wait_free <port> <seconds> - poll until the port is NOT listening.
rem  errorlevel 0 as soon as it is free, 1 on timeout.
rem =====================================================================
:wait_free
set "WF_PORT=%~1"
set "WF_TRIES=%~2"
for /l %%i in (1,1,!WF_TRIES!) do (
  netstat -ano | findstr LISTENING | findstr ":%WF_PORT% " >nul
  if errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1

rem =====================================================================
rem  :wait_port <port> <seconds> - poll until LISTENING. errorlevel 1 on
rem  timeout. The exact ":<port> " token keeps :30001 from matching :3000.
rem  ping -n 2 replaces "timeout /t 1": timeout refuses to run when stdin is
rem  redirected, which silently collapses every wait loop to zero seconds.
rem =====================================================================
:wait_port
set "WP_PORT=%~1"
set "WP_TRIES=%~2"
for /l %%i in (1,1,!WP_TRIES!) do (
  netstat -ano | findstr LISTENING | findstr ":%WP_PORT% " >nul
  if not errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1