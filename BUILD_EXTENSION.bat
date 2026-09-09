@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo NEXUS ZENDESK COPILOT - BUILD CHECK
echo ============================================================
if not exist "chrome-extension\manifest.json" goto :missing
if not exist "chrome-extension\dist\content.js" goto :missing
if not exist "chrome-extension\dist\background.js" goto :missing
echo [OK] The repository contains the prebuilt Manifest V3 extension.
echo No Node modules or separate build step are required for Load unpacked.
exit /b 0
:missing
echo [ERROR] Prebuilt extension files are missing.
exit /b 1
