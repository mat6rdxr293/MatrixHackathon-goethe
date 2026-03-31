@echo off
setlocal
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "BACKEND_PORT=777"
set "FRONTEND_PORT=444"
set "CERT_DIR=%ROOT%frontend\.cert"
set "CERT_FILE="
set "KEY_FILE="
set "PFX_FILE=%CERT_DIR%\localhost-prod.pfx"
set "CERT_PASS=aqbobek-local-https"

echo ============================================
echo Aqbobek Lyceum Portal - Start Production
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  exit /b 1
)

if not exist "%ROOT%backend\package.json" (
  echo [ERROR] backend\package.json not found.
  exit /b 1
)

if not exist "%ROOT%frontend\package.json" (
  echo [ERROR] frontend\package.json not found.
  exit /b 1
)

echo [INFO] Checking ports 4000, %FRONTEND_PORT% and %BACKEND_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(4000, %FRONTEND_PORT%, %BACKEND_PORT%); foreach ($port in $ports) { $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; foreach ($listener in $listeners) { $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue; if ($proc -and $proc.ProcessName -eq 'node') { Stop-Process -Id $proc.Id -Force; Write-Host ('[INFO] Stopped node PID ' + $proc.Id + ' on port ' + $port) } elseif ($proc) { Write-Host ('[ERROR] Port ' + $port + ' is used by ' + $proc.ProcessName + ' (PID ' + $proc.Id + '). Stop it manually and rerun.'); exit 2 } } }"
if errorlevel 2 (
  exit /b 2
)

if not exist "%CERT_DIR%" (
  mkdir "%CERT_DIR%"
)

if exist "%CERT_DIR%\localhost.pem" if exist "%CERT_DIR%\localhost-key.pem" (
  set "CERT_FILE=%CERT_DIR%\localhost.pem"
  set "KEY_FILE=%CERT_DIR%\localhost-key.pem"
)
if not defined CERT_FILE if exist "%CERT_DIR%\cert.pem" if exist "%CERT_DIR%\key.pem" (
  set "CERT_FILE=%CERT_DIR%\cert.pem"
  set "KEY_FILE=%CERT_DIR%\key.pem"
)
if not defined CERT_FILE if exist "%CERT_DIR%\fullchain.pem" if exist "%CERT_DIR%\privkey.pem" (
  set "CERT_FILE=%CERT_DIR%\fullchain.pem"
  set "KEY_FILE=%CERT_DIR%\privkey.pem"
)
if not defined CERT_FILE if exist "%CERT_DIR%\localhost.crt" if exist "%CERT_DIR%\localhost.key" (
  set "CERT_FILE=%CERT_DIR%\localhost.crt"
  set "KEY_FILE=%CERT_DIR%\localhost.key"
)

set "HTTPS_MODE="
if defined CERT_FILE if defined KEY_FILE (
  set "HTTPS_MODE=cert-key"
) else (
  if not exist "%PFX_FILE%" (
    echo [INFO] Certificate/key not found, generating local PFX certificate...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$cert = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'AqbobekPortalLocalProd' -NotAfter (Get-Date).AddYears(5); $pwd = ConvertTo-SecureString -String '%CERT_PASS%' -AsPlainText -Force; Export-PfxCertificate -Cert $cert -FilePath '%PFX_FILE%' -Password $pwd | Out-Null"
    if errorlevel 1 (
      echo [ERROR] Failed to generate HTTPS certificate.
      exit /b 1
    )
  )
  set "HTTPS_MODE=pfx"
)

echo [INFO] Building backend...
pushd "%ROOT%backend" >nul
if exist "dist" rmdir /s /q "dist"
call npm.cmd run build
if errorlevel 1 (
  echo [ERROR] Backend build failed.
  popd >nul
  exit /b 1
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
  echo [ERROR] Frontend build failed.
  popd >nul
  exit /b 1
)
popd >nul
echo [OK] Frontend build complete.
echo.

if /I "%HTTPS_MODE%"=="cert-key" (
  start "Aqbobek Backend PROD" cmd /k "cd /d ""%ROOT%backend"" && set ""NODE_ENV=production"" && set ""ENV_FILE=.env.production"" && set ""PORT=%BACKEND_PORT%"" && set ""BACKEND_HOST=0.0.0.0"" && set ""FRONTEND_PORT=%FRONTEND_PORT%"" && set ""CORS_ORIGIN=https://localhost:%FRONTEND_PORT%,https://matrix-host.ru:%FRONTEND_PORT%,https://vite.matrix-host.ru:%FRONTEND_PORT%"" && set ""BACKEND_PROTOCOL=https"" && set ""BACKEND_HTTPS_CERT_PATH=%CERT_FILE%"" && set ""BACKEND_HTTPS_KEY_PATH=%KEY_FILE%"" && npm.cmd run start"
) else (
  start "Aqbobek Backend PROD" cmd /k "cd /d ""%ROOT%backend"" && set ""NODE_ENV=production"" && set ""ENV_FILE=.env.production"" && set ""PORT=%BACKEND_PORT%"" && set ""BACKEND_HOST=0.0.0.0"" && set ""FRONTEND_PORT=%FRONTEND_PORT%"" && set ""CORS_ORIGIN=https://localhost:%FRONTEND_PORT%,https://matrix-host.ru:%FRONTEND_PORT%,https://vite.matrix-host.ru:%FRONTEND_PORT%"" && set ""BACKEND_PROTOCOL=https"" && set ""BACKEND_HTTPS_PFX_PATH=%PFX_FILE%"" && set ""BACKEND_HTTPS_PFX_PASS=%CERT_PASS%"" && npm.cmd run start"
)

echo [INFO] Waiting for backend to bind port %BACKEND_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready = $false; for ($i = 0; $i -lt 40; $i++) { if (Get-NetTCPConnection -LocalPort %BACKEND_PORT% -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }; Start-Sleep -Milliseconds 500 }; if (-not $ready) { exit 3 }"
if errorlevel 3 (
  echo [ERROR] Backend did not start on port %BACKEND_PORT%.
  exit /b 3
)
echo [OK] Backend is listening on port %BACKEND_PORT%.

if /I "%HTTPS_MODE%"=="cert-key" (
  start "Aqbobek Frontend PROD" cmd /k "cd /d ""%ROOT%frontend"" && set ""FRONTEND_PORT=%FRONTEND_PORT%"" && set ""BACKEND_PORT=%BACKEND_PORT%"" && set ""BACKEND_PROTOCOL=https"" && set ""BACKEND_ALLOW_FALLBACK=0"" && set ""PREVIEW_HTTPS_CERT_PATH=%CERT_FILE%"" && set ""PREVIEW_HTTPS_KEY_PATH=%KEY_FILE%"" && npm.cmd run preview -- --host 0.0.0.0 --port %FRONTEND_PORT% --strictPort"
) else (
  start "Aqbobek Frontend PROD" cmd /k "cd /d ""%ROOT%frontend"" && set ""FRONTEND_PORT=%FRONTEND_PORT%"" && set ""BACKEND_PORT=%BACKEND_PORT%"" && set ""BACKEND_PROTOCOL=https"" && set ""BACKEND_ALLOW_FALLBACK=0"" && set ""PREVIEW_HTTPS_PFX_PATH=%PFX_FILE%"" && set ""PREVIEW_HTTPS_PFX_PASS=%CERT_PASS%"" && npm.cmd run preview -- --host 0.0.0.0 --port %FRONTEND_PORT% --strictPort"
)

echo [OK] Production services started in separate windows.
echo Frontend: https://localhost:%FRONTEND_PORT%
echo Backend:  https://localhost:%BACKEND_PORT%
echo HTTPS source: %HTTPS_MODE%
if /I "%HTTPS_MODE%"=="cert-key" echo TLS files: %CERT_FILE% ^| %KEY_FILE%
echo.
echo Note: browser may show a certificate warning for local self-signed HTTPS.
exit /b 0
