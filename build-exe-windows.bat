@echo off
title AI Engine - Windows EXE Builder
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed! Download LTS from https://nodejs.org
  pause
  exit /b 1
)
echo [1/2] Installing Electron & builder dependencies...
call npm install
if errorlevel 1 pause & exit /b 1
echo [2/2] Building Windows Setup & Portable .EXE...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build:exe
if errorlevel 1 pause & exit /b 1
echo Done! Check the "dist-win" folder.
explorer dist-win
pause
