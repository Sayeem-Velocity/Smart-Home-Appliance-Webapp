@echo off
echo ========================================
echo   Dashboard AI Agent - Setup Script
echo ========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

echo [1/4] Creating virtual environment...
python -m venv venv
if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment
    pause
    exit /b 1
)

echo [2/4] Activating virtual environment...
call venv\Scripts\activate.bat

echo [3/4] Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo [4/4] Setting up environment file...
if not exist .env (
    copy .env.example .env
    echo [INFO] Created .env file from template
    echo [ACTION REQUIRED] Please edit .env and add your GEMINI_API_KEY
) else (
    echo [INFO] .env file already exists
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Edit .env and add your GEMINI_API_KEY
echo      Get a free key from: https://aistudio.google.com/app/apikey
echo.
echo   2. Run the server:
echo      run.bat
echo.
echo   3. Access the API docs:
echo      http://localhost:8000/docs
echo.
pause
