@echo off
rem ASTRA Terminal - desktop program. Double-click to start.
title ASTRA - Desktop
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this PC.
  echo   Install it once from https://nodejs.org  then run this file again.
  echo.
  pause
  exit /b
)

if not exist "node_modules\electron" (
  echo.
  echo   First run: downloading the desktop shell. This happens once and
  echo   takes a few minutes. Leave this window open.
  echo.
  call npm install --no-audit --no-fund
)

rem npm can report success and still leave the program itself unpacked,
rem which produces a launcher that silently does nothing. Check and repair.
call node "desktop\repair.js"
if errorlevel 1 (
  echo.
  echo   The desktop shell could not be prepared. ASTRA still works normally
  echo   in the browser - use START-ASTRA-Terminal.bat instead.
  echo.
  pause
  exit /b
)

echo.
echo   Starting ASTRA...
echo   You can close this window once the program appears.
echo.
call npx electron .
