@echo off
setlocal
title Nexus HotelPlanner Training - Installer
cd /d "%~dp0"

echo ============================================================
echo   NEXUS HOTELPLANNER TRAINING - ONE TIME INSTALL
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 20 or newer.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)
where llama-server >nul 2>nul
if errorlevel 1 (
  echo [ERROR] llama.cpp was not found in PATH.
  echo Run: winget install llama.cpp
  echo Then open a new PowerShell and run this installer again.
  pause
  exit /b 1
)

echo [1/2] Installing browser application dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/2] Installing Nexus Agent dependencies...
call "%~dp0agents\nexus\install.bat"

echo.
echo ============================================================
echo INSTALL COMPLETE
echo Put nexus-model.gguf in agents\nexus\models\
echo Then run START_ALL.bat
echo ============================================================
pause
