@echo off
echo ========================================
echo   Dashboard AI Agent - Starting Server
echo ========================================
echo.

:: Activate virtual environment
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
) else (
    echo [ERROR] Virtual environment not found
    echo Please run setup.bat first
    pause
    exit /b 1
)

:: Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found
    echo Creating from template...
    copy .env.example .env
    echo [ACTION REQUIRED] Please edit .env and add your GEMINI_API_KEY
    pause
)

echo.
echo Starting AI Agent server on http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

:: Run the server
python -m uvicorn services.main:app --host 0.0.0.0 --port 8000 --reload

pause
