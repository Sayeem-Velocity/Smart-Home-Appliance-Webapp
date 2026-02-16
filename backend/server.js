/**
 * Main Server Entry Point
 * Express + Socket.io for REST APIs and WebSocket
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Import modules
const auth = require('./auth');
const dataIngestion = require('./dataIngestion');
const simulator = require('./simulator');
const aiService = require('./aiService');
const mqttService = require('./mqttService');
const esp32Routes = require('./esp32Routes');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ============================================
// ROOT REDIRECT
// ============================================

// Redirect root to login page - moved BEFORE static middleware to ensure priority
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// REST API Routes
// =====================================================

// Auth Routes
app.post('/api/auth/login', (req, res) => {
    console.log('📝 Login attempt:', req.body.username);
    const { username, password } = req.body;
    const result = auth.login(username, password);
    
    if (result.success) {
        console.log('✅ Login successful:', username);
        res.json(result);
    } else {
        console.log('❌ Login failed:', username);
        res.status(401).json(result);
    }
});

app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const success = auth.logout(token);
    console.log('🚪 Logout:', success ? 'Session cleared' : 'No session found');
    res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/validate', auth.authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        services: {
            mqtt: mqttService.isConnected ? 'connected' : 'disconnected',
            ai: aiService ? 'initialized' : 'not initialized'
        }
    });
});

// Load Routes
app.get('/api/loads', async (req, res) => {
    try {
        // Get ESP32 real-time data instead of simulated loads
        const esp32Data = await mqttService.getLatestData();
        
        // Always return 2 load cards (even if no data yet)
        const loads = [
            {
                id: 1,
                name: '100W AC Bulb',
                device_name: '100W AC Bulb',
                type: 'AC',
                device_type: 'bulb',
                is_on: esp32Data?.load1?.relay_state || false,
                auto_mode: false,
                voltage: esp32Data?.load1?.voltage || 0,
                current: esp32Data?.load1?.current || 0,
                current_power: esp32Data?.load1?.power || 0,
                rated_power: 100,
                energy_kwh: 0,
                cost_today: 0,
                state: (esp32Data?.load1?.relay_state) ? 'ON' : 'OFF'
            },
            {
                id: 2,
                name: '8W AC Bulb',
                device_name: '8W AC Bulb',
                type: 'AC',
                device_type: 'bulb',
                is_on: esp32Data?.load2?.relay_state || false,
                auto_mode: false,
                voltage: esp32Data?.load2?.voltage || 0,
                current: esp32Data?.load2?.current || 0,
                current_power: esp32Data?.load2?.power || 0,
                rated_power: 8,
                energy_kwh: 0,
                cost_today: 0,
                state: (esp32Data?.load2?.relay_state) ? 'ON' : 'OFF'
            }
        ];
        
        res.json(loads);
    } catch (error) {
        console.error('Error getting loads:', error);
        // Return empty load cards even on error
        res.json([
            {
                id: 1,
                name: '100W AC Bulb',
                device_name: '100W AC Bulb',
                type: 'AC',
                device_type: 'bulb',
                is_on: false,
                auto_mode: false,
                voltage: 0,
                current: 0,
                current_power: 0,
                rated_power: 100,
                energy_kwh: 0,
                cost_today: 0,
                state: 'OFF'
            },
            {
                id: 2,
                name: '8W AC Bulb',
                device_name: '8W AC Bulb',
                type: 'AC',
                device_type: 'bulb',
                is_on: false,
                auto_mode: false,
                voltage: 0,
                current: 0,
                current_power: 0,
                rated_power: 8,
                energy_kwh: 0,
                cost_today: 0,
                state: 'OFF'
            }
        ]);
    }
});

app.post('/api/loads/:id/control', async (req, res) => {
    try {
        const loadId = parseInt(req.params.id);
        const { state } = req.body;
        
        if (loadId !== 1 && loadId !== 2) {
            return res.status(400).json({ error: 'Invalid load ID. Must be 1 or 2' });
        }
        
        const isOn = state === 'ON';
        
        // Control ESP32 relay via MQTT
        mqttService.publishRelayControl(loadId, isOn);
        
        // Update database
        await require('../database/db').query(`
            UPDATE esp32_relay_config
            SET relay_state = $1, updated_at = CURRENT_TIMESTAMP
            WHERE load_number = $2
        `, [isOn, loadId]);
        
        res.json({
            success: true,
            loadId: loadId,
            state: state,
            message: `Load ${loadId} turned ${state}`
        });
    } catch (error) {
        console.error('Error controlling load:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/loads/:id/auto-mode', async (req, res) => {
    try {
        const loadId = parseInt(req.params.id);
        const { enabled } = req.body;
        
        const loads = await dataIngestion.getAllLoadsWithState();
        const load = loads.find(l => l.id === loadId);
        
        await dataIngestion.updateLoadState(loadId, load?.is_on || false, enabled);
        
        await dataIngestion.logControlAction(
            loadId,
            enabled ? 'auto_enabled' : 'auto_disabled',
            'manual',
            `Auto-mode ${enabled ? 'enabled' : 'disabled'}`,
            req.user.role
        );

        io.emit('loadStateChange', { loadId, autoMode: enabled });

        res.json({ success: true, loadId, autoMode: enabled });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Telemetry Routes
app.get('/api/telemetry/:loadId', auth.authMiddleware, async (req, res) => {
    try {
        const loadId = parseInt(req.params.loadId);
        const latest = await dataIngestion.getLatestTelemetry(loadId);
        res.json(latest || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/telemetry/:loadId/history', auth.authMiddleware, async (req, res) => {
    try {
        const loadId = parseInt(req.params.loadId);
        const minutes = parseInt(req.query.minutes) || 60;
        const history = await dataIngestion.getTelemetryHistory(loadId, minutes);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alerts Routes
app.get('/api/alerts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const alerts = await dataIngestion.getRecentAlerts(limit);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Energy Summary Routes
app.get('/api/energy/:loadId', auth.authMiddleware, async (req, res) => {
    try {
        const loadId = parseInt(req.params.loadId);
        const days = parseInt(req.query.days) || 7;
        const summary = await dataIngestion.getEnergySummary(loadId, days);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// AI Chat Route
app.post('/api/ai/chat', auth.authMiddleware, async (req, res) => {
    try {
        const { message } = req.body;
        const username = req.user.username; // Get username from auth
        
        console.log(`💬 Chat from ${username}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);         
        const response = await aiService.chat(message, username);
        res.json(response);
    } catch (error) {
        console.error('❌ Chat error:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            response: 'Sorry, I encountered an error. Please try again.'
        });
    }
});

// Get Chat History Route
app.get('/api/ai/chat/history', auth.authMiddleware, async (req, res) => {
    try {
        const username = req.user.username;
        const history = aiService.getChatHistory(username);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear Chat History Route
app.delete('/api/ai/chat/history', auth.authMiddleware, async (req, res) => {
    try {
        const username = req.user.username;
        const result = aiService.clearChatHistory(username);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// AI Summary Route
app.get('/api/ai/summary', auth.authMiddleware, async (req, res) => {
    try {
        const summary = await aiService.generateDailySummary();
        res.json({ summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// AI Autonomous Control Routes
app.post('/api/ai/control/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        const result = await aiService.setAIControlMode(enabled);
        
        // Broadcast to all clients
        io.emit('ai-control-mode-changed', { enabled: result.enabled });
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ai/control/status', async (req, res) => {
    try {
        const status = aiService.getAIControlStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ai/control/trigger', async (req, res) => {
    try {
        const result = await aiService.triggerAIDecision();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thresholds Routes
app.get('/api/thresholds/:loadId', auth.authMiddleware, async (req, res) => {
    try {
        const loadId = parseInt(req.params.loadId);
        const thresholds = await dataIngestion.getThresholds(loadId);
        res.json(thresholds);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ESP32 Threshold Update Route
app.post('/api/esp32/threshold', async (req, res) => {
    try {
        const { load_number, power_threshold } = req.body;
        
        if (!load_number || power_threshold === undefined) {
            return res.status(400).json({ error: 'Missing load_number or power_threshold' });
        }
        
        // Send threshold update to ESP32 via MQTT
        mqttService.publishThresholdUpdate(load_number, power_threshold);
        
        console.log(`⚙️ Threshold update sent: Load ${load_number} = ${power_threshold}W`);
        
        res.json({
            success: true,
            load_number: load_number,
            power_threshold: power_threshold,
            message: `Threshold updated for Load ${load_number}`
        });
    } catch (error) {
        console.error('Error updating threshold:', error);
        res.status(500).json({ error: error.message });
    }
});

// ESP32 Routes
app.use('/api/esp32', esp32Routes);

// =====================================================
// Database View Routes (for viewing stored data)
// =====================================================

const pool = require('../database/db');

// Get all database tables info
app.get('/api/database/tables', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        res.json(result.rows);
    } catch (error) {
        res.json({ 
            message: 'Database not configured or tables not created',
            tables: ['esp32_load_data', 'esp32_dht11_data', 'esp32_relay_config'],
            note: 'Data is being stored in memory and PostgreSQL'
        });
    }
});

// Get ESP32 Load data from database
app.get('/api/database/load/:loadNum', async (req, res) => {
    try {
        const loadNum = parseInt(req.params.loadNum);
        const limit = parseInt(req.query.limit) || 100;
        
        const result = await pool.query(`
            SELECT * FROM esp32_load_data 
            WHERE load_number = $1 
            ORDER BY timestamp DESC 
            LIMIT $2
        `, [loadNum, limit]);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message,
            message: 'Use in-memory data from dashboard'
        });
    }
});

// Get DHT11 data from database
app.get('/api/database/dht11', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        
        const result = await pool.query(`
            SELECT * FROM esp32_dht11_data 
            ORDER BY timestamp DESC 
            LIMIT $1
        `, [limit]);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message,
            message: 'Use in-memory data from dashboard'
        });
    }
});

// Get all recent telemetry
app.get('/api/database/telemetry', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        
        const result = await pool.query(`
            SELECT * FROM telemetry 
            ORDER BY timestamp DESC 
            LIMIT $1
        `, [limit]);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        // Return from ESP32 data tables as fallback
        try {
            const loadData = await pool.query(`
                SELECT timestamp, voltage, current, power, load_number as source
                FROM esp32_load_data 
                ORDER BY timestamp DESC 
                LIMIT $1
            `, [parseInt(req.query.limit) || 100]);
            
            res.json({
                success: true,
                count: loadData.rows.length,
                data: loadData.rows
            });
        } catch (e) {
            res.json({ 
                success: false, 
                error: e.message,
                message: 'View real-time data on dashboard'
            });
        }
    }
});

// Get database statistics
app.get('/api/database/stats', async (req, res) => {
    try {
        const stats = {};
        
        // Try to get counts from various tables
        try {
            const loadCount = await pool.query('SELECT COUNT(*) FROM esp32_load_data');
            stats.load_records = parseInt(loadCount.rows[0].count);
        } catch(e) { stats.load_records = 0; }
        
        try {
            const dhtCount = await pool.query('SELECT COUNT(*) FROM esp32_dht11_data');
            stats.dht11_records = parseInt(dhtCount.rows[0].count);
        } catch(e) { stats.dht11_records = 0; }
        
        try {
            const telemetryCount = await pool.query('SELECT COUNT(*) FROM telemetry');
            stats.telemetry_records = parseInt(telemetryCount.rows[0].count);
        } catch(e) { stats.telemetry_records = 0; }
        
        res.json({
            success: true,
            stats,
            database: 'PostgreSQL',
            host: process.env.DB_HOST || 'localhost',
            name: process.env.DB_NAME || 'smart_load_db'
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message,
            stats: { load_records: 0, dht11_records: 0, telemetry_records: 0 }
        });
    }
});

// =====================================================
// WebSocket Handlers
// =====================================================

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Validate token on connection
    socket.on('authenticate', (token) => {
        const session = auth.validateSession(token);
        if (session) {
            socket.user = session;
            socket.emit('authenticated', { success: true });
            console.log(`✅ Socket authenticated: ${session.username}`);
        } else {
            socket.emit('authenticated', { success: false });
        }
    });

    // Handle relay control from dashboard
    socket.on('esp32:relay_control', (data) => {
        console.log('🔌 Relay control received:', data);
        const loadNumber = data.load_id || data.loadId;
        const state = data.state;
        
        if (loadNumber && (loadNumber === 1 || loadNumber === 2)) {
            // Publish to MQTT
            mqttService.publishRelayControl(loadNumber, state);
            
            // Echo back to all clients for immediate UI update
            io.emit('esp32:relay_update', {
                load_id: loadNumber,
                state: state
            });
            
            console.log(`✅ Relay ${loadNumber} control sent: ${state ? 'ON' : 'OFF'}`);
        } else {
            console.log('❌ Invalid relay control data:', data);
        }
    });

    // Handle threshold update from dashboard - REMOVED (no more power thresholds)

    // Handle mode control from dashboard (Auto/Manual)
    socket.on('esp32:mode_control', (data) => {
        console.log('🎛️ Mode control received:', data);
        const mode = data.mode; // 'auto' or 'manual'
        
        if (mode === 'auto' || mode === 'manual') {
            // Publish mode change to ESP32 via MQTT
            mqttService.publishModeControl(mode);
            
            // Echo back to all clients
            io.emit('esp32:mode_changed', { mode: mode });
            
            console.log(`✅ Control mode changed to: ${mode}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// =====================================================
// Start Server & Simulation
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Initialize MQTT broker for ESP32 communication
    try {
        await mqttService.init(io);
        mqttService.io = io; // Set Socket.IO instance for real-time updates
    } catch (error) {
        console.error('⚠️  MQTT broker failed to start:', error.message);
    }
    
    // Initialize AI and connect Socket.IO for real-time alerts
    aiService.initializeAI();
    aiService.setSocketIO(io);
    
    // DISABLED SIMULATOR - Using real ESP32 MQTT data instead
    // simulator.startSimulation((data) => {
    //     io.emit('telemetryUpdate', data);
    //     ...
    // });

    console.log('📡 Waiting for ESP32 MQTT data...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 Demo Credentials:');
    console.log('   User:  demo / demo123');
    console.log('   Admin: admin / admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    // simulator.stopSimulation(); // Disabled
    await mqttService.shutdown();
    server.close();
    process.exit(0);
});
