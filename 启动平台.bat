@echo off
chcp 936 >nul
title 田源可信 · 溯源助农平台
cd /d "%~dp0platform"

echo.
echo   田源可信 · 农产品溯源与助农电商智能服务平台
echo   正在启动本地服务，请稍候...
echo.

rem 端口已被占用（服务已在运行）时，只打开浏览器
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',8848);$c.Close();exit 0}catch{exit 1}"
if not errorlevel 1 goto openonly

set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto havenode
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if exist "%NODE_EXE%" goto havenode
set "NODE_EXE=C:\Users\Wzy\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" goto nonode
:havenode

start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8848'"
chcp 65001 >nul
"%NODE_EXE%" server.js
chcp 936 >nul

echo.
echo   服务已停止，按任意键关闭窗口。
pause >nul
exit /b 0

:openonly
start "" http://127.0.0.1:8848
exit /b 0

:nonode
echo.
echo   未找到 Node.js。请先安装 Node.js 18 以上版本，再重新双击本文件。
echo   下载地址：https://nodejs.org/zh-cn
echo.
pause
exit /b 1
