@echo off
chcp 65001 >nul
title Tianyuan Trust
cd /d "%~dp0platform"

echo.
echo   Tianyuan Trust - local demo
echo   Starting server...
echo.

rem If port 8848 is already listening, just open it.
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',8848);$c.Close();exit 0}catch{exit 1}"
if not errorlevel 1 goto openonly

set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto havenode

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  goto havenode
)

goto nonode

:havenode
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8848'"
"%NODE_EXE%" server.js
echo.
echo Server stopped. Press any key to close.
pause >nul
exit /b 0

:openonly
start "" http://127.0.0.1:8848
exit /b 0

:nonode
echo.
echo Node.js 22 or newer was not found.
echo Install it from https://nodejs.org/ and run this file again.
echo.
pause
exit /b 1
