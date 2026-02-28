# AI Dashboard Capabilities a

## Overview

The AI service monitors and controls two loads connected via ESP32 in real time.

---

## Loads

| Load | Device | Type |
|------|--------|------|
| Load 1 | AC Heater | Heater |
| Load 2 | AC Fan | Fan |

---

## What the AI Can Do

### 1. Real-Time Monitoring
- Reads live voltage, current, and power for both loads every 10 seconds from the database.
- Reads temperature and humidity from the DHT11 sensor.
- Tracks today's energy consumption (kWh) and estimated cost per load.

### 2. Automated Anomaly Detection
Runs every 15 seconds when AI Control Mode is enabled. Automatically turns off a load if:
- Power exceeds 90% of today's recorded peak power for that load.
- Voltage exceeds 95% of today's recorded peak voltage for that load.
- AC Heater power exceeds 450W (fixed threshold).
- AC Fan power exceeds 300W (fixed threshold).
- Total system power exceeds 2000W (system overload).

### 3. AI Chat Assistant
Responds to natural language questions about:
- Current power consumption and device status.
- Today's energy usage and cost breakdown.
- Temperature and humidity readings.
- Energy-saving tips based on live data.
- Usage pattern analysis and monthly cost predictions.

### 4. Autonomous AI Decision (Trigger on Demand)
When triggered, the AI analyzes all device states and decides to turn loads on or off based on:
- Time of day (turns off fan during night hours 11pm-6am).
- Total power consumption (reduces load when usage is high).
- Safety thresholds (turns off heater if power exceeds 450W, fan if power exceeds 300W).

### 5. Rule-Based Fallback Decisions (No API Required)
If the AI API is unavailable, the system applies built-in rules:
- Turns off AC Heater if power exceeds 450W.
- Turns off AC Fan if power exceeds 300W.
- Turns off AC Fan during late night hours (11pm-6am).

### 6. Control Recommendations
Before any manual load toggle, the AI checks:
- Whether total power is already too high to add another load.
- Whether the heater is being turned on during night hours (10pm-6am).

### 7. Power Thresholds (Auto-Off)
Each load has a configurable power threshold stored in the database. If a load exceeds its threshold and auto mode is enabled, the relay is switched off automatically.

| Load | Default Threshold |
|------|------------------|
| AC Heater | 450W |
| AC Fan | 300W |

---

## AI Providers

The service supports two AI providers with automatic fallback:

1. **Gemini 2.5 Flash** (primary)
2. **Cerebras** (fallback, model configurable via `CEREBRAS_MODEL` env variable)

If both are unavailable, a rule-based fallback handles all responses and decisions.

---

## Real-Time Alerts

When AI Control Mode is active and an anomaly is detected, an alert is broadcast via Socket.IO to the dashboard immediately, including the device name, anomaly type, severity, and the action taken.
