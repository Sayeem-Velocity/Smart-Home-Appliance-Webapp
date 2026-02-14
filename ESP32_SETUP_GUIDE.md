# ESP32 Setup Guide - Auto Data Upload to Dashboard

## 📋 Overview
After uploading the Arduino code to your ESP32 and connecting the hardware, the data will **automatically** upload to the dashboard in real-time via MQTT.

## 🔧 Hardware Setup

### Required Components:
1. **ESP32 Board**
2. **2x ZMPT101B Voltage Sensors** (for AC voltage measurement)
3. **2x ACS712 Current Sensors** (for AC current measurement)
4. **DHT11 Temperature & Humidity Sensor**
5. **2x Relay Modules** (for load control)
6. **2x AC Loads** (100W bulb and 8W bulb)
7. **Breadboard and jumper wires**

### Pin Connections:

#### Load 1 (100W Bulb):
- ZMPT101B (Voltage Sensor) → GPIO 34
- ACS712 (Current Sensor) → GPIO 35
- Relay → GPIO 16

#### Load 2 (8W Bulb):
- ZMPT101B (Voltage Sensor) → GPIO 32
- ACS712 (Current Sensor) → GPIO 33
- Relay → GPIO 17

#### DHT11 Sensor:
- Data Pin → GPIO 4
- VCC → 3.3V
- GND → GND

## 📱 Software Setup

### 1. Arduino IDE Configuration
```
1. Open Arduino IDE
2. Install ESP32 board support:
   - File → Preferences → Additional Board Manager URLs
   - Add: https://dl.espressif.com/dl/package_esp32_index.json
   
3. Install Libraries:
   - Sketch → Include Library → Manage Libraries
   - Install: "PubSubClient" (for MQTT)
   - Install: "DHT sensor library"
   - Install: "ArduinoJson"
```

### 2. Update Arduino Code
Open the ESP32 Arduino code and update these values:

```cpp
// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Broker (your PC's IP address where server is running)
const char* mqtt_server = "192.168.1.100";  // Change to your PC's IP
const int mqtt_port = 1883;
```

**To find your PC's IP address:**
- Windows: Open CMD and type `ipconfig`
- Look for "IPv4 Address" (e.g., 192.168.1.100)

### 3. Upload Code to ESP32
```
1. Connect ESP32 to PC via USB
2. Select: Tools → Board → ESP32 Dev Module
3. Select: Tools → Port → COM_X (your ESP32 port)
4. Click: Upload button (→)
5. Wait for "Done uploading" message
```

## 🚀 How It Works Automatically

### Data Flow:
```
ESP32 Sensors → WiFi → MQTT Broker → PostgreSQL Database → Socket.IO → Dashboard
```

### Step-by-Step Automatic Process:

1. **ESP32 Connects to WiFi**
   - ESP32 boots up
   - Connects to your WiFi network
   - You'll see "WiFi connected" in Serial Monitor

2. **ESP32 Connects to MQTT Broker**
   - Connects to MQTT broker at `mqtt_server:1883`
   - Subscribes to control topics
   - You'll see "MQTT connected" in Serial Monitor

3. **Sensor Data Collection (Every 2 seconds)**
   - Reads voltage, current, power from Load 1
   - Reads voltage, current, power from Load 2
   - Reads temperature and humidity from DHT11

4. **Data Publishing via MQTT**
   - Publishes Load 1 data to topic: `esp32/load1/data`
   - Publishes Load 2 data to topic: `esp32/load2/data`
   - Publishes DHT11 data to topic: `esp32/dht11/data`

5. **Server Receives & Saves Data**
   - MQTT broker receives messages
   - Server saves to PostgreSQL database:
     - `esp32_load_data` table
     - `esp32_dht11_data` table

6. **Real-time Dashboard Update**
   - Server broadcasts via Socket.IO
   - Dashboard receives updates
   - **Gauges automatically update**
   - **Temperature/Humidity automatically update**
   - **No manual refresh needed!**

## 📊 What You'll See on Dashboard

### Electrical Loads Section:
- **Load 1 - 100W AC Bulb Card**
  - ⚡ Voltage gauge (circular, real-time)
  - ⚡ Current gauge (circular, real-time)
  - ⚡ Power gauge (circular, real-time)
  - 🔘 Turn On/Off buttons

- **Load 2 - 8W AC Bulb Card**
  - ⚡ Voltage gauge (circular, real-time)
  - ⚡ Current gauge (circular, real-time)
  - ⚡ Power gauge (circular, real-time)
  - 🔘 Turn On/Off buttons

### Environment Sensor Section:
- 🌡️ Temperature (°C)
- 💧 Humidity (%)
- 🕐 Last Update timestamp

## 🔍 Troubleshooting

### Serial Monitor Output:
Open Serial Monitor (Tools → Serial Monitor) at 115200 baud to see:

```
Connecting to WiFi...
WiFi connected
IP address: 192.168.1.105
Connecting to MQTT...
MQTT connected
Publishing Load 1: V=230.5, I=0.435, P=100.2, Relay=1
Publishing Load 2: V=230.1, I=0.035, P=8.1, Relay=0
Publishing DHT11: Temp=25.3°C, Humidity=60.2%
```

### Common Issues:

1. **No data on dashboard:**
   - Check ESP32 Serial Monitor - is it connected to MQTT?
   - Check PC IP address is correct in Arduino code
   - Ensure server is running (should show "MQTT Broker running")
   - Check WiFi connection

2. **MQTT connection failed:**
   - Verify MQTT broker IP address
   - Ensure port 1883 is not blocked by firewall
   - Check if server is running

3. **Sensor readings are 0:**
   - Check sensor connections
   - Verify pin numbers in Arduino code
   - Test sensors individually

## ✅ Quick Start Checklist

- [ ] Hardware connected correctly
- [ ] Arduino libraries installed
- [ ] WiFi credentials updated in code
- [ ] MQTT broker IP updated in code
- [ ] Code uploaded to ESP32
- [ ] Server running (localhost:3000)
- [ ] Dashboard opened in browser
- [ ] Logged in to dashboard
- [ ] Serial Monitor shows "MQTT connected"
- [ ] Data appearing on dashboard

## 🎯 Expected Behavior

Once everything is set up:
- **ESP32 will automatically read sensors every 2 seconds**
- **Data will automatically publish to MQTT**
- **Server will automatically save to database**
- **Dashboard will automatically update gauges**
- **You can control relays from dashboard**
- **No manual intervention needed!**

## 📝 Notes

- Data is stored in PostgreSQL database forever
- Dashboard shows real-time data from ESP32
- Historical data can be viewed in charts
- Relay control is bidirectional (ESP32 ↔ Dashboard)
- All happens automatically in the background!

---

**That's it!** Upload the code, connect the hardware, and watch the dashboard come alive with real-time data! 🎉
