@echo off
setlocal
cd /d "%~dp0zendesk-app"
where zcli >nul 2>&1
if errorlevel 1 (
  echo ZCLI is not installed.
  echo Install it with: npm install @zendesk/zcli -g
  exit /b 1
)
echo Starting Nexus Zendesk Copilot ZCLI server...
echo.
zcli apps:server .
endlocal
