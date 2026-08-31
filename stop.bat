@echo off
echo Stopping Component Hub service...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    echo Killing process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
if %errorlevel% equ 0 (
    echo Service stopped successfully.
) else (
    echo No service running on port 5000.
)
timeout /t 1 /nobreak >nul
