@echo off
echo Starting Frontend...
cd /d "%~dp0client"
call npm install
call npm run dev
pause
