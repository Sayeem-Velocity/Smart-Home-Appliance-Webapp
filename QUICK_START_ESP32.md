# 🚀 Quick Start Guide - ESP32 Load Monitoring System

## ✅ System is Ready!

Your Smart Home Dashboard is now integrated with ESP32 MQTT support. Here's how to get started:

---

## 🎯 What You Have Now

### ✨ Backend (Server)
- ✅ MQTT Broker running on port **1883**
- ✅ REST API for ESP32 control
- ✅ PostgreSQL database with ESP32 tables
- ✅ Real-time updates via Socket.IO
- ✅ Server running on **http://localhost:3000**

### ✨ Frontend (Dashboard)
- ✅ Main Dashboard: `http://localhost:3000`
- ✅ ESP32 Monitor: `http://localhost:3000/esp32-monitor.html`
- ✅ Real-time charts for voltage, current, power
- ✅ Manual and automatic relay control
- ✅ DHT11 temperature/humidity display

### ✨ Arduino Code
- ✅ Complete ESP32 code with MQTT: `ESP32_MQTT_LoadMonitor.ino`
- ✅ WiFi connectivity
- ✅ MQTT publish/subscribe
- ✅ Relay control with threshold logic

---

## 📋 Next Steps

### Step 1: Configure Arduino Code

1. Open `ESP32_MQTT_LoadMonitor.ino` in Arduino IDE

2. Update WiFi credentials:
```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";         // Your WiFi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Your WiFi password
```

3. Update MQTT server IP (your computer's IP):
```cpp
const char* MQTT_SERVER = "192.168.1.100";  // Replace with your PC's IP
```

**To find your PC's IP:**
- Windows: Run `ipconfig` in Command Prompt
- Look for "IPv4 Address"

### Step 2: Install Arduino Libraries

In Arduino IDE, go to **Tools → Manage Libraries** and install:
- ✅ **PubSubClient** by Nick O'Leary
- ✅ **DHT sensor library** by Adafruit  
- ✅ **ArduinoJson** by Benoit Blanchon

### Step 3: Upload to ESP32

1. Connect ESP32 to computer via USB
2. Select **Board**: ESP32 Dev Module
3. Select **Port**: Your ESP32's COM port
4. Click **Upload**
5. Open **Serial Monitor** (115200 baud)

### Step 4: Verify Connection

In Serial Monitor, you should see:
```
✅ WiFi connected!
IP Address: 192.168.x.x
🔄 Attempting MQTT connection... connected!
✅ Subscribed to control topics
📤 Data published to MQTT
```

### Step 5: Access Dashboard

1. Open browser: `http://localhost:3000/esp32-monitor.html`
2. Login: **demo** / **demo123**
3. You should see:
   - Real-time voltage, current, power readings
   - Temperature and humidity from DHT11
   - Relay status indicators
   - Live charts updating every 2 seconds

---

## 🎮 Dashboard Features

### 📊 Monitor Tab
- **Load 1 (100W Bulb)**: Voltage, Current, Power, Relay Status
- **Load 2 (8W Bulb)**: Voltage, Current, Power, Relay Status
- **DHT11 Sensor**: Temperature, Humidity
- **Live Charts**: Real-time data visualization

### 🎛️ Control Features

**Manual Control:**
- Turn relays ON/OFF with buttons
- Immediate response via MQTT

**Auto Mode:**
- Toggle auto control on/off
- ESP32 controls relays based on power thresholds
- Default thresholds: Load 1 = 120W, Load 2 = 15W

**Threshold Configuration:**
- Set custom power thresholds
- Updates sent to ESP32 via MQTT
- ESP32 uses these for auto control logic

### 📈 Statistics
- 24-hour average power
- Peak power readings
- Total data points collected

---

## 🧪 Testing the System

### Test 1: Check Data Flow
1. Power on your AC loads
2. Watch Serial Monitor for measurements
3. Check dashboard for real-time updates
4. Verify charts are updating

### Test 2: Manual Control
1. Click "Turn ON" for Load 1
2. Serial Monitor should show: "Relay 1 set to: ON"
3. Physical relay should activate
4. Dashboard should show relay status as ON

### Test 3: Threshold Control
1. Set Load 1 threshold to 50W
2. Click "Update"
3. If load power < 50W, relay turns ON
4. If load power > 50W, relay turns OFF

### Test 4: Auto Mode
1. Enable Auto Mode for Load 1
2. Vary the load (turn bulb on/off manually)
3. Relay should automatically control based on threshold
4. Dashboard updates in real-time

---

## 📡 MQTT Message Flow

### ESP32 → Server (Published):
```
esp32/load1/data     → {"voltage": 220.5, "current": 0.45, "power": 99.2, "relay_state": true}
esp32/load2/data     → {"voltage": 220.1, "current": 0.03, "power": 6.6, "relay_state": false}
esp32/dht11/data     → {"temperature": 28.5, "humidity": 65.0}
```

### Server → ESP32 (Subscribed):
```
esp32/relay1/control    → {"relay_state": true}   // Turn ON
esp32/relay2/control    → {"relay_state": false}  // Turn OFF
esp32/threshold/update  → {"load_number": 1, "power_threshold": 120.0}
```

---

## 🔍 Monitoring & Debugging

### Check ESP32 Status
- Serial Monitor shows all measurements and MQTT activity
- Look for "📤 Data published to MQTT" every 2 seconds

### Check Server Status
- Terminal shows MQTT client connections
- Look for "📱 MQTT Client connected: ESP32_LoadMonitor"
- Data saving messages: "📊 Load 1 data saved: V=220.5V, I=0.450A..."

### Check Dashboard Status
- Top banner shows connection status
- "MQTT Broker: Connected"
- "ESP32 Device: Online"
- "Last Update: [timestamp]"

### Browser Console (F12)
- Check for Socket.IO connection
- Look for real-time update events
- Verify API responses

---

## 📂 Project Structure

```
Dashboard UI with AI/
├── backend/
│   ├── server.js           ← Main server with MQTT integration
│   ├── mqttService.js      ← MQTT broker & message handling
│   ├── esp32Routes.js      ← ESP32 API endpoints
│   └── ...
├── database/
│   ├── schema.sql          ← Database schema with ESP32 tables
│   └── ...
├── frontend/
│   ├── esp32-monitor.html  ← ESP32 monitoring dashboard
│   ├── css/
│   │   └── esp32-monitor.css
│   └── js/
│       └── esp32-monitor.js
├── ESP32_MQTT_LoadMonitor.ino  ← Arduino code for ESP32
├── ESP32_INTEGRATION_GUIDE.md  ← Detailed integration guide
└── README.md
```

---

## ⚠️ Common Issues

### ESP32 won't connect to WiFi
- ✅ Double-check SSID and password
- ✅ Ensure ESP32 is within WiFi range
- ✅ Try restarting ESP32

### MQTT connection fails
- ✅ Verify server IP is correct
- ✅ Check server is running (`node backend/server.js`)
- ✅ Ensure both devices on same network
- ✅ Check Windows Firewall (allow port 1883)

### No data in dashboard
- ✅ Login to dashboard first
- ✅ Check ESP32 Serial Monitor for publish messages
- ✅ Refresh browser page
- ✅ Check browser console for errors (F12)

### Relay not responding
- ✅ Verify relay wiring (active LOW)
- ✅ Check relay power supply
- ✅ Test with manual Serial commands first

---

## 🎓 Learning Resources

### MQTT Basics
- MQTT is a lightweight pub/sub messaging protocol
- Perfect for IoT device communication
- QoS levels ensure message delivery

### ESP32 Features
- Built-in WiFi and Bluetooth
- Multiple ADC channels for sensors
- Powerful dual-core processor

### Real-time Dashboard
- Socket.IO for live updates
- Chart.js for data visualization
- RESTful API for control

---

## 🚀 Advanced Features (Optional)

### Add More Sensors
- Modify Arduino code to add sensors
- Create new MQTT topics
- Update dashboard UI

### Data Analytics
- Export data from database
- Create custom charts and reports
- Set up alerting system

### Security Enhancements
- Add MQTT authentication
- Enable SSL/TLS encryption
- Implement user roles

### Mobile App
- Use MQTT client libraries
- Connect to same broker
- Display data on mobile

---

## 📞 Support

### Files to Check:
1. **ESP32 Serial Monitor** - Hardware & MQTT status
2. **Server Terminal** - Backend logs & errors
3. **Browser Console (F12)** - Frontend errors
4. **Database** - Data storage verification

### Useful Commands:
```powershell
# Check server status
node backend/server.js

# Initialize/reset database
node database/init.js

# View MQTT traffic (if needed)
npm install -g mqtt
mqtt sub -t 'esp32/#' -h localhost
```

---

## 🎉 Success Criteria

You've successfully integrated everything when:

- ✅ ESP32 connects to WiFi and MQTT broker
- ✅ Data appears in Serial Monitor every 2 seconds
- ✅ Dashboard shows real-time updates
- ✅ Charts are updating with live data
- ✅ Manual relay control works from dashboard
- ✅ Auto mode controls relays based on thresholds
- ✅ Temperature and humidity display correctly
- ✅ Data is saved to database

---

## 🎊 Congratulations!

You now have a complete IoT monitoring and control system with:
- Real-time data acquisition
- Remote control capabilities
- Data logging and visualization
- Automated threshold-based control
- Professional web dashboard

**Happy Monitoring! ⚡📊🎯**

---

**Need Help?** Check the detailed guide: `ESP32_INTEGRATION_GUIDE.md`
