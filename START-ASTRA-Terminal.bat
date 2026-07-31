@echo off
rem ASTRA Crypto Terminal — double-click to start
cd /d "%~dp0"
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="file:///%~dp0index.html"
) else (
  start "" "index.html"
)
