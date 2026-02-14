# Quick Test - Verify All Systems
Write-Host "🔍 Dashboard Systems Check" -ForegroundColor Cyan
Write-Host ""

# 1. Check if server is running
Write-Host "1️⃣ Checking Node.js Server..." -ForegroundColor Yellow
$nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcess) {
    Write-Host "   ✅ Node.js is running (PID: $($nodeProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   ❌ Node.js is NOT running" -ForegroundColor Red
    Write-Host "   💡 Start with: node backend/server.js" -ForegroundColor Gray
}

Write-Host ""

# 2. Check if port 3000 is listening
Write-Host "2️⃣ Checking Port 3000..." -ForegroundColor Yellow
$port3000 = netstat -an | Select-String ":3000"
if ($port3000) {
    Write-Host "   ✅ Port 3000 is listening" -ForegroundColor Green
} else {
    Write-Host "   ❌ Port 3000 is NOT listening" -ForegroundColor Red
}

Write-Host ""

# 3. Check .env file
Write-Host "3️⃣ Checking Configuration..." -ForegroundColor Yellow
if (Test-Path ".env") {
    $apiKey = (Get-Content .env | Select-String "^GEMINI_API_KEY" | Select-Object -First 1).ToString()
    if ($apiKey -and $apiKey -notlike "*your_gemini_api_key_here*") {
        $keyPreview = $apiKey.Split('=')[1].Substring(0, [Math]::Min(25, $apiKey.Split('=')[1].Length))
        Write-Host "   ✅ Gemini API Key configured: $keyPreview..." -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Gemini API Key not set in .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ .env file not found" -ForegroundColor Red
}

Write-Host ""

# 4. Test API endpoint
Write-Host "4️⃣ Testing API Health..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✅ API is responding: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ API not responding" -ForegroundColor Red
}

Write-Host ""

# 5. Check MQTT Broker
Write-Host "5️⃣ Checking MQTT Broker..." -ForegroundColor Yellow
$mqtt = netstat -an | Select-String ":1883"
if ($mqtt) {
    Write-Host "   ✅ MQTT Broker is running (Port 1883)" -ForegroundColor Green
} else {
    Write-Host "   ❌ MQTT Broker is NOT running" -ForegroundColor Red
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Summary
if ($nodeProcess -and $port3000) {
    Write-Host "✅ System Status: READY" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Dashboard: http://localhost:3000" -ForegroundColor White
    Write-Host "🔐 Login: demo / demo123" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ System Status: NOT READY" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Start server with:" -ForegroundColor Yellow
    Write-Host "   node backend/server.js" -ForegroundColor White
    Write-Host ""
}

Write-Host "📖 Full guide: CHATBOT_SETUP_GUIDE.md" -ForegroundColor Cyan
