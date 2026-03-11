@echo off
echo Starting School Management System...
echo.
echo Starting Backend Server...
start "Backend" cmd /k "cd /d %~dp0server && node server.js"
timeout /t 3 /nobreak >nul
echo Starting Frontend...
start "Frontend" cmd /k "cd /d %~dp0client && npm run dev"
echo.
echo Both servers should be starting now!
echo Backend runs on port 5000
echo Frontend runs on port 5173
echo.
pause
