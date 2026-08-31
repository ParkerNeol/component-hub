@echo off
cd /d "%~dp0"
if not exist "node_modules\" call npm install
echo Starting server in background...
start /min "" cmd /c node server.js > server.log 2>&1
timeout /t 3 >nul
start index.html
echo Server started! Open index.html directly
