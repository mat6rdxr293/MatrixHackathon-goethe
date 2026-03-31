@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ============================================
echo Aqbobek Lyceum Portal - Setup
echo ============================================
echo.

set "MIN_NODE_MAJOR=20"
set "MIN_PY_MAJOR=3"
set "MIN_PY_MINOR=10"

call :ensure_node
if errorlevel 1 exit /b 1

call :ensure_python
if errorlevel 1 exit /b 1

echo [INFO] Installing dependencies in backend...
pushd "%ROOT%backend" >nul
if not exist package.json (
  echo [ERROR] package.json not found in backend.
  popd >nul
  goto :fail
)
call npm.cmd install
if errorlevel 1 (
  echo [ERROR] npm install failed in backend.
  popd >nul
  goto :fail
)
popd >nul
echo [OK] Dependencies installed in backend.
echo.

echo [INFO] Installing dependencies in frontend...
pushd "%ROOT%frontend" >nul
if not exist package.json (
  echo [ERROR] package.json not found in frontend.
  popd >nul
  goto :fail
)
call npm.cmd install
if errorlevel 1 (
  echo [ERROR] npm install failed in frontend.
  popd >nul
  goto :fail
)
popd >nul
echo [OK] Dependencies installed in frontend.
echo.

for %%D in (backend frontend) do (
  if exist "%ROOT%%%D\.env" (
    echo [INFO] %%D\.env already exists, skipping.
  ) else (
    if exist "%ROOT%%%D\.env.example" (
      copy /y "%ROOT%%%D\.env.example" "%ROOT%%%D\.env" >nul
      echo [OK] Created %%D\.env from .env.example
    ) else (
      echo [WARN] %%D\.env.example not found, skipped.
    )
  )
)

echo.
echo [INFO] Syncing OpenAI key from remote key.txt...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\sync_openai_key.ps1"
if errorlevel 1 (
  echo [WARN] OpenAI key sync failed. You can rerun scripts\sync_openai_key.ps1 later.
)

echo.
echo [INFO] Preparing local LLM service...
set "LLM_DIR=%ROOT%local_llm"
set "LLM_VENV=%LLM_DIR%\.venv"
set "LLM_PY=%LLM_VENV%\Scripts\python.exe"

if not exist "%LLM_DIR%\app.py" (
  echo [ERROR] local_llm\app.py not found.
  goto :fail
)

if not exist "%LLM_PY%" (
  echo [INFO] Creating virtualenv for local LLM...
  python -m venv "%LLM_VENV%"
  if errorlevel 1 (
    echo [ERROR] Failed to create local LLM virtualenv.
    goto :fail
  )
)

echo [INFO] Upgrading pip tools...
call "%LLM_PY%" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 (
  echo [ERROR] Failed to update pip tools in local LLM virtualenv.
  goto :fail
)

call "%LLM_PY%" -c "import torch" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Installing PyTorch for local LLM...
  for /f %%G in ('"%LLM_PY%" -c "import sys; print('1' if sys.version_info[:2] <= (3,12) else '0')"') do set "PY_GPU_READY=%%G"
  where nvidia-smi >nul 2>&1
  if errorlevel 1 (
    call "%LLM_PY%" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
  ) else (
    if "%PY_GPU_READY%"=="1" (
      call "%LLM_PY%" -m pip install torch --index-url https://download.pytorch.org/whl/cu121
    ) else (
      echo [INFO] Python version has no CUDA torch wheels yet, using CPU wheel.
      call "%LLM_PY%" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
    )
    if errorlevel 1 (
      echo [WARN] CUDA/primary torch install failed, falling back to CPU wheel...
      call "%LLM_PY%" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
    )
  )
  if errorlevel 1 (
    echo [ERROR] Failed to install PyTorch.
    goto :fail
  )
) else (
  echo [INFO] PyTorch already installed in local LLM virtualenv.
)

echo [INFO] Installing local LLM Python dependencies...
call "%LLM_PY%" -m pip install -r "%LLM_DIR%\requirements.txt"
if errorlevel 1 (
  echo [ERROR] Failed to install local LLM requirements.
  goto :fail
)

echo [INFO] Downloading / updating local fallback model...
call "%LLM_PY%" "%LLM_DIR%\download_model.py"
if errorlevel 1 (
  echo [ERROR] Failed to download local LLM model.
  goto :fail
)

echo [OK] Local LLM service is prepared.
echo.

if exist "%ROOT%backend\.env" (
  findstr /B /C:"LOCAL_LLM_ENABLED=" "%ROOT%backend\.env" >nul || echo LOCAL_LLM_ENABLED=true>>"%ROOT%backend\.env"
  findstr /B /C:"LOCAL_LLM_URL=" "%ROOT%backend\.env" >nul || echo LOCAL_LLM_URL=http://127.0.0.1:8009>>"%ROOT%backend\.env"
  findstr /B /C:"LOCAL_LLM_TIMEOUT_MS=" "%ROOT%backend\.env" >nul || echo LOCAL_LLM_TIMEOUT_MS=20000>>"%ROOT%backend\.env"
)

if exist "%ROOT%backend\.env.production" (
  findstr /B /C:"LOCAL_LLM_ENABLED=" "%ROOT%backend\.env.production" >nul || echo LOCAL_LLM_ENABLED=true>>"%ROOT%backend\.env.production"
  findstr /B /C:"LOCAL_LLM_URL=" "%ROOT%backend\.env.production" >nul || echo LOCAL_LLM_URL=http://127.0.0.1:8009>>"%ROOT%backend\.env.production"
  findstr /B /C:"LOCAL_LLM_TIMEOUT_MS=" "%ROOT%backend\.env.production" >nul || echo LOCAL_LLM_TIMEOUT_MS=20000>>"%ROOT%backend\.env.production"
)

echo [OK] Setup complete.
echo You can now run: start_dev.bat (or start_prod.bat)
exit /b 0

:ensure_node
set "NODE_VERSION="
set "NODE_MAJOR="
for /f %%V in ('node -p "process.versions.node" 2^>nul') do set "NODE_VERSION=%%V"
if not defined NODE_VERSION (
  echo [WARN] Node.js is not installed or not in PATH.
  call :prompt_install "Node.js LTS (>= %MIN_NODE_MAJOR%.x)" "OpenJS.NodeJS.LTS"
  exit /b 1
)

for /f "tokens=1 delims=." %%A in ("%NODE_VERSION%") do set /a NODE_MAJOR=%%A
if !NODE_MAJOR! LSS %MIN_NODE_MAJOR% (
  echo [WARN] Node.js version !NODE_VERSION! is too old. Required: >= %MIN_NODE_MAJOR%.x
  call :prompt_install "Node.js LTS (>= %MIN_NODE_MAJOR%.x)" "OpenJS.NodeJS.LTS"
  exit /b 1
)

echo [OK] Node.js !NODE_VERSION! detected.
exit /b 0

:ensure_python
set "PY_VERSION="
set "PY_MAJOR="
set "PY_MINOR="
set "PY_OK=0"

for /f %%V in ('python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2^>nul') do set "PY_VERSION=%%V"
if not defined PY_VERSION (
  echo [WARN] Python is not installed or not in PATH.
  call :prompt_install "Python 3.10+" "Python.Python.3.12"
  exit /b 1
)

for /f "tokens=1,2 delims=." %%A in ("%PY_VERSION%") do (
  set /a PY_MAJOR=%%A
  set /a PY_MINOR=%%B
)

if !PY_MAJOR! GTR %MIN_PY_MAJOR% set "PY_OK=1"
if !PY_MAJOR! EQU %MIN_PY_MAJOR% if !PY_MINOR! GEQ %MIN_PY_MINOR% set "PY_OK=1"

if "!PY_OK!"=="0" (
  echo [WARN] Python version !PY_VERSION! is too old. Required: >= %MIN_PY_MAJOR%.%MIN_PY_MINOR%
  call :prompt_install "Python 3.10+" "Python.Python.3.12"
  exit /b 1
)

echo [OK] Python !PY_VERSION! detected.
exit /b 0

:prompt_install
set "TOOL_NAME=%~1"
set "WINGET_ID=%~2"

echo [ACTION] %TOOL_NAME% is required for setup.
choice /C YN /N /M "Install automatically via winget now? [Y/N]: "
if errorlevel 2 (
  echo [INFO] Install %TOOL_NAME% manually and rerun setup_project.bat.
  exit /b 0
)

where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] winget is not available on this machine.
  echo [INFO] Install %TOOL_NAME% manually and rerun setup_project.bat.
  exit /b 0
)

echo [INFO] Installing %TOOL_NAME% via winget...
winget install -e --id %WINGET_ID% --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo [ERROR] Automatic install for %TOOL_NAME% failed.
) else (
  echo [OK] Install command completed for %TOOL_NAME%.
)

if /I "%WINGET_ID%"=="OpenJS.NodeJS.LTS" (
  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

echo [INFO] Reopen terminal and rerun setup_project.bat.
exit /b 0

:fail
echo.
echo [FAIL] Setup stopped due to an error.
exit /b 1
