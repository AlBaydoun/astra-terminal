@echo off
setlocal
chcp 65001 >nul 2>&1
title ASTRA - MT5 Bridge
cd /d "%~dp0bridge"

echo.
echo   ASTRA MT5 BRIDGE
echo   ================
echo   Reads prices from your JustMarkets MetaTrader 5 terminal.
echo   It never places an order and never sees your password.
echo.

rem --- find a working Python ------------------------------------------------
set "PY="
py -3 -c "import sys" >nul 2>&1 && set "PY=py -3"
if not defined PY python -c "import sys" >nul 2>&1 && set "PY=python"
if not defined PY python3 -c "import sys" >nul 2>&1 && set "PY=python3"

if not defined PY (
  echo   Python is not installed on this computer.
  echo.
  echo   Install it once from  https://www.python.org/downloads/
  echo   During setup, tick "Add Python to PATH", then run this again.
  echo.
  pause
  exit /b 1
)

rem --- make sure the MetaTrader link is installed, without asking you to ----
%PY% -c "import MetaTrader5" >nul 2>&1
if errorlevel 1 (
  echo   First run - installing the MetaTrader 5 link. This takes a moment...
  echo.
  %PY% -m pip install --quiet --disable-pip-version-check MetaTrader5
  %PY% -c "import MetaTrader5" >nul 2>&1
  if errorlevel 1 (
    echo   Trying again for this user account only...
    %PY% -m pip install --quiet --disable-pip-version-check --user MetaTrader5
  )
  %PY% -c "import MetaTrader5" >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   The MetaTrader 5 link could not be installed automatically.
    echo   Check that this computer is online and try once more.
    echo.
    pause
    exit /b 1
  )
  echo   Installed.
  echo.
)

rem --- run it ---------------------------------------------------------------
echo   Keep MetaTrader 5 open and logged in.
echo   Leave this window open while you use ASTRA. Close it to stop.
echo.
%PY% -u astra_mt5.py %*

echo.
echo   The bridge has stopped.
pause
