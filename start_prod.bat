@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "BACKEND_PORT=777"
set "FRONTEND_PORT=444"
set "LOCAL_LLM_PORT=8009"
set "LOCAL_LLM_URL=http://127.0.0.1:%LOCAL_LLM_PORT%"
set "PM_BACKEND_PORT=555"
set "PM_FRONTEND_PORT=5174"
set "RUNTIME_DIR=%ROOT%.runtime"
set "BACKEND_RUNNER=%RUNTIME_DIR%\run_backend_prod.cmd"
set "FRONTEND_RUNNER=%RUNTIME_DIR%\run_frontend_prod.cmd"
set "PM_RUNNER=%RUNTIME_DIR%\run_practice_module_prod.cmd"

set "CERT_DIR_PRIMARY=%ROOT%frontend\.certs"
set "CERT_DIR_FALLBACK=%ROOT%frontend\.cert"
set "CERT_DIR="
set "CERT_FILE="
set "KEY_FILE="

echo ============================================
echo Matrix Education - Start Production
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  goto :fail
)

if not exist "%ROOT%backend\package.json" (
  echo [ERROR] backend\package.json not found.
  goto :fail
)

if not exist "%ROOT%frontend\package.json" (
  echo [ERROR] frontend\package.json not found.
  goto :fail
)

if exist "%CERT_DIR_PRIMARY%" (
  set "CERT_DIR=%CERT_DIR_PRIMARY%"
) else if exist "%CERT_DIR_FALLBACK%" (
  echo [WARN] frontend\.certs not found, using frontend\.cert
  set "CERT_DIR=%CERT_DIR_FALLBACK%"
) else (
  echo [ERROR] Certificate folder not found.
  echo Expected: frontend\.certs ^(preferred^) or frontend\.cert ^(legacy^).
  goto :fail
)

if exist "%CERT_DIR%\fullchain.pem" if exist "%CERT_DIR%\privkey.pem" (
  set "CERT_FILE=%CERT_DIR%\fullchain.pem"
  set "KEY_FILE=%CERT_DIR%\privkey.pem"
)

if not defined CERT_FILE if exist "%CERT_DIR%\cert.pem" if exist "%CERT_DIR%\key.pem" (
  set "CERT_FILE=%CERT_DIR%\cert.pem"
  set "KEY_FILE=%CERT_DIR%\key.pem"
)

if not defined CERT_FILE if exist "%CERT_DIR%\localhost.pem" if exist "%CERT_DIR%\localhost-key.pem" (
  set "CERT_FILE=%CERT_DIR%\localhost.pem"
  set "KEY_FILE=%CERT_DIR%\localhost-key.pem"
)

if not defined CERT_FILE (
  echo [ERROR] PEM certificate not found in %CERT_DIR%
  echo Supported pairs: fullchain.pem+privkey.pem, cert.pem+key.pem, localhost.pem+localhost-key.pem
  goto :fail
)

if not defined KEY_FILE (
  echo [ERROR] PEM private key not found in %CERT_DIR%
  goto :fail
)

echo [INFO] TLS cert: %CERT_FILE%
echo [INFO] TLS key : %KEY_FILE%
echo.

if exist "%ROOT%scripts\sync_openai_key.ps1" (
  echo [INFO] Syncing OpenAI key from remote key.txt...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\sync_openai_key.ps1"
  if errorlevel 1 (
    echo [WARN] OpenAI key sync failed. Continuing with current env values.
  )
  echo.
)

echo [INFO] Freeing ports %FRONTEND_PORT% and %BACKEND_PORT% if busy...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(%FRONTEND_PORT%,%BACKEND_PORT%); foreach($port in $ports){ $ls=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; foreach($l in $ls){ $p=Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue; if($p -and $p.ProcessName -eq 'node'){ Stop-Process -Id $p.Id -Force; Write-Host ('[INFO] Stopped node PID ' + $p.Id + ' on port ' + $port) } elseif($p){ Write-Host ('[ERROR] Port ' + $port + ' is used by ' + $p.ProcessName + ' (PID ' + $p.Id + '). Stop it manually.'); exit 2 } } }"
if errorlevel 2 goto :fail
echo.

if exist "%ROOT%local_llm\.venv\Scripts\python.exe" (
  start "Matrix Education Local LLM" cmd /k "cd /d ""%ROOT%local_llm"" && set ""LOCAL_LLM_PORT=%LOCAL_LLM_PORT%"" && set ""LOCAL_LLM_HOST=127.0.0.1"" && call start_local_llm.bat"
  echo [INFO] Waiting for local LLM on port %LOCAL_LLM_PORT%...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 40;$i++){ try{ $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%LOCAL_LLM_PORT%/health' -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true; break} } catch{}; Start-Sleep -Milliseconds 500 }; if(-not $ok){ exit 4 }"
  if errorlevel 4 (
    echo [WARN] Local LLM not ready. Backend will use cloud/demo fallback.
  ) else (
    echo [OK] Local LLM is ready on %LOCAL_LLM_URL%.
  )
  echo.
) else (
  echo [WARN] local_llm virtualenv not found. Run setup_project.bat to enable local LLM fallback.
  echo.
)

echo [INFO] Building backend...
pushd "%ROOT%backend" >nul
if exist "dist" rmdir /s /q "dist"
call npm.cmd run build
if errorlevel 1 (
  popd >nul
  echo [ERROR] Backend build failed.
  goto :fail
)
popd >nul
echo [OK] Backend build complete.
echo.

echo [INFO] Building frontend...
pushd "%ROOT%frontend" >nul
if exist "dist" rmdir /s /q "dist"
set "VITE_API_BASE_URL=/"
call npm.cmd run build
if errorlevel 1 (
  popd >nul
  echo [ERROR] Frontend build failed.
  goto :fail
)
popd >nul
echo [OK] Frontend build complete.
echo.

set "PM_DIR=%ROOT%practice-module"
set "PM_VENV=%PM_DIR%\.venv"
set "PM_PY=%PM_VENV%\Scripts\python.exe"

if exist "%PM_PY%" (
  echo [INFO] Building practice-module frontend...
  pushd "%PM_DIR%\frontend" >nul
  call npm.cmd run build
  if errorlevel 1 (
    popd >nul
    echo [WARN] practice-module frontend build failed. Skipping.
    goto :pm_build_done
  )
  popd >nul
  echo [OK] practice-module frontend build complete.

  echo [INFO] Copying practice-module dist to backend/app/static...
  if exist "%PM_DIR%\backend\app\static" rmdir /s /q "%PM_DIR%\backend\app\static"
  mkdir "%PM_DIR%\backend\app\static" >nul
  xcopy /e /q /y "%PM_DIR%\frontend\dist\*" "%PM_DIR%\backend\app\static\" >nul
  echo [OK] practice-module static files copied.
  echo.
) else (
  echo [WARN] practice-module .venv not found ^(run setup_project.bat^). Skipping PM build.
)

:pm_build_done

if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

> "%BACKEND_RUNNER%" echo @echo off
>> "%BACKEND_RUNNER%" echo cd /d "%ROOT%backend"
>> "%BACKEND_RUNNER%" echo set "NODE_ENV=production"
>> "%BACKEND_RUNNER%" echo set "ENV_FILE=.env.production"
>> "%BACKEND_RUNNER%" echo set "PORT=%BACKEND_PORT%"
>> "%BACKEND_RUNNER%" echo set "BACKEND_HOST=0.0.0.0"
>> "%BACKEND_RUNNER%" echo set "FRONTEND_PORT=%FRONTEND_PORT%"
>> "%BACKEND_RUNNER%" echo set "CORS_ORIGIN=https://localhost:%FRONTEND_PORT%,https://matrix-host.ru:%FRONTEND_PORT%,https://vite.matrix-host.ru:%FRONTEND_PORT%"
>> "%BACKEND_RUNNER%" echo set "BACKEND_PROTOCOL=https"
>> "%BACKEND_RUNNER%" echo set "BACKEND_HTTPS_CERT_PATH=%CERT_FILE%"
>> "%BACKEND_RUNNER%" echo set "BACKEND_HTTPS_KEY_PATH=%KEY_FILE%"
>> "%BACKEND_RUNNER%" echo set "LOCAL_LLM_ENABLED=true"
>> "%BACKEND_RUNNER%" echo set "LOCAL_LLM_URL=%LOCAL_LLM_URL%"
>> "%BACKEND_RUNNER%" echo npm.cmd run start

> "%FRONTEND_RUNNER%" echo @echo off
>> "%FRONTEND_RUNNER%" echo cd /d "%ROOT%frontend"
>> "%FRONTEND_RUNNER%" echo set "FRONTEND_PORT=%FRONTEND_PORT%"
>> "%FRONTEND_RUNNER%" echo set "BACKEND_PORT=%BACKEND_PORT%"
>> "%FRONTEND_RUNNER%" echo set "BACKEND_PROTOCOL=https"
>> "%FRONTEND_RUNNER%" echo set "BACKEND_ALLOW_FALLBACK=0"
>> "%FRONTEND_RUNNER%" echo set "PREVIEW_HTTPS_CERT_PATH=%CERT_FILE%"
>> "%FRONTEND_RUNNER%" echo set "PREVIEW_HTTPS_KEY_PATH=%KEY_FILE%"
>> "%FRONTEND_RUNNER%" echo npm.cmd run preview -- --host 0.0.0.0 --port %FRONTEND_PORT% --strictPort

echo [INFO] Starting backend on https://0.0.0.0:%BACKEND_PORT% ...
start "Matrix Education Backend PROD" cmd /k "%BACKEND_RUNNER%"

echo [INFO] Waiting for backend port %BACKEND_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready=$false; for($i=0;$i -lt 60;$i++){ if(Get-NetTCPConnection -LocalPort %BACKEND_PORT% -State Listen -ErrorAction SilentlyContinue){ $ready=$true; break }; Start-Sleep -Milliseconds 500 }; if(-not $ready){ exit 3 }"
if errorlevel 3 (
  echo [ERROR] Backend did not start on port %BACKEND_PORT%.
  goto :fail
)
echo [OK] Backend is listening on port %BACKEND_PORT%.
echo.

echo [INFO] Starting frontend on https://0.0.0.0:%FRONTEND_PORT% ...
start "Matrix Education Frontend PROD" cmd /k "%FRONTEND_RUNNER%"

if exist "%PM_PY%" (
  if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

  > "%PM_RUNNER%" echo @echo off
  >> "%PM_RUNNER%" echo cd /d "%PM_DIR%\backend"
  >> "%PM_RUNNER%" echo "%PM_PY%" -m uvicorn app.main:app --host 0.0.0.0 --port %PM_BACKEND_PORT% --ssl-certfile "%CERT_FILE%" --ssl-keyfile "%KEY_FILE%"

  echo [INFO] Starting practice-module on https://0.0.0.0:%PM_BACKEND_PORT% ...
  start "Practice Module PROD" cmd /k "%PM_RUNNER%"
  echo [OK] Practice Module started on https://lab.matrix-host.ru:%PM_BACKEND_PORT%
  echo.
)

echo.
echo [OK] Production services started.
echo Portal Frontend:         https://localhost:%FRONTEND_PORT%
echo Portal Backend:          https://localhost:%BACKEND_PORT%
echo Practice Module:         https://lab.matrix-host.ru:%PM_BACKEND_PORT%
echo LocalLLM:                %LOCAL_LLM_URL%
echo.
exit /b 0

:fail
echo.
echo [FAIL] start_prod.bat stopped with errors.
pause
exit /b 1
