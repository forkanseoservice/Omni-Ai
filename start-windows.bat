@echo off
title AI Engine
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed on this computer.
  echo 1. Download the "LTS" version from https://nodejs.org and install it.
  echo 2. Then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)

echo.
echo AI Engine is starting...
echo Your browser will open at http://localhost:3000
echo Keep this window open while you use AI Engine. Close it to stop.
echo.
start "" /min cmd /c "timeout /t 2 >nul && start http://localhost:3000"
node server.js
pause
