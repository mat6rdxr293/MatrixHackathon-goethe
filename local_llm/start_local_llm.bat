@echo off
setlocal

set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"

if not exist "%VENV%\Scripts\python.exe" (
  echo [ERROR] Local LLM venv not found: %VENV%
  echo Run setup_project.bat first.
  exit /b 1
)

if not defined LOCAL_LLM_PORT set "LOCAL_LLM_PORT=8009"
if not defined LOCAL_LLM_HOST set "LOCAL_LLM_HOST=127.0.0.1"

cd /d "%ROOT%"
"%VENV%\Scripts\python.exe" app.py
