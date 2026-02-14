@echo off
echo ========================================
echo  MQTT FIREWALL FIX - Run as Administrator
echo ========================================
echo.
echo This will allow MQTT port 1883 through Windows Firewall
echo.

net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with Administrator privileges...
    echo.
    echo Adding firewall rule...
    netsh advfirewall firewall add rule name="MQTT Broker Port 1883" dir=in action=allow protocol=TCP localport=1883
    echo.
    echo ========================================
    echo SUCCESS! MQTT port 1883 is now allowed.
    echo ========================================
    echo.
    echo Now upload the Arduino code to ESP32.
    echo ESP32 should connect successfully!
    echo.
) else (
    echo ERROR: This must be run as Administrator!
    echo.
    echo Please:
    echo 1. Right-click this file
    echo 2. Select "Run as administrator"
    echo.
)

pause
