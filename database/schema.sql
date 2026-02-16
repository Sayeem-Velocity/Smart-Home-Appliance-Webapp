-- =====================================================
-- Smart Load Dashboard - PostgreSQL Schema
-- Designed for time-series data and future ESP32/Arduino integration
-- =====================================================

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS ai_events CASCADE;
DROP TABLE IF EXISTS control_logs CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS telemetry CASCADE;
DROP TABLE IF EXISTS load_states CASCADE;
DROP TABLE IF EXISTS thresholds CASCADE;
DROP TABLE IF EXISTS loads CASCADE;
DROP TABLE IF EXISTS energy_summary CASCADE;

-- =====================================================
-- LOADS TABLE - Define electrical loads
-- =====================================================
CREATE TABLE loads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,           -- 'DC' or 'AC'
    device_type VARCHAR(50) NOT NULL,    -- 'fan', 'bulb', 'heater'
    description TEXT,
    max_voltage DECIMAL(10,2),
    max_current DECIMAL(10,2),
    max_power DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LOAD_STATES TABLE - Current state of each load
-- =====================================================
CREATE TABLE load_states (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
    is_on BOOLEAN DEFAULT FALSE,
    auto_mode BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(load_id)
);

-- =====================================================
-- THRESHOLDS TABLE - Alert and control thresholds
-- =====================================================
CREATE TABLE thresholds (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,         -- 'voltage', 'current', 'power', 'temperature'
    min_value DECIMAL(10,2),
    max_value DECIMAL(10,2),
    warning_min DECIMAL(10,2),
    warning_max DECIMAL(10,2),
    auto_off_threshold DECIMAL(10,2),    -- Auto turn off when exceeded
    auto_on_threshold DECIMAL(10,2),     -- Auto turn on when below
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TELEMETRY TABLE - Time-series sensor data
-- Designed to accept both simulated and real ESP32/Arduino data
-- =====================================================
CREATE TABLE telemetry (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
    voltage DECIMAL(10,3),
    current DECIMAL(10,3),
    power DECIMAL(10,3),
    energy DECIMAL(10,3),               -- Cumulative kWh
    cost DECIMAL(10,4),                 -- Cost based on rate
    temperature DECIMAL(10,2),          -- Optional: device temperature
    source VARCHAR(50) DEFAULT 'simulation',  -- 'simulation', 'esp32', 'arduino'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster time-based queries
CREATE INDEX idx_telemetry_timestamp ON telemetry(timestamp DESC);
CREATE INDEX idx_telemetry_load_timestamp ON telemetry(load_id, timestamp DESC);

-- =====================================================
-- ENERGY_SUMMARY TABLE - Aggregated energy data
-- =====================================================
CREATE TABLE energy_summary (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_energy DECIMAL(10,3) DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,
    peak_power DECIMAL(10,3) DEFAULT 0,
    avg_power DECIMAL(10,3) DEFAULT 0,
    on_duration_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(load_id, date)
);

-- =====================================================
-- ALERTS TABLE - System alerts and warnings
-- =====================================================
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,    -- 'warning', 'critical', 'info'
    metric VARCHAR(50),
    message TEXT NOT NULL,
    value DECIMAL(10,3),
    threshold_value DECIMAL(10,3),
    is_acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_created ON alerts(created_at DESC);

-- =====================================================
-- CONTROL_LOGS TABLE - Track all control actions
-- =====================================================
CREATE TABLE control_logs (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,        -- 'on', 'off', 'auto_on', 'auto_off'
    source VARCHAR(50) NOT NULL,        -- 'manual', 'auto', 'ai', 'schedule'
    reason TEXT,
    user_type VARCHAR(50),              -- 'user', 'admin', 'system'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_control_logs_created ON control_logs(created_at DESC);

-- =====================================================
-- AI_EVENTS TABLE - AI analysis and decisions
-- =====================================================
CREATE TABLE ai_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,    -- 'anomaly', 'prediction', 'recommendation', 'chat'
    load_id INTEGER REFERENCES loads(id) ON DELETE SET NULL,
    input_data JSONB,                   -- Context sent to AI
    ai_response TEXT,                   -- AI's response
    confidence DECIMAL(5,2),            -- Confidence score if applicable
    action_taken VARCHAR(100),          -- What action was taken based on AI
    user_query TEXT,                    -- For chatbot queries
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_events_created ON ai_events(created_at DESC);
CREATE INDEX idx_ai_events_type ON ai_events(event_type);

-- =====================================================
-- ESP32 LOAD MONITORING TABLES
-- =====================================================

-- ESP32 Load Data - Real-time measurements from ESP32
CREATE TABLE esp32_load_data (
    id SERIAL PRIMARY KEY,
    load_number INTEGER NOT NULL,       -- 1 or 2 (Load-1: AC Bulb/Heater, Load-2: AC Fan)
    voltage DECIMAL(10,3),
    current DECIMAL(10,4),
    power DECIMAL(10,3),
    relay_state BOOLEAN,                -- TRUE = ON, FALSE = OFF
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_esp32_load_timestamp ON esp32_load_data(load_number, timestamp DESC);

-- ESP32 DHT11 Sensor Data - Temperature and Humidity
-- Used for temperature-based control: temp >= 30°C → Fan ON, temp < 30°C → Bulb/Heater ON
CREATE TABLE esp32_dht11_data (
    id SERIAL PRIMARY KEY,
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_esp32_dht11_timestamp ON esp32_dht11_data(timestamp DESC);

-- ESP32 Relay Control - Relay states and thresholds
CREATE TABLE esp32_relay_config (
    id SERIAL PRIMARY KEY,
    load_number INTEGER NOT NULL UNIQUE,
    power_threshold DECIMAL(10,2),      -- Power threshold for auto control
    relay_state BOOLEAN DEFAULT FALSE,  -- Current relay state
    auto_mode BOOLEAN DEFAULT TRUE,     -- Auto control enabled
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize with default values for both loads
INSERT INTO esp32_relay_config (load_number, power_threshold, relay_state, auto_mode) 
VALUES 
    (1, 200.0, FALSE, TRUE),  -- Load 1: AC Bulb/Heater, threshold 200W
    (2, 120.0, FALSE, TRUE)   -- Load 2: AC Fan, threshold 120W
ON CONFLICT (load_number) DO NOTHING;

-- =====================================================
-- VIEWS for common queries
-- =====================================================

-- Latest telemetry for each load
CREATE OR REPLACE VIEW latest_telemetry AS
SELECT DISTINCT ON (load_id)
    t.*,
    l.name as load_name,
    l.type as load_type,
    l.device_type
FROM telemetry t
JOIN loads l ON t.load_id = l.id
ORDER BY load_id, timestamp DESC;

-- Dashboard summary view
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT 
    l.id as load_id,
    l.name,
    l.type,
    l.device_type,
    ls.is_on,
    ls.auto_mode,
    lt.voltage,
    lt.current,
    lt.power,
    lt.energy,
    lt.cost,
    lt.timestamp as last_reading
FROM loads l
LEFT JOIN load_states ls ON l.id = ls.load_id
LEFT JOIN latest_telemetry lt ON l.id = lt.load_id;

-- Latest ESP32 data view
CREATE OR REPLACE VIEW latest_esp32_data AS
SELECT 
    l1.load_number,
    l1.voltage,
    l1.current,
    l1.power,
    l1.relay_state,
    l1.timestamp,
    rc.power_threshold,
    rc.auto_mode
FROM (
    SELECT DISTINCT ON (load_number)
        load_number,
        voltage,
        current,
        power,
        relay_state,
        timestamp
    FROM esp32_load_data
    ORDER BY load_number, timestamp DESC
) l1
LEFT JOIN esp32_relay_config rc ON l1.load_number = rc.load_number;
