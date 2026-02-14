# Smart Home Dashboard - Quick Start Commands
# Copy and paste these commands in PowerShell to run the app

# ============================================
# OPTION 1: Run Everything (Recommended)
# ============================================
# Kill any existing Node processes and start server
taskkill /F /IM node.exe 2>$null; Start-Sleep -Seconds 1; cd "D:\chatbots\Dashboard UI with AI"; node backend/server.js

# ============================================
# OPTION 2: Kill Port 3000 Only
# ============================================
# Use this if you need to free port 3000
$p = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force; Write-Host "Killed process on port 3000" } else { Write-Host "Port 3000 is free" }

# ============================================
# OPTION 3: Start Server (Clean)
# ============================================
# Start server without killing processes
cd "D:\chatbots\Dashboard UI with AI"; node backend/server.js

# ============================================
# OPTION 4: Initialize Database
# ============================================
# Run this to setup database tables
cd "D:\chatbots\Dashboard UI with AI"; node database/init.js

# ============================================
# OPTION 5: Install Dependencies
# ============================================
# Run this if you need to install npm packages
cd "D:\chatbots\Dashboard UI with AI"; npm install

# ============================================
# OPTION 6: Background Mode (Run in Background)
# ============================================
# Start server in background (won't block terminal)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\chatbots\Dashboard UI with AI'; node backend/server.js"

# ============================================
# After running, open browser to:
# http://localhost:3000
# ============================================
# Login: demo / demo123  OR  admin / admin123
# ============================================
