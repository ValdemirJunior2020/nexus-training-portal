@echo off
setlocal
cd /d "%~dp0zendesk-app"
where zcli >nul 2>&1
if errorlevel 1 (
  echo ZCLI is not installed.
  echo Install it with: npm install @zendesk/zcli -g
  exit /b 1
)
echo Validating Nexus Zendesk Copilot...
zcli apps:validate .
if errorlevel 1 exit /b 1
echo.
echo Packaging private Zendesk app...
zcli apps:package .
if errorlevel 1 exit /b 1
echo.
echo Package created under zendesk-app\tmp\
endlocal
