/************************************************************
 * ESP32 API Routes
 * Endpoints for ESP32 load monitoring, control, and data
 ************************************************************/

const express = require('express');
const router = express.Router();
const mqttService = require('./mqttService');
const { query } = require('../database/db');

/**
 * GET /api/esp32/status
 * Get current status of all ESP32 loads and sensors
 */
router.get('/status', async (req, res) => {
  try {
    const data = await mqttService.getLatestData();
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error getting ESP32 status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ESP32 status'
    });
  }
});

/**
 * GET /api/esp32/load/:loadNumber/history
 * Get historical data for specific load
 */
router.get('/load/:loadNumber/history', async (req, res) => {
  try {
    const loadNumber = parseInt(req.params.loadNumber);
    const hours = parseInt(req.query.hours) || 24;

    if (loadNumber !== 1 && loadNumber !== 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid load number. Must be 1 or 2'
      });
    }

    const data = await mqttService.getHistoricalData(loadNumber, hours);
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error getting historical data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get historical data'
    });
  }
});

/**
 * GET /api/esp32/dht11/history
 * Get historical DHT11 sensor data
 */
router.get('/dht11/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    
    const result = await query(`
      SELECT temperature, humidity, timestamp
      FROM esp32_dht11_data
      WHERE timestamp >= NOW() - INTERVAL '${hours} hours'
      ORDER BY timestamp ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error getting DHT11 history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get DHT11 history'
    });
  }
});

/**
 * POST /api/esp32/relay/:loadNumber/control
 * Control relay state (ON/OFF)
 */
router.post('/relay/:loadNumber/control', async (req, res) => {
  try {
    const loadNumber = parseInt(req.params.loadNumber);
    const { state } = req.body;

    if (loadNumber !== 1 && loadNumber !== 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid load number. Must be 1 or 2'
      });
    }

    if (typeof state !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'State must be a boolean (true/false)'
      });
    }

    // Publish control command via MQTT
    mqttService.publishRelayControl(loadNumber, state);

    // Update database
    await query(`
      UPDATE esp32_relay_config
      SET relay_state = $1, updated_at = CURRENT_TIMESTAMP
      WHERE load_number = $2
    `, [state, loadNumber]);

    res.json({
      success: true,
      message: `Relay ${loadNumber} set to ${state ? 'ON' : 'OFF'}`,
      data: {
        load_number: loadNumber,
        relay_state: state
      }
    });
  } catch (error) {
    console.error('❌ Error controlling relay:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to control relay'
    });
  }
});

/**
 * PUT /api/esp32/relay/:loadNumber/config
 * Update relay configuration (threshold, auto mode)
 */
router.put('/relay/:loadNumber/config', async (req, res) => {
  try {
    const loadNumber = parseInt(req.params.loadNumber);
    const { auto_mode } = req.body;

    if (loadNumber !== 1 && loadNumber !== 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid load number. Must be 1 or 2'
      });
    }

    await mqttService.updateRelayConfig(loadNumber, {
      auto_mode
    });

    res.json({
      success: true,
      message: `Relay ${loadNumber} configuration updated`,
      data: {
        load_number: loadNumber,
        auto_mode
      }
    });
  } catch (error) {
    console.error('❌ Error updating relay config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update relay configuration'
    });
  }
});

/**
 * GET /api/esp32/relay/:loadNumber/config
 * Get relay configuration
 */
router.get('/relay/:loadNumber/config', async (req, res) => {
  try {
    const loadNumber = parseInt(req.params.loadNumber);

    if (loadNumber !== 1 && loadNumber !== 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid load number. Must be 1 or 2'
      });
    }

    const result = await query(`
      SELECT * FROM esp32_relay_config
      WHERE load_number = $1
    `, [loadNumber]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Relay configuration not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error getting relay config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get relay configuration'
    });
  }
});

/**
 * GET /api/esp32/stats
 * Get statistics for ESP32 loads
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        load_number,
        COUNT(*) as total_readings,
        AVG(voltage) as avg_voltage,
        AVG(current) as avg_current,
        AVG(power) as avg_power,
        MAX(power) as max_power,
        MIN(timestamp) as first_reading,
        MAX(timestamp) as last_reading
      FROM esp32_load_data
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      GROUP BY load_number
      ORDER BY load_number
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error getting ESP32 stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

/**
 * DELETE /api/esp32/data/clear
 * Clear old data (admin only)
 */
router.delete('/data/clear', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    await query(`
      DELETE FROM esp32_load_data
      WHERE timestamp < NOW() - INTERVAL '${days} days'
    `);

    await query(`
      DELETE FROM esp32_dht11_data
      WHERE timestamp < NOW() - INTERVAL '${days} days'
    `);

    res.json({
      success: true,
      message: `Cleared data older than ${days} days`
    });
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear data'
    });
  }
});

module.exports = router;
