#!/bin/bash
echo "========================================"
echo "  Dashboard AI Agent - Starting Server"
echo "========================================"
echo

# Activate virtual environment
if [ -f venv/bin/activate ]; then
    source venv/bin/activate
else
    echo "[ERROR] Virtual environment not found"
    echo "Please run setup.sh first"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "[WARNING] .env file not found"
    echo "Creating from template..."
    cp .env.example .env
    echo "[ACTION REQUIRED] Please edit .env and add your GEMINI_API_KEY"
    read -p "Press Enter to continue..."
fi

echo
echo "Starting AI Agent server on http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo
echo "Press Ctrl+C to stop the server"
echo

# Run the server
python -m uvicorn services.main:app --host 0.0.0.0 --port 8000 --reload
