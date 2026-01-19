# Smart Load Dashboard

A local, responsive web dashboard for monitoring and controlling electrical loads (DC Fan, AC Bulb, AC Heater) with AI-powered insights using Gemini API.

![Dashboard Preview](docs/preview.png)

## Features

### Frontend
- Demo sign-in (hardcoded credentials)
- Real-time gauges (voltage, current, power)
- Energy & cost tracking
- Historical trend charts
- Load status indicators
- Virtual on/off switches
- Auto-mode control
- Responsive design
- WebSocket real-time updates

### Backend
- Express.js REST API
- Socket.io WebSocket
- Simulated telemetry generation
- Threshold-based auto-control
- PostgreSQL data storage
- Gemini AI integration

### AI Features (Gemini)
- Chatbot for system queries
- Anomaly detection
- Control recommendations
- Pattern analysis
- AI event logging

---

## Quick Start

### Prerequisites

- **Node.js** v16 or higher
- **PostgreSQL** v12 or higher
- **Gemini API Key** (optional, for AI features)

### 1. Clone & Install

```bash
cd "Dashboard UI with AI"
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
copy .env.example .env
```

Edit `.env` with your settings:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smart_load_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Server Configuration
PORT=3000

# Gemini AI (optional)
GEMINI_API_KEY=your_gemini_api_key_here

# Simulation
SIMULATION_INTERVAL_MS=2000
```

### 3. Setup PostgreSQL Database

Create the database:

```sql
-- Run in pgAdmin or psql
CREATE DATABASE smart_load_db;
```

Initialize tables and seed data:

```bash
npm run db:init
```

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 5. Open Dashboard

Visit: **http://localhost:3000**

---

## Demo Credentials

| Username | Password | Role |
|----------|----------|------|
| demo | demo123 | User |
| admin | admin123 | Admin |

---

## Project Structure

```
Dashboard UI with AI/
├── backend/
│   ├── server.js          # Main Express server
│   ├── auth.js            # Demo authentication
│   ├── dataIngestion.js   # Database abstraction layer
│   ├── simulator.js       # Telemetry simulation
│   └── aiService.js       # Gemini AI integration
├── database/
│   ├── schema.sql         # PostgreSQL schema
│   ├── init.js            # Database initialization
│   └── db.js              # Connection pool
├── frontend/
│   ├── index.html         # Main dashboard HTML
│   ├── css/
│   │   └── styles.css     # All styles
│   └── js/
│       └── app.js         # Frontend application
├── .env.example           # Environment template
├── package.json           # Dependencies
└── README.md              # This file
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with credentials |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/validate` | Validate session |

### Loads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loads` | Get all loads with states |
| POST | `/api/loads/:id/control` | Turn load on/off |
| POST | `/api/loads/:id/auto-mode` | Toggle auto-mode |

### Telemetry
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/telemetry/:loadId` | Get latest telemetry |
| GET | `/api/telemetry/:loadId/history` | Get telemetry history |

### Alerts & Energy
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | Get recent alerts |
| GET | `/api/energy/:loadId` | Get energy summary |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | Chat with AI assistant |
| GET | `/api/ai/summary` | Get daily AI summary |

---

## WebSocket Events

### Server → Client
| Event | Description |
|-------|-------------|
| `telemetryUpdate` | Real-time telemetry data |
| `newAlerts` | New alert notifications |
| `loadStateChange` | Load state changed |
| `autoControlAction` | Auto-control triggered |

### Client → Server
| Event | Description |
|-------|-------------|
| `authenticate` | Authenticate WebSocket |

---

## Database Schema

### Main Tables

- **loads** - Electrical load definitions
- **load_states** - Current on/off state and auto-mode
- **telemetry** - Time-series sensor data
- **thresholds** - Alert and auto-control thresholds
- **alerts** - System alerts
- **control_logs** - Control action history
- **ai_events** - AI interactions log
- **energy_summary** - Daily energy aggregates

---

## Gemini AI Setup

1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add to `.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. Restart server

### AI Capabilities

- **Chatbot**: Ask about energy usage, costs, device status
- **Anomaly Detection**: Automatic unusual pattern detection
- **Control Recommendations**: AI-assisted load control decisions
- **Safety Guards**: AI blocks unsafe operations

---

## Future Hardware Integration

The system is designed for easy transition from simulated to real hardware data.

### To Connect ESP32/Arduino:

1. **MQTT Integration** (Recommended)
   ```javascript
   // In backend/dataIngestion.js
   // Add MQTT client subscription
   // Call ingestTelemetry() with source='esp32'
   ```

2. **Serial Communication**
   ```javascript
   // Add SerialPort library
   // Parse incoming sensor data
   // Call ingestTelemetry() with source='arduino'
   ```

### Data Format Expected

```json
{
  "loadId": 1,
  "voltage": 12.5,
  "current": 1.8,
  "power": 22.5,
  "temperature": 35.2
}
```

### Key Abstraction Points

| File | Function | Purpose |
|------|----------|---------|
| `dataIngestion.js` | `ingestTelemetry()` | Single entry for all data |
| `simulator.js` | `startSimulation()` | Replace with MQTT/Serial |
| `schema.sql` | `telemetry.source` | Tracks data origin |

---

## Customization

### Add New Load Type

1. Insert into `loads` table
2. Add thresholds in `thresholds` table
3. Add icon mapping in `frontend/js/app.js`
4. Update simulator if needed

### Modify Thresholds

```sql
UPDATE thresholds 
SET max_value = 15, warning_max = 13 
WHERE load_id = 1 AND metric = 'voltage';
```

### Change Electricity Rate

Edit in `backend/simulator.js`:
```javascript
const ELECTRICITY_RATE = 0.12; // $/kWh
```

---

## Troubleshooting

### Database Connection Failed
- Ensure PostgreSQL is running
- Check credentials in `.env`
- Verify database exists

### WebSocket Not Connecting
- Check if server is running
- Verify port is not blocked
- Check browser console for errors

### AI Not Responding
- Verify `GEMINI_API_KEY` is set
- Check API key validity
- Review server logs for errors

---

## License

MIT License - Feel free to use and modify.

---

## Support

For issues or questions, check the code comments or create an issue in the repository.
