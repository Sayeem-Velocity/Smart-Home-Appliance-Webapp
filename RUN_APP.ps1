# ============================================
# Smart Load Dashboard - Run Application
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Smart Load Dashboard - Starting App" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Set working directory
Set-Location $PSScriptRoot

# Kill any existing node processes on port 3000
Write-Host "[1/3] Stopping any existing processes..." -ForegroundColor Yellow
$existing = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existing) {
    $existing | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "  Cleared port 3000" -ForegroundColor Green
} else {
    Write-Host "  Port 3000 is free" -ForegroundColor Green
}

# Check if node_modules exists
Write-Host "[2/3] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing npm packages..." -ForegroundColor Yellow
    npm install
    Write-Host "  Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  Dependencies OK" -ForegroundColor Green
}

# Start the server
Write-Host "[3/3] Starting server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Server starting on http://localhost:3000" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

node backend/server.js
