/************************************************************
 * MQTT Service for ESP32 AC Load Monitoring
 * Handles MQTT broker, pub/sub, and database integration
 ************************************************************/

const aedes = require('aedes')();
const net = require('net');
const pool = require('../database/db');

class MQTTService {
  constructor() {
    this.broker = null;
    this.server = null;
    this.port = 1883;
    this.io = null; // Socket.IO instance for real-time updates
    
    // MQTT Topics
    this.topics = {
      // New ESP32 topics (heater/fan)
      HEATER_DATA: 'esp32/heater/data',
      FAN_DATA: 'esp32/fan/data',
      DHT_DATA: 'esp32/dht/data',
      // Legacy topics (load1/load2) for backwards compatibility
      LOAD1_DATA: 'esp32/load1/data',
      LOAD2_DATA: 'esp32/load2/data',
      DHT11_DATA: 'esp32/dht11/data',
      RELAY1_CONTROL: 'esp32/relay1/control',
      RELAY2_CONTROL: 'esp32/relay2/control',
      RELAY1_STATUS: 'esp32/relay1/status',
      RELAY2_STATUS: 'esp32/relay2/status'
    };
  }

  /**
   * Initialize MQTT broker and set up event handlers
   */
  async init(socketIO) {
    this.io = socketIO;

    // Create MQTT broker server
    this.server = net.createServer(aedes.handle);
    
    return new Promise((resolve, reject) => {
      // Listen on 0.0.0.0 to accept connections from all network interfaces (including ESP32)
      this.server.listen(this.port, '0.0.0.0', (err) => {
        if (err) {
          console.error(' MQTT Broker failed to start:', err);
          reject(err);
        } else {
          console.log(` MQTT Broker running on 0.0.0.0:${this.port} (accessible from network)`);
          this.setupHandlers();
          resolve();
        }
      });
    });
  }

  /**
   * Set up MQTT event handlers
   */
  setupHandlers() {
    // Client connected
    aedes.on('client', (client) => {
      console.log(` MQTT Client connected: ${client.id}`);
      // Emit to Socket.IO clients
      if (this.io) {
        this.io.emit('mqtt:client_connected', { clientId: client.id });
        this.io.emit('mqtt:status', { connected: true, clientId: client.id });
      }
    });

    // Client disconnected
    aedes.on('clientDisconnect', (client) => {
      console.log(` MQTT Client disconnected: ${client.id}`);
      // Emit to Socket.IO clients
      if (this.io) {
        this.io.emit('mqtt:client_disconnected', { clientId: client.id });
        this.io.emit('mqtt:status', { connected: false, clientId: client.id });
      }
    });

    // Message published
    aedes.on('publish', async (packet, client) => {
      if (!client) return; // Ignore broker's own messages

      const topic = packet.topic;
      const payload = packet.payload.toString();

      try {
        // Handle different topics
        // Support both old (load1/load2) and new (heater/fan) topics
        if (topic === this.topics.LOAD1_DATA || topic === this.topics.HEATER_DATA) {
          await this.handleLoadData(1, payload);
        } else if (topic === this.topics.LOAD2_DATA || topic === this.topics.FAN_DATA) {
          await this.handleLoadData(2, payload);
        } else if (topic === this.topics.DHT11_DATA || topic === this.topics.DHT_DATA) {
          await this.handleDHT11Data(payload);
        } else if (topic === this.topics.RELAY1_STATUS) {
          await this.handleRelayStatus(1, payload);
        } else if (topic === this.topics.RELAY2_STATUS) {
          await this.handleRelayStatus(2, payload);
        }
      } catch (error) {
        console.error(` Error handling MQTT message on topic ${topic}:`, error);
      }
    });

    // Subscribe event
    aedes.on('subscribe', (subscriptions, client) => {
      console.log(` MQTT Client ${client.id} subscribed to:`, 
        subscriptions.map(s => s.topic).join(', '));
    });

    console.log(' MQTT handlers configured');
  }

  /**
   * Handle load data (voltage, current, power, relay state)
   */
  async handleLoadData(loadNumber, payload) {
    try {
      const data = JSON.parse(payload);
      const { voltage, current, power, relay_state } = data;

      // Insert into database
      await pool.query(`
        INSERT INTO esp32_load_data (load_number, voltage, current, power, relay_state)
        VALUES ($1, $2, $3, $4, $5)
      `, [loadNumber, voltage, current, power, relay_state]);

      // Emit real-time update via Socket.IO
      if (this.io) {
        this.io.emit('esp32:load_update', {
          load_number: loadNumber,
          voltage,
          current,
          power,
          relay_state,
          timestamp: new Date()
        });
      }

      console.log(` Load ${loadNumber} data saved: V=${voltage}V, I=${current}A, P=${power}W, Relay=${relay_state}`);
    } catch (error) {
      console.error(` Error handling Load ${loadNumber} data:`, error);
    }
  }

  /**
   * Handle DHT11 sensor data (temperature, humidity)
   */
  async handleDHT11Data(payload) {
    try {
      const data = JSON.parse(payload);
      const { temperature, humidity } = data;

      // Insert into database
      await pool.query(`
        INSERT INTO esp32_dht11_data (temperature, humidity)
        VALUES ($1, $2)
      `, [temperature, humidity]);

      // Emit real-time update via Socket.IO
      if (this.io) {
        this.io.emit('esp32:dht11_update', {
          temperature,
          humidity,
          timestamp: new Date()
        });
      }

      console.log(` DHT11 data saved: Temp=${temperature}°C, Humidity=${humidity}%`);
    } catch (error) {
      console.error(' Error handling DHT11 data:', error);
    }
  }

  /**
   * Handle relay status updates from ESP32
   */
  async handleRelayStatus(loadNumber, payload) {
    try {
      const data = JSON.parse(payload);
      const { relay_state } = data;

      // Update relay state in database
      await pool.query(`
        UPDATE esp32_relay_config 
        SET relay_state = $1, updated_at = CURRENT_TIMESTAMP
        WHERE load_number = $2
      `, [relay_state, loadNumber]);

      // Emit real-time update via Socket.IO
      if (this.io) {
        this.io.emit('esp32:relay_status', {
          load_number: loadNumber,
          relay_state,
          timestamp: new Date()
        });
      }

      console.log(` Relay ${loadNumber} status updated: ${relay_state ? 'ON' : 'OFF'}`);
    } catch (error) {
      console.error(` Error handling Relay ${loadNumber} status:`, error);
    }
  }

  /**
   * Publish relay control command to ESP32
   */
  publishRelayControl(loadNumber, state) {
    const topic = loadNumber === 1 ? this.topics.RELAY1_CONTROL : this.topics.RELAY2_CONTROL;
    const message = JSON.stringify({ relay_state: state });

    aedes.publish({
      topic: topic,
      payload: message,
      qos: 1,
      retain: false
    }, (err) => {
      if (err) {
        console.error(` Failed to publish relay control for Load ${loadNumber}:`, err);
      } else {
        console.log(` Published relay control: Load ${loadNumber} = ${state ? 'ON' : 'OFF'}`);
      }
    });
  }

  /**
   * Publish mode control command to ESP32 (auto/manual)
   */
  publishModeControl(mode) {
    const topic = 'esp32/mode/control';
    const message = JSON.stringify({ mode: mode });

    aedes.publish({
      topic: topic,
      payload: message,
      qos: 1,
      retain: false
    }, (err) => {
      if (err) {
        console.error(` Failed to publish mode control:`, err);
      } else {
        console.log(` Published mode control: ${mode}`);
      }
    });
  }

  /**
   * Publish mode control to ESP32 (auto/manual)
   */
  publishModeControl(mode) {
    const message = JSON.stringify({ mode: mode });

    aedes.publish({
      topic: 'esp32/mode/control',
      payload: message,
      qos: 1,
      retain: false
    }, (err) => {
      if (err) {
        console.error(` Failed to publish mode control:`, err);
      } else {
        console.log(` Published mode control: ${mode}`);
      }
    });
  }

  /**
   * Get latest ESP32 data from database
   */
  async getLatestData() {
    try {
      // Try to get latest data from database
      const load1Data = await pool.query(`
        SELECT voltage, current, power, relay_state, timestamp
        FROM esp32_load_data
        WHERE load_number = 1
        ORDER BY timestamp DESC
        LIMIT 1
      `);

      const load2Data = await pool.query(`
        SELECT voltage, current, power, relay_state, timestamp
        FROM esp32_load_data
        WHERE load_number = 2
        ORDER BY timestamp DESC
        LIMIT 1
      `);

      const dht11Data = await pool.query(`
        SELECT temperature, humidity, timestamp
        FROM esp32_dht11_data
        ORDER BY timestamp DESC
        LIMIT 1
      `);

      return {
        load1: load1Data.rows[0] || null,
        load2: load2Data.rows[0] || null,
        dht11: dht11Data.rows[0] || null
      };
    } catch (error) {
      console.error(' Error fetching latest ESP32 data:', error);
      // Return null data instead of throwing error
      return {
        load1: null,
        load2: null,
        dht11: null
      };
    }
  }

  /**
   * Get historical data for charts
   */
  async getHistoricalData(loadNumber, hours = 24) {
    try {
      const result = await pool.query(`
        SELECT 
          voltage,
          current,
          power,
          relay_state,
          timestamp
        FROM esp32_load_data
        WHERE load_number = $1
          AND timestamp >= NOW() - INTERVAL '${hours} hours'
        ORDER BY timestamp ASC
      `, [loadNumber]);

      return result.rows;
    } catch (error) {
      console.error(` Error fetching historical data for Load ${loadNumber}:`, error);
      throw error;
    }
  }

  /**
   * Update relay configuration
   */
  async updateRelayConfig(loadNumber, config) {
    try {
      const { auto_mode } = config;
      
      await pool.query(`
        UPDATE esp32_relay_config
        SET auto_mode = COALESCE($1, auto_mode),
            updated_at = CURRENT_TIMESTAMP
        WHERE load_number = $2
      `, [auto_mode, loadNumber]);

      return true;
    } catch (error) {
      console.error(` Error updating relay config for Load ${loadNumber}:`, error);
      throw error;
    }
  }

  /**
   * Shutdown MQTT broker
   */
  async shutdown() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log(' MQTT Broker shut down');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = new MQTTService();
