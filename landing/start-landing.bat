@echo off
REM Landing Page Server - Start Script
REM Note: Running on port 80 requires Administrator privileges

title AMC Landing Page Server

echo ========================================
echo   AMC Landing Page Server
echo   Starting on port 80...
echo ========================================
echo.

REM Change to the script's directory
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Check if running as administrator (port 80 requires admin)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Port 80 requires Administrator privileges!
    echo Please right-click this file and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

echo Starting server...
echo Server will be accessible at: http://192.168.2.27
echo.
call npm start

REM Keep window open if there's an error
if errorlevel 1 (
    echo.
    echo Server stopped with an error.
    pause
)

