# React Dashboard - Quick Start Guide

## 🚀 Your Professional White-Blue Gradient Dashboard is Ready!

### Servers Running:
- **Backend Server**: http://localhost:3000
- **React Frontend**: http://localhost:5174
- **MQTT Broker**: Port 1883

### 🎯 What's Been Built:

#### Unified Single-Page Dashboard with 4 Tabs:

1. **AC Loads Tab** 
   - Simulated AC load monitoring and control
   - Real-time power/voltage/current metrics
   - ON/OFF controls with auto-mode toggle
   - Individual load cards with device-specific icons

2. **ESP32 Monitor Tab**
   - Real ESP32 hardware integration via MQTT
   - Dual load monitoring (100W & 8W bulbs)
   - DHT11 temperature & humidity sensor
   - Real-time Chart.js graphs (last 30 data points)
   - Relay control buttons (ON/OFF)
   - Power threshold configuration
   - Live status indicator

3. **AI Chat Tab**
   - AI Assistant powered by Gemini
   - Chat interface with message history
   - Daily energy summary
   - AI enable/disable toggle
   - Smart energy recommendations

4. **Alerts Panel Tab**
   - Real-time alert monitoring
   - Severity filtering (High/Medium/Low)
   - Acknowledge and delete functionality
   - Statistics dashboard
   - Auto-updates via Socket.IO

### 🎨 Design Features:
- ✅ White-blue gradient backgrounds
- ✅ Glass morphism effects
- ✅ Smooth animations (slide-in, fade-in, pulse-glow)
- ✅ Professional color scheme
- ✅ Responsive layout (mobile-friendly)
- ✅ Modern lucide-react icons
- ✅ Tailwind CSS 4.0 styling

### 🔗 Tech Stack:
**Frontend:**
- React 19.2.0
- Vite 6.0
- Tailwind CSS 4.0
- Chart.js 4.4.1 + react-chartjs-2
- Socket.IO Client 4.7.2
- Lucide React icons

**Backend:**
- Node.js + Express
- Aedes MQTT Broker (port 1883)
- PostgreSQL database
- Socket.IO for real-time updates

### 📡 MQTT Integration:
**Topics:**
- `esp32/load1/data` - Load 1 telemetry (100W bulb)
- `esp32/load2/data` - Load 2 telemetry (8W bulb)
- `esp32/dht11/data` - Temperature & humidity
- `esp32/relay1/control` - Relay 1 commands
- `esp32/relay2/control` - Relay 2 commands
- `esp32/threshold/update` - Power threshold updates

### 🔐 Login Credentials:
- **User**: demo / demo123
- **Admin**: admin / admin123

### 📂 Project Structure:
```
frontend-react/
├── src/
│   ├── App.jsx                    # Main app with auth routing
│   ├── index.css                  # Tailwind + custom styles
│   └── components/
│       ├── Login.jsx              # White-blue gradient login
│       ├── Dashboard.jsx          # Unified dashboard with tabs
│       ├── LoadCard.jsx           # AC load control cards
│       ├── ESP32Monitor.jsx       # Real ESP32 hardware monitoring
│       ├── AIChat.jsx             # AI chatbot interface
│       └── AlertsPanel.jsx        # Alerts management
├── vite.config.js                 # Vite config with proxy
└── package.json                   # Dependencies
```

### ✅ All Features Working:
- [x] Real-time data updates via Socket.IO
- [x] MQTT broker for ESP32 communication
- [x] Database storage (PostgreSQL)
- [x] Load control (simulated + hardware)
- [x] ESP32 hardware monitoring with charts
- [x] AI chatbot integration
- [x] Alert system with notifications
- [x] Authentication & authorization
- [x] Professional white-blue gradient UI
- [x] Single unified dashboard (no separate pages)
- [x] Mobile-responsive design

### 🔧 Next Steps:

1. **Connect ESP32 Hardware:**
   - Upload `ESP32_MQTT_LoadMonitor.ino` to your ESP32
   - Update WiFi credentials in Arduino code
   - Set MQTT server IP to your computer's IP
   - Monitor real-time data in ESP32 tab

2. **Customize Thresholds:**
   - Go to ESP32 Monitor tab
   - Adjust power thresholds for each load
   - Click "Update" to push to hardware

3. **Test AI Chat:**
   - Enable AI in the AI Chat tab
   - Ask about energy usage patterns
   - Get daily summaries and recommendations

4. **Monitor Alerts:**
   - Check Alerts tab for notifications
   - Filter by severity
   - Acknowledge or delete alerts

### 🌐 Access Your Dashboard:
**Open in browser:** http://localhost:5174

Login with demo/demo123 and explore all four tabs!

### 📝 Notes:
- All features consolidated in ONE dashboard interface (no separate pages)
- Real-time updates automatically refresh via Socket.IO
- Charts update with last 30 data points
- ESP32 status shows "online" when hardware connects via MQTT
- AI chat history persists in database
- Alerts auto-refresh when new alerts arrive

---

**🎉 Your professional React dashboard is complete and running!**
