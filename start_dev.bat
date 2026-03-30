@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

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

if not exist "%ROOT%backend\.env" (
  echo [WARN] backend\.env not found. Run setup_project.bat first.
)

if not exist "%ROOT%frontend\.env" (
  echo [WARN] frontend\.env not found. Run setup_project.bat first.
)

start "Aqbobek Backend" cmd /k "cd /d ""%ROOT%backend"" && npm.cmd run dev"
start "Aqbobek Frontend" cmd /k "cd /d ""%ROOT%frontend"" && npm.cmd run dev"

echo [OK] Backend and Frontend started in separate windows.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:5173
exit /b 0
