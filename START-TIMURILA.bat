@echo off
rem Timurila - the new face of the terminal. Classic ASTRA is untouched and starts as before.
title Timurila
cd /d "%~dp0"

rem the same data service Classic uses; if it is already running this second copy simply exits
start "Timurila data service" /min cmd /c "node server\astra-api.cjs"
ping -n 3 127.0.0.1 >nul

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:8642/timurila/index.html
) else (
  start "" "http://localhost:8642/timurila/index.html"
)
