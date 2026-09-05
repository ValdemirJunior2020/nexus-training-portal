@echo off
setlocal
title Nexus HotelPlanner Training
cd /d "%~dp0"

if not exist "node_modules\next\package.json" (
  echo Web dependencies are missing. Running npm install...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "agents\nexus\.venv\Scripts\python.exe" (
  echo Nexus is not installed yet. Running its installer...
  call "agents\nexus\install.bat"
)

curl -s http://127.0.0.1:8080/health >nul 2>nul
if errorlevel 1 (
  echo Starting llama.cpp...
  if not exist "agents\nexus\models\nexus-model.gguf" (
    echo [ERROR] Model not found: agents\nexus\models\nexus-model.gguf
    echo Put the GGUF model there first.
    pause
    exit /b 1
  )
  start "llama.cpp" cmd /k "llama-server -m "%~dp0agents\nexus\models\nexus-model.gguf" -c 16384 -ngl 20 --host 127.0.0.1 --port 8080"
  timeout /t 3 /nobreak >nul
)

curl -s http://127.0.0.1:8787/health >nul 2>nul
if errorlevel 1 (
  echo Starting Nexus Agent...
  start "Nexus Agent" cmd /k "cd /d "%~dp0agents\nexus" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8787"
  timeout /t 2 /nobreak >nul
)

echo.
echo ============================================================
echo NEXUS HOTELPLANNER TRAINING
echo Browser : http://localhost:3000
echo Nexus   : http://127.0.0.1:8787
echo llama   : http://127.0.0.1:8080
echo ============================================================
echo.
start "" http://localhost:3000
call npm run dev
goto :eof

:fail
echo Startup failed. Run INSTALL_ALL.bat first.
pause
exit /b 1
