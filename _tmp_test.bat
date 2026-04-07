@echo off
setlocal
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"
echo HEADER_OK
echo ROOT=%ROOT%
exit /b 0
