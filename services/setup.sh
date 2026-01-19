#!/bin/bash
echo "========================================"
echo "  Dashboard AI Agent - Setup Script"
echo "========================================"
echo

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 is not installed"
    echo "Please install Python 3.10+ first"
    exit 1
fi

echo "[1/4] Creating virtual environment..."
python3 -m venv venv
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to create virtual environment"
    exit 1
fi

echo "[2/4] Activating virtual environment..."
source venv/bin/activate

echo "[3/4] Installing dependencies..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install dependencies"
    exit 1
fi

echo "[4/4] Setting up environment file..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[INFO] Created .env file from template"
    echo "[ACTION REQUIRED] Please edit .env and add your GEMINI_API_KEY"
else
    echo "[INFO] .env file already exists"
fi

echo
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo
echo "Next steps:"
echo "  1. Edit .env and add your GEMINI_API_KEY"
echo "     Get a free key from: https://aistudio.google.com/app/apikey"
echo
echo "  2. Run the server:"
echo "     ./run.sh"
echo
echo "  3. Access the API docs:"
echo "     http://localhost:8000/docs"
echo
