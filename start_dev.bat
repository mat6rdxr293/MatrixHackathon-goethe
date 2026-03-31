@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "LOCAL_LLM_PORT=8009"
set "LOCAL_LLM_URL=http://127.0.0.1:%LOCAL_LLM_PORT%"

echo ============================================
echo Aqbobek Lyceum Portal - Start Dev
echo ============================================
echo.

if not exist "%ROOT%backend\package.json" (
  echo [ERROR] backend\package.json not found.
  exit /b 1
)

if not exist "%ROOT%frontend\package.json" (
  echo [ERROR] frontend\package.json not found.
  exit /b 1
)

echo [INFO] Syncing OpenAI key from remote key.txt...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\sync_openai_key.ps1"
if errorlevel 1 (
  echo [WARN] OpenAI key sync failed. Continuing with current env values.
)

if not exist "%ROOT%local_llm\.venv\Scripts\python.exe" (
  echo [WARN] local_llm virtualenv not found. Run setup_project.bat first.
) else (
  start "Aqbobek Local LLM" cmd /k "cd /d ""%ROOT%local_llm"" && set ""LOCAL_LLM_PORT=%LOCAL_LLM_PORT%"" && set ""LOCAL_LLM_HOST=127.0.0.1"" && call start_local_llm.bat"
)

if not exist "%ROOT%backend\.env" (
  echo [WARN] backend\.env not found. Run setup_project.bat first.
)

if not exist "%ROOT%frontend\.env" (
  echo [WARN] frontend\.env not found. Run setup_project.bat first.
)

start "Aqbobek Backend" cmd /k "cd /d ""%ROOT%backend"" && set ""LOCAL_LLM_ENABLED=true"" && set ""LOCAL_LLM_URL=%LOCAL_LLM_URL%"" && npm.cmd run dev"
start "Aqbobek Frontend" cmd /k "cd /d ""%ROOT%frontend"" && npm.cmd run dev"

echo [OK] Local LLM, Backend and Frontend started in separate windows.
echo Local LLM: %LOCAL_LLM_URL%
echo Backend:   http://localhost:4000
echo Frontend:  http://localhost:5173
exit /b 0
