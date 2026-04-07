@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "LOCAL_LLM_PORT=8009"
set "LOCAL_LLM_URL=http://127.0.0.1:%LOCAL_LLM_PORT%"

echo ============================================
echo Matrix Education - Start Dev
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
  start "Matrix Education Local LLM" cmd /k "cd /d ""%ROOT%local_llm"" && set ""LOCAL_LLM_PORT=%LOCAL_LLM_PORT%"" && set ""LOCAL_LLM_HOST=127.0.0.1"" && call start_local_llm.bat"
)

if not exist "%ROOT%backend\.env" (
  echo [WARN] backend\.env not found. Run setup_project.bat first.
)

if not exist "%ROOT%frontend\.env" (
  echo [WARN] frontend\.env not found. Run setup_project.bat first.
)

start "Matrix Education Backend" cmd /k "cd /d ""%ROOT%backend"" && set ""LOCAL_LLM_ENABLED=true"" && set ""LOCAL_LLM_URL=%LOCAL_LLM_URL%"" && npm.cmd run dev"
start "Matrix Education Frontend" cmd /k "cd /d ""%ROOT%frontend"" && npm.cmd run dev"

set "PM_DIR=%ROOT%practice-module"
set "PM_VENV=%PM_DIR%\.venv"
set "PM_PY=%PM_VENV%\Scripts\python.exe"
set "PM_BACKEND_PORT=8001"

if exist "%PM_PY%" (
  start "Practice Module Backend" cmd /k "cd /d ""%PM_DIR%\backend"" && ""%PM_PY%"" -m uvicorn app.main:app --reload --port %PM_BACKEND_PORT%"
  start "Practice Module Frontend" cmd /k "cd /d ""%PM_DIR%\frontend"" && npm.cmd run dev"
  echo [OK] Practice Module Backend:  http://localhost:%PM_BACKEND_PORT%
  echo [OK] Practice Module Frontend: http://localhost:5174
) else (
  echo [WARN] practice-module .venv not found. Run setup_project.bat first.
)

echo.
echo [OK] All services started in separate windows.
echo Local LLM:               %LOCAL_LLM_URL%
echo Portal Backend:          http://localhost:4000
echo Portal Frontend:         http://localhost:5173
exit /b 0
