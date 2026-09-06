@echo off
title ASTRA - LIVE TRADING BRIDGE  (real money)
color 4F
cd /d "%~dp0"
echo.
echo  ================================================================
echo                      R E A L   T R A D I N G
echo  ================================================================
echo.
echo   This window is the only thing that lets ASTRA place REAL orders
echo   in your MetaTrader 5 account.
echo.
echo   Normal use does not need it. START-MT5-Bridge.bat opens the same
echo   connection read-only and cannot trade.
echo.
echo   While this window is open ASTRA may send orders you have armed.
echo   CLOSING THIS WINDOW STOPS ALL LIVE TRADING IMMEDIATELY.
echo.
echo  ================================================================
echo.
set "GO="
set /p GO="Type LIVE and press Enter to continue (anything else quits): "
if /I not "%GO%"=="LIVE" (
  echo.
  echo   Cancelled. Nothing was started.
  timeout /t 3 >nul
  exit /b
)
echo.
python "bridge\astra_mt5.py" --enable-trading
echo.
echo   The live bridge has stopped. No further orders can be sent.
pause
