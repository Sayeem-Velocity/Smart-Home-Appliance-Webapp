# Start All Dashboard Services
# This script starts both Node.js backend and Python AI service

Write-Host "🚀 Starting Smart Home Dashboard Services..." -ForegroundColor Cyan
Write-Host ""

# Check if running in correct directory
if (!(Test-Path "backend/server.js")) {
    Write-Host "❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Stop any existing Node processes
Write-Host "🛑 Stopping existing Node.js processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Start Node.js Backend Server
Write-Host ""
Write-Host "📦 Starting Node.js Backend (Port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; node backend/server.js"

Start-Sleep -Seconds 3

# Optional: Start Python AI Service
Write-Host ""
Write-Host "🐍 Python AI Service available at: services/" -ForegroundColor Magenta
Write-Host "   To start Python service, run: cd services; python -m uvicorn main:app --reload --port 8000" -ForegroundColor Gray
Write-Host ""

Write-Host "✅ Dashboard is starting!" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Access Points:" -ForegroundColor Cyan
Write-Host "   • Dashboard: http://localhost:3000" -ForegroundColor White
Write-Host "   • Login: demo/demo123 or admin/admin123" -ForegroundColor White
Write-Host "   • Python API (if running): http://localhost:8000" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Note: AI Chatbot uses Gemini API key from .env file" -ForegroundColor Yellow
Write-Host "   Current key: $((Get-Content .env | Select-String 'GEMINI_API_KEY' | Select-Object -First 1).ToString().Split('=')[1].Substring(0,25))..." -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop services" -ForegroundColor Red

# Keep script running
Read-Host "Press Enter to exit"
