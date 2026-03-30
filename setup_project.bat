@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ============================================
echo Aqbobek Lyceum Portal - Setup
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install Node.js and run this script again.
  exit /b 1
)

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
echo [OK] Setup complete.
echo You can now run: start_dev.bat
exit /b 0

:fail
echo.
echo [FAIL] Setup stopped due to an error.
exit /b 1
