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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// =====================================================
// REST API Routes
// =====================================================

// Auth Routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const result = auth.login(username, password);
    
    if (result.success) {
        res.json(result);
    } else {
        res.status(401).json(result);
    }
});

app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    auth.logout(token);
    res.json({ success: true });
});

app.get('/api/auth/validate', auth.authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Load Routes
app.get('/api/loads', auth.authMiddleware, async (req, res) => {
    try {
        const loads = await dataIngestion.getAllLoadsWithState();
        res.json(loads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/loads/:id/control', auth.authMiddleware, async (req, res) => {
    try {
        const loadId = parseInt(req.params.id);
        const { action, autoMode } = req.body;
        
        // Get AI recommendation if available
        const aiRec = await aiService.getControlRecommendation(loadId, action);
        
        if (!aiRec.approved) {
            return res.json({
                success: false,
                blocked: true,
                reason: aiRec.reason,
                warnings: aiRec.warnings
            });
        }

        const isOn = action === 'on';
        await dataIngestion.updateLoadState(loadId, isOn, autoMode);
        
        // Log the control action
        await dataIngestion.logControlAction(
            loadId,
            action,
            'manual',
            `User ${action} via dashboard`,
            req.user.role
        );

        // Broadcast state change
        io.emit('loadStateChange', { loadId, isOn, autoMode });

        res.json({ 
            success: true, 
            loadId, 
            isOn, 
            autoMode,
            aiWarnings: aiRec.warnings 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/loads/:id/auto-mode', auth.authMiddleware, async (req, res) => {
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
app.get('/api/alerts', auth.authMiddleware, async (req, res) => {
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
        const response = await aiService.chat(message, username);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
app.post('/api/ai/control/toggle', auth.authMiddleware, async (req, res) => {
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

app.get('/api/ai/control/status', auth.authMiddleware, async (req, res) => {
    try {
        const status = aiService.getAIControlStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ai/control/trigger', auth.authMiddleware, async (req, res) => {
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
    
    // Initialize AI and connect Socket.IO for real-time alerts
    aiService.initializeAI();
    aiService.setSocketIO(io);
    
    // Start simulation and broadcast data
    simulator.startSimulation((data) => {
        io.emit('telemetryUpdate', data);
        
        // Check for new alerts and broadcast
        const newAlerts = data.flatMap(d => d.alerts || []);
        if (newAlerts.length > 0) {
            io.emit('newAlerts', newAlerts);
        }

        // Broadcast auto-control actions
        const autoActions = data.filter(d => d.autoAction);
        autoActions.forEach(a => {
            io.emit('autoControlAction', {
                loadId: a.loadId,
                name: a.name,
                action: a.autoAction
            });
        });
    });

    console.log('📊 Simulation started');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 Demo Credentials:');
    console.log('   User:  demo / demo123');
    console.log('   Admin: admin / admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    simulator.stopSimulation();
    server.close();
    process.exit(0);
});
