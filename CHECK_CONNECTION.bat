@echo off
color 0A
echo ========================================
echo  ESP32 MQTT CONNECTION CHECKER
echo ========================================
echo.

echo [1/4] Checking if server is running...
timeout /t 1 >nul
netstat -an | findstr ":3000" >nul
if %errorLevel% == 0 (
    echo     ✓ Web server running on port 3000
) else (
    echo     ✗ Web server NOT running - Run: npm start
)

echo.
echo [2/4] Checking if MQTT broker is running...
timeout /t 1 >nul
netstat -an | findstr ":1883" >nul
if %errorLevel% == 0 (
    echo     ✓ MQTT broker running on port 1883
) else (
    echo     ✗ MQTT broker NOT running - Run: npm start
)

echo.
echo [3/4] Your PC IP addresses:
timeout /t 1 >nul
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    echo     → %%a
)

echo.
echo [4/4] Firewall check for port 1883:
timeout /t 1 >nul
netsh advfirewall firewall show rule name="MQTT Broker Port 1883" >nul 2>&1
if %errorLevel% == 0 (
    echo     ✓ Firewall rule exists
) else (
    echo     ✗ Firewall rule missing!
    echo     → Run FIX_FIREWALL.bat as Administrator
)

echo.
echo ========================================
echo  NEXT STEPS:
echo ========================================
echo.
echo 1. If any checks failed above, fix them first
echo 2. Make sure ESP32 WiFi SSID matches your network
echo 3. Update MQTT_BROKER IP in Arduino code if needed
echo 4. Upload Arduino code to ESP32
echo 5. Open Serial Monitor (115200 baud)
echo 6. Watch for "WiFi connected" and "MQTT Connected"
echo 7. Open dashboard: http://localhost:3000
echo.
pause
