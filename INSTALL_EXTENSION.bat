@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo NEXUS ZENDESK COPILOT - EXTENSION CHECK
echo ============================================================
if not exist "chrome-extension\manifest.json" goto :missing
if not exist "chrome-extension\dist\content.js" goto :missing
if not exist "chrome-extension\dist\background.js" goto :missing
echo [OK] Extension is ready.
echo.
echo 1. Open chrome://extensions
echo 2. Enable Developer mode
echo 3. Click Load unpacked
echo 4. Select: %CD%\chrome-extension
echo 5. Open extension Options and set the Nexus backend URL.
echo.
pause
exit /b 0
:missing
echo [ERROR] Extension build files are missing.
echo Run BUILD_EXTENSION.bat first.
pause
exit /b 1
