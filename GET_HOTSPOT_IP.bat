@echo off
echo ========================================
echo Getting PC IP Address for ESP32
echo ========================================
echo.
ipconfig | findstr /i "IPv4 Wireless"
echo.
echo ========================================
echo Copy the IPv4 Address above and update
echo it in the Arduino code (MQTT_BROKER)
echo ========================================
pause
