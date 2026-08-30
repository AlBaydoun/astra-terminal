@echo off
title ASTRA - MT5 Bridge
cd /d "%~dp0bridge"
echo.
echo   ASTRA MT5 BRIDGE
echo   ================
echo   Keep MetaTrader 5 open and logged in.
echo   Leave this window open while you use ASTRA. Close it to stop.
echo.
python astra_mt5.py
if errorlevel 1 (
  echo.
  echo   Could not start. If it says the MetaTrader5 package is missing, run this once:
  echo       pip install MetaTrader5
  echo.
)
pause
