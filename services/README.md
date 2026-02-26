# Dashboard AI Agent

A Python-based AI agent service for the Smart Load Monitoring Dashboard, inspired by the ResearchBuddy architecture.

## Features

- ** Intelligent Chat**: Context-aware conversations about your electrical loads
- ** Intent Detection**: Automatic classification of user questions (status, alerts, energy, etc.)
- ** Anomaly Detection**: AI-powered analysis of telemetry data
- ** Control Recommendations**: Safety-aware suggestions for load operations
- ** Energy Insights**: Detailed consumption analysis and cost estimates
- ** Smart Tips**: Contextual energy-saving recommendations

## Project Structure

```
services/
├── api/
│ ├── endpoints/
│ │ ├── chat.py # Chat endpoints
│ │ ├── analysis.py # Anomaly & load analysis
│ │ └── insights.py # Energy insights
│ └── router.py # Main API router
├── core/
│ ├── config.py # Settings & configuration
│ ├── database.py # PostgreSQL connection
│ └── rate_limiter.py # Rate limiting
├── llm/
│ ├── gemini_service.py # Gemini AI integration
│ └── ai_agent.py # Intent detection agent
├── models/
│ ├── chat.py # Chat models
│ └── analysis.py # Analysis models
├── main.py # FastAPI application
├── requirements.txt # Python dependencies
├── .env.example # Environment template
├── setup.bat / setup.sh # Setup scripts
└── run.bat / run.sh # Run scripts
```

## Quick Start

### 1. Setup

**Windows:**
```bash
cd services
setup.bat
```

**Linux/Mac:**
```bash
cd services
chmod +x setup.sh
./setup.sh
```

### 2. Configure

Edit `.env` file and add your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

Get a free API key from: https://aistudio.google.com/app/apikey

### 3. Run

**Windows:**
```bash
run.bat
```

**Linux/Mac:**
```bash
./run.sh
```

### 4. Access

- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## API Endpoints

### Chat
- `POST /api/v1/chat/` - Send a message to the AI assistant
- `GET /api/v1/chat/history/{session_id}` - Get chat history
- `DELETE /api/v1/chat/history/{session_id}` - Clear chat history
- `POST /api/v1/chat/quick-insights` - Get quick dashboard insights
- `GET /api/v1/chat/rate-limit` - Check rate limit status

### Analysis
- `POST /api/v1/analysis/anomaly` - Analyze telemetry for anomalies
- `POST /api/v1/analysis/control-recommendation` - Get control action recommendation
- `GET /api/v1/analysis/load/{load_id}` - Get detailed load analysis
- `GET /api/v1/analysis/system-health` - Get overall system health

### Insights
- `GET /api/v1/insights/energy` - Get energy usage insights
- `GET /api/v1/insights/daily-summary` - Get daily summary
- `GET /api/v1/insights/comparison` - Compare energy periods
- `GET /api/v1/insights/recommendations` - Get personalized recommendations
- `GET /api/v1/insights/stats` - Get usage statistics

## Example Usage

### Chat with the AI

```bash
curl -X POST "http://localhost:8000/api/v1/chat/" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the current status of the DC Fan?"}'
```

Response:
```json
{
  "message_id": "abc123",
  "response": "## Current DC Fan Status\n\nThe DC Fan is currently **ON** and consuming **45W** of power...",
  "intent": "status",
  "entities": {"load_name": ["fan"]},
  "ai_enabled": true
}
```

### Get Anomaly Analysis

```bash
curl -X POST "http://localhost:8000/api/v1/analysis/anomaly" \
  -H "Content-Type: application/json" \
  -d '{"telemetry_data": {"load_id": 1, "power": 55, "voltage": 12}}'
```

### Get Control Recommendation

```bash
curl -X POST "http://localhost:8000/api/v1/analysis/control-recommendation" \
  -H "Content-Type: application/json" \
  -d '{"load_id": 1, "action": "on"}'
```

## Integration with Node.js Backend

The AI service can work alongside your existing Node.js backend:

1. **Proxy Setup**: Configure your Node.js backend to forward AI requests to port 8000
2. **Direct Access**: Call the Python API directly from your frontend
3. **Hybrid**: Use the Node.js backend for data and Python for AI features

### Example Node.js Integration

```javascript
// In your Node.js backend
const axios = require('axios');

async function chatWithAI(message, context) {
  const response = await axios.post('http://localhost:8000/api/v1/chat/', {
    message: message,
    include_context: true
  });
  return response.data;
}
```

## Intent Detection

The AI agent automatically classifies user questions into categories:

| Intent | Keywords | Example |
|--------|----------|---------|
| `status` | status, state, running | "What's the fan status?" |
| `alerts` | alert, warning, problem | "Are there any alerts?" |
| `energy` | power, consumption, kwh | "How much energy today?" |
| `cost` | cost, bill, savings | "What's my electricity cost?" |
| `control` | turn on, switch off | "Should I turn on the heater?" |
| `anomaly` | unusual, spike, strange | "Any unusual readings?" |
| `safety` | safe, dangerous, hazard | "Is it safe to run?" |

## Rate Limiting

Default limits:
- **Chat**: 100 requests/day per user
- **Analysis**: 50 requests/day per user

Limits reset daily at midnight UTC.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | Required |
| `PORT` | Server port | 8000 |
| `HOST` | Server host | 0.0.0.0 |
| `DEBUG` | Debug mode | false |
| `CORS_ORIGINS` | Allowed origins | * |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_NAME` | Database name | smart_load_db |

## Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=services
```

## License

MIT License - Feel free to use and modify!
