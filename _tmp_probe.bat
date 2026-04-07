@echo off
setlocal
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "BACKEND_PORT=777"
set "FRONTEND_PORT=444"
set "LOCAL_LLM_PORT=8009"
set "LOCAL_LLM_URL=http://127.0.0.1:%LOCAL_LLM_PORT%"
set "CERT_DIR=%ROOT%frontend\.certs"
set "CERT_DIR_LEGACY=%ROOT%frontend\.cert"
set "CERT_FILE="
set "KEY_FILE="

echo ============================================
echo Aqbobek Lyceum Portal - Start Production
echo ============================================
echo.
exit /b 0
