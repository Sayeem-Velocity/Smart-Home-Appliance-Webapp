/**
 * Data Ingestion Layer
 * Abstracted to support both simulated and real hardware data
 * 
 * FUTURE: To switch from simulation to real hardware:
 * 1. Set DATA_SOURCE='mqtt' or 'serial' in .env
 * 2. Configure MQTT_BROKER or SERIAL_PORT
 * 3. The rest of the system remains unchanged
 */

const pool = require('../database/db');

// Data source configuration
const DATA_SOURCE = process.env.DATA_SOURCE || 'simulation';

/**
 * Ingest telemetry data from any source
 * This is the single entry point for all telemetry data
 */
async function ingestTelemetry(loadId, data, source = DATA_SOURCE) {
    const { voltage, current, power, energy, cost, temperature } = data;
    
    const query = `
        INSERT INTO telemetry (load_id, voltage, current, power, energy, cost, temperature, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `;
    
    const result = await pool.query(query, [
        loadId, voltage, current, power, energy, cost, temperature || null, source
    ]);
    
    return result.rows[0];
}

/**
 * Get latest telemetry for a load
 */
async function getLatestTelemetry(loadId) {
    const query = `
        SELECT * FROM telemetry 
        WHERE load_id = $1 
        ORDER BY timestamp DESC 
        LIMIT 1
    `;
    const result = await pool.query(query, [loadId]);
    return result.rows[0];
}

/**
 * Get telemetry history for charts
 */
async function getTelemetryHistory(loadId, minutes = 60) {
    const query = `
        SELECT * FROM telemetry 
        WHERE load_id = $1 
        AND timestamp > NOW() - INTERVAL '${minutes} minutes'
        ORDER BY timestamp ASC
    `;
    const result = await pool.query(query, [loadId]);
    return result.rows;
}

/**
 * Get all loads with current state
 */
async function getAllLoadsWithState() {
    const query = `
        SELECT 
            l.*,
            ls.is_on,
            ls.auto_mode,
            ls.last_updated
        FROM loads l
        LEFT JOIN load_states ls ON l.id = ls.load_id
        ORDER BY l.id
    `;
    const result = await pool.query(query);
    return result.rows;
}

/**
 * Update load state
 */
async function updateLoadState(loadId, isOn, autoMode = null) {
    let query, params;
    
    if (autoMode !== null) {
        query = `
            UPDATE load_states 
            SET is_on = $2, auto_mode = $3, last_updated = NOW()
            WHERE load_id = $1
            RETURNING *
        `;
        params = [loadId, isOn, autoMode];
    } else {
        query = `
            UPDATE load_states 
            SET is_on = $2, last_updated = NOW()
            WHERE load_id = $1
            RETURNING *
        `;
        params = [loadId, isOn];
    }
    
    const result = await pool.query(query, params);
    return result.rows[0];
}

/**
 * Get thresholds for a load
 */
async function getThresholds(loadId) {
    const query = `SELECT * FROM thresholds WHERE load_id = $1`;
    const result = await pool.query(query, [loadId]);
    return result.rows;
}

/**
 * Log control action
 */
async function logControlAction(loadId, action, source, reason, userType) {
    const query = `
        INSERT INTO control_logs (load_id, action, source, reason, user_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `;
    const result = await pool.query(query, [loadId, action, source, reason, userType]);
    return result.rows[0];
}

/**
 * Create alert
 */
async function createAlert(loadId, alertType, metric, message, value, thresholdValue) {
    const query = `
        INSERT INTO alerts (load_id, alert_type, metric, message, value, threshold_value)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `;
    const result = await pool.query(query, [loadId, alertType, metric, message, value, thresholdValue]);
    return result.rows[0];
}

/**
 * Get recent alerts
 */
async function getRecentAlerts(limit = 50) {
    const query = `
        SELECT a.*, l.name as load_name 
        FROM alerts a
        JOIN loads l ON a.load_id = l.id
        ORDER BY a.created_at DESC 
        LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
}

/**
 * Log AI event
 */
async function logAIEvent(eventType, loadId, inputData, aiResponse, confidence, actionTaken, userQuery) {
    const query = `
        INSERT INTO ai_events (event_type, load_id, input_data, ai_response, confidence, action_taken, user_query)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;
    const result = await pool.query(query, [
        eventType, loadId, JSON.stringify(inputData), aiResponse, confidence, actionTaken, userQuery
    ]);
    return result.rows[0];
}

/**
 * Get energy summary
 */
async function getEnergySummary(loadId, days = 7) {
    const query = `
        SELECT * FROM energy_summary 
        WHERE load_id = $1 
        AND date > CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date DESC
    `;
    const result = await pool.query(query, [loadId]);
    return result.rows;
}

/**
 * Update or create daily energy summary
 */
async function updateEnergySummary(loadId, energy, cost, power) {
    const query = `
        INSERT INTO energy_summary (load_id, date, total_energy, total_cost, peak_power, avg_power)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $4)
        ON CONFLICT (load_id, date) 
        DO UPDATE SET 
            total_energy = energy_summary.total_energy + $2,
            total_cost = energy_summary.total_cost + $3,
            peak_power = GREATEST(energy_summary.peak_power, $4),
            avg_power = (energy_summary.avg_power + $4) / 2
        RETURNING *
    `;
    const result = await pool.query(query, [loadId, energy, cost, power]);
    return result.rows[0];
}

module.exports = {
    ingestTelemetry,
    getLatestTelemetry,
    getTelemetryHistory,
    getAllLoadsWithState,
    updateLoadState,
    getThresholds,
    logControlAction,
    createAlert,
    getRecentAlerts,
    logAIEvent,
    getEnergySummary,
    updateEnergySummary,
    DATA_SOURCE
};
