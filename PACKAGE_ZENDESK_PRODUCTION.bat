@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
set "APP=%ROOT%zendesk-app"
set /p HOST=Enter the Nexus HTTPS hostname (example: nexus.example.com): 
if "%HOST%"=="" exit /b 1
set "HOST=%HOST:https://=%"
set "HOST=%HOST:http://=%"
for /f "tokens=1 delims=/" %%A in ("%HOST%") do set "HOST=%%A"
copy /y "%APP%\manifest.production.template.json" "%APP%\manifest.json" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%APP%\manifest.json'; $s=Get-Content -Raw $p; $s=$s.Replace('YOUR-NEXUS-HOSTNAME','%HOST%'); Set-Content -NoNewline -Encoding utf8 $p $s"
if errorlevel 1 exit /b 1
cd /d "%APP%"
where zcli >nul 2>&1
if errorlevel 1 (
  echo ZCLI is not installed. Run: npm install @zendesk/zcli -g
  exit /b 1
)
zcli apps:validate .
if errorlevel 1 exit /b 1
zcli apps:package .
if errorlevel 1 exit /b 1
echo.
echo Production private-app package created under zendesk-app\tmp\
echo The manifest now points to: https://%HOST%/zendesk/sidebar
endlocal
