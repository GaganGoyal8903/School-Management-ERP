@echo off
cd /d "%~dp0server"
echo Installing dependencies...
call npm install
echo Starting server...
node server.js
pause
