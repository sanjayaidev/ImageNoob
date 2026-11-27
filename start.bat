@echo off
cd /d "%~dp0"
title Image Studio

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  1. Go to https://nodejs.org
  echo  2. Download and install the "LTS" version
  echo  3. Double-click this file again
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)

if not exist node_modules (
  echo Setting things up for the first time - this takes about a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b
  )
)

set AUTO_OPEN=1
node server.js
pause
