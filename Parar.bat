@echo off
title Deteniendo PelisStream...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo PelisStream detenido.
timeout /t 2 /nobreak >nul
