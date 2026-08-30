@echo off
rem ASTRA Crypto & Markets Terminal - double-click to start
title ASTRA - Terminal
cd /d "%~dp0"

rem start the terminal + data service (serves the app and fetches stocks/forex/indices)
start "ASTRA data service" /min cmd /c "node server\astra-api.cjs"

rem give the server a moment, then open the terminal
ping -n 3 127.0.0.1 >nul

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:8642/
) else (
  start "" "http://localhost:8642/"
)
