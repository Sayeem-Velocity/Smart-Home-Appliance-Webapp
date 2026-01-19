/**
 * Simple AI Chatbot Service
 * Unlimited chat requests with per-user history
 * Real-time database integration for smart energy monitoring
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const dataIngestion = require('./dataIngestion');
const pool = require('../database/db');

// AI Configuration
let genAI = null;
let model = null;
let systemContext = null;
let lastContextUpdate = 0;
const CONTEXT_UPDATE_INTERVAL = 10000; // 10 seconds

// Socket.io reference
let ioRef = null;

// Background monitoring
let monitoringInterval = null;
let aiControlEnabled = false;

// ============================================================================
// DATABASE QUERIES - REAL-TIME DATA
// ============================================================================

async function getSystemContext() {
    try {
        // Get current loads with telemetry
        const loadsQuery = `
            SELECT 
                l.id, l.name, l.type, l.device_type, l.max_power,
                ls.is_on,
                lt.voltage, lt.current, lt.power, lt.energy, lt.cost
            FROM loads l
            LEFT JOIN load_states ls ON l.id = ls.load_id
            LEFT JOIN LATERAL (
                SELECT * FROM telemetry WHERE load_id = l.id ORDER BY timestamp DESC LIMIT 1
            ) lt ON true
            ORDER BY l.id
        `;
        const loads = await pool.query(loadsQuery);

        // Today's summary
        const summaryQuery = `
            SELECT 
                COALESCE(SUM(energy), 0)::numeric(10,4) as total_energy,
                COALESCE(SUM(cost), 0)::numeric(10,4) as total_cost,
                COALESCE(AVG(power), 0)::numeric(10,2) as avg_power
            FROM telemetry
            WHERE DATE(timestamp) = CURRENT_DATE
        `;
        const summary = await pool.query(summaryQuery);

        // Recent alerts
        const alertsQuery = `
            SELECT message, alert_type, created_at 
            FROM alerts 
            WHERE is_acknowledged = false 
            ORDER BY created_at DESC LIMIT 5
        `;
        const alerts = await pool.query(alertsQuery);

        const activeLoads = loads.rows.filter(l => l.is_on).length;
        const totalPower = loads.rows.reduce((sum, l) => sum + parseFloat(l.power || 0), 0);

        return {
            loads: loads.rows,
            summary: {
                totalLoads: loads.rows.length,
                activeLoads,
                totalPowerW: totalPower.toFixed(1),
                totalEnergyKWh: parseFloat(summary.rows[0]?.total_energy || 0).toFixed(4),
                totalCost: parseFloat(summary.rows[0]?.total_cost || 0).toFixed(4),
                avgPower: parseFloat(summary.rows[0]?.avg_power || 0).toFixed(1)
            },
            alerts: alerts.rows,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error getting system context:', error.message);
        return null;
    }
}

async function refreshContext() {
    const now = Date.now();
    if (!systemContext || (now - lastContextUpdate) > CONTEXT_UPDATE_INTERVAL) {
        systemContext = await getSystemContext();
        lastContextUpdate = now;
    }
    return systemContext;
}

// ============================================================================
// AI INITIALIZATION
// ============================================================================

function initializeAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        console.error('❌ GEMINI_API_KEY not configured in .env');
        return false;
    }

    try {
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp', // Only model available for this key
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 512
            },
            systemInstruction: `You are an AI assistant for a Smart Energy Monitoring Dashboard.
Your role:
- Help users understand their energy consumption
- Provide energy-saving tips and recommendations
- Answer questions about device status, power usage, and costs
- Alert users to potential issues
- Be concise, helpful, and use emojis for better readability

Always base your answers on the real-time data provided. Use specific numbers.
Format responses nicely with bullet points and emojis where appropriate.`
        });

        console.log('✅ AI Chatbot initialized (simple mode)');
        
        // Start background anomaly monitoring
        startBackgroundMonitoring();
        
        return true;
    } catch (error) {
        console.error('❌ AI initialization failed:', error.message);
        return false;
    }
}

// ============================================================================
// BACKGROUND ANOMALY MONITORING
// ============================================================================

async function startBackgroundMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    console.log('   🔄 Background anomaly monitoring started');
    
    // Check for anomalies every 15 seconds
    monitoringInterval = setInterval(async () => {
        if (!aiControlEnabled) return;
        
        try {
            const context = await refreshContext();
            if (!context) return;
            
            const anomalies = detectAnomalies(context);
            
            if (anomalies.length > 0 && aiControlEnabled) {
                console.log(`⚠️ Detected ${anomalies.length} anomalies - taking action`);
                await handleAnomalies(anomalies, context);
            }
        } catch (error) {
            console.error('Monitoring error:', error.message);
        }
    }, 15000);
}

function detectAnomalies(context) {
    const anomalies = [];
    
    context.loads.forEach(load => {
        const power = parseFloat(load.power || 0);
        const voltage = parseFloat(load.voltage || 0);
        const current = parseFloat(load.current || 0);
        
        // Anomaly: Power exceeds 90% of max
        if (load.is_on && power > load.max_power * 0.9) {
            anomalies.push({
                type: 'high_power',
                loadId: load.id,
                loadName: load.name,
                severity: 'critical',
                message: `${load.name} power (${power.toFixed(1)}W) near max (${load.max_power}W)`,
                action: 'turn_off'
            });
        }
        
        // Anomaly: Voltage too high
        if (voltage > load.max_voltage * 0.95) {
            anomalies.push({
                type: 'high_voltage',
                loadId: load.id,
                loadName: load.name,
                severity: 'critical',
                message: `${load.name} voltage (${voltage.toFixed(1)}V) unsafe`,
                action: 'turn_off'
            });
        }
        
        // Anomaly: Heater on too long with high power
        if (load.device_type === 'heater' && load.is_on && power > 800) {
            anomalies.push({
                type: 'excessive_heating',
                loadId: load.id,
                loadName: load.name,
                severity: 'warning',
                message: `${load.name} consuming high power (${power.toFixed(1)}W)`,
                action: 'turn_off'
            });
        }
    });
    
    // System-level anomaly: Total power too high
    const totalPower = parseFloat(context.summary.totalPowerW);
    if (totalPower > 2000) {
        anomalies.push({
            type: 'system_overload',
            severity: 'critical',
            message: `Total system power (${totalPower.toFixed(1)}W) exceeds safe limit`,
            action: 'reduce_load'
        });
    }
    
    return anomalies;
}

async function handleAnomalies(anomalies, context) {
    const actions = [];
    
    for (const anomaly of anomalies) {
        if (anomaly.loadId && anomaly.action === 'turn_off') {
            try {
                await dataIngestion.updateLoadState(anomaly.loadId, false, true);
                actions.push({
                    loadId: anomaly.loadId,
                    action: 'off',
                    reason: anomaly.message
                });
                
                // Emit alert via socket
                if (ioRef) {
                    ioRef.emit('ai-anomaly-action', {
                        type: anomaly.type,
                        severity: anomaly.severity,
                        loadName: anomaly.loadName,
                        message: anomaly.message,
                        action: 'Device turned OFF automatically',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error(`Failed to handle anomaly for load ${anomaly.loadId}:`, error.message);
            }
        }
    }
    
    return actions;
}

// ============================================================================
// SLEEP UTILITY
// ============================================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN CHAT FUNCTION
// ============================================================================

// Store chat history per user
const userChatHistories = new Map();

// Smart fallback for common queries
function getSmartFallback(query, context) {
    const q = query.toLowerCase();
    
    // Status queries
    if (q.includes('status') || q.includes('how') && (q.includes('device') || q.includes('load'))) {
        return `📊 **Current System Status:**

**Devices:**
${context.loads.map(l => `• ${l.name}: ${l.is_on ? '✅ ON' : '⭕ OFF'} - ${parseFloat(l.power || 0).toFixed(1)}W`).join('\n')}

**Summary:**
• Active: ${context.summary.activeLoads}/${context.summary.totalLoads} devices
• Power: ${context.summary.totalPowerW}W
• Energy Today: ${context.summary.totalEnergyKWh} kWh
• Cost Today: $${context.summary.totalCost}`;
    }
    
    // Power/energy queries
    if (q.includes('power') || q.includes('consumption') || q.includes('using')) {
        return `⚡ **Power Consumption:**

• **Total Power:** ${context.summary.totalPowerW}W
• **Today's Energy:** ${context.summary.totalEnergyKWh} kWh
• **Cost:** $${context.summary.totalCost}

**By Device:**
${context.loads.map(l => `• ${l.name}: ${parseFloat(l.power || 0).toFixed(1)}W`).join('\n')}`;
    }
    
    // Cost queries
    if (q.includes('cost') || q.includes('bill') || q.includes('money')) {
        return `💰 **Cost Information:**

• **Today's Cost:** $${context.summary.totalCost}
• **Today's Energy:** ${context.summary.totalEnergyKWh} kWh
• **Average Power:** ${context.summary.avgPower}W

**Breakdown:**
${context.loads.map(l => `• ${l.name}: $${parseFloat(l.cost || 0).toFixed(4)}`).join('\n')}`;
    }
    
    // Energy saving tips
    if (q.includes('save') || q.includes('reduce') || q.includes('tip')) {
        const tips = [];
        context.loads.forEach(load => {
            if (load.device_type === 'heater' && load.is_on && parseFloat(load.power || 0) > 700) {
                tips.push('• Turn off heater when not needed - saves ~$0.50/hour');
            }
            if (load.device_type === 'bulb' && load.is_on) {
                const hour = new Date().getHours();
                if (hour >= 9 && hour < 17) {
                    tips.push('• Use natural daylight instead of bulb - saves ~$0.05/hour');
                }
            }
        });
        
        if (parseFloat(context.summary.totalPowerW) > 1500) {
            tips.push('• Total power is high - turn off unused devices');
        }
        
        if (tips.length === 0) {
            tips.push('• Your energy usage looks good!');
            tips.push('• Keep devices off when not in use');
            tips.push('• Use natural light during daytime');
        }
        
        return `💡 **Energy Saving Tips:**\n\n${tips.join('\n')}`;
    }
    
    // Alerts
    if (q.includes('alert') || q.includes('warning') || q.includes('problem')) {
        if (context.alerts.length === 0) {
            return '✅ **No Active Alerts**\n\nYour system is running smoothly with no warnings or issues.';
        }
        return `⚠️ **Active Alerts (${context.alerts.length}):**\n\n${context.alerts.map(a => `• ${a.alert_type.toUpperCase()}: ${a.message}`).join('\n')}`;
    }
    
    return null;
}

async function chat(userQuery, username = 'guest') {
    try {
        // Get real-time context from database
        const context = await refreshContext();
        if (!context) {
            return { success: false, error: 'Unable to fetch system data' };
        }

        // Get or create user chat history
        if (!userChatHistories.has(username)) {
            userChatHistories.set(username, []);
        }
        const chatHistory = userChatHistories.get(username);

        // Check for common database queries (direct DB response - faster)
        const q = userQuery.toLowerCase();
        const isCommonQuery = 
            q.includes('status') || 
            q.includes('power') || 
            q.includes('cost') || 
            q.includes('alert') || 
            q.includes('tip') ||
            q.includes('device') ||
            q.includes('energy');

        // For common queries, get instant database response
        if (isCommonQuery) {
            const dbResponse = getSmartFallback(userQuery, context);
            if (dbResponse) {
                chatHistory.push({
                    query: userQuery,
                    response: dbResponse,
                    timestamp: new Date().toISOString()
                });
                console.log(`📊 Database response for: ${userQuery.substring(0, 30)}...`);
                return {
                    success: true,
                    response: dbResponse,
                    timestamp: context.timestamp,
                    dataSource: 'database'
                };
            }
        }

        // For all other questions, use Gemini AI
        if (!model) {
            return { 
                success: false, 
                error: 'AI service not configured. Please add GEMINI_API_KEY in .env file.' 
            };
        }

        // Build comprehensive prompt with ALL real-time database data
        let historyContext = '';
        if (chatHistory.length > 0) {
            const recentHistory = chatHistory.slice(-3);
            historyContext = '\n=== RECENT CONVERSATION ===\n' + 
                recentHistory.map(h => `User: ${h.query}\nAI: ${h.response}`).join('\n\n') + 
                '\n';
        }

        const prompt = `
=== REAL-TIME SYSTEM DATA FROM DATABASE ===
Time: ${context.timestamp}

DEVICE STATUS (From database table: loads, load_states, telemetry):
${context.loads.map(l => `
Device: ${l.name} (ID: ${l.id})
Type: ${l.device_type}
Status: ${l.is_on ? 'ON' : 'OFF'}
Current Power: ${parseFloat(l.power || 0).toFixed(1)}W
Current Voltage: ${parseFloat(l.voltage || 0).toFixed(1)}V
Current: ${parseFloat(l.current || 0).toFixed(2)}A
Energy Consumed: ${parseFloat(l.energy || 0).toFixed(4)} kWh
Cost: $${parseFloat(l.cost || 0).toFixed(4)}
`).join('\n')}

SYSTEM SUMMARY (Aggregated from database):
• Total Devices: ${context.summary.totalLoads}
• Active Devices: ${context.summary.activeLoads}
• Total Power Consumption: ${context.summary.totalPowerW}W
• Today's Total Energy: ${context.summary.totalEnergyKWh} kWh
• Today's Total Cost: $${context.summary.totalCost}
• Average Power: ${context.summary.avgPower}W

${context.alerts.length > 0 ? `ACTIVE ALERTS (From database table: alerts):\n${context.alerts.map(a => `• ${a.alert_type.toUpperCase()}: ${a.message} (Created: ${new Date(a.created_at).toLocaleString()})`).join('\n')}` : 'No active alerts in the system.'}
${historyContext}
=== USER QUESTION ===
${userQuery}

Analyze the REAL-TIME DATABASE DATA above and provide a detailed, data-driven answer. 
Use specific numbers from the data. Be helpful and conversational.
Format your response with emojis and bullet points for readability.
`;

        // Call Gemini API with real-time data
        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Save to chat history
        chatHistory.push({
            query: userQuery,
            response: response,
            timestamp: new Date().toISOString()
        });

        // Keep only last 20 messages
        if (chatHistory.length > 20) {
            chatHistory.shift();
        }

        console.log(`✅ Gemini AI response generated`);

        return {
            success: true,
            response,
            timestamp: context.timestamp,
            dataSource: 'gemini-ai'
        };

    } catch (error) {
        console.error('Chat error:', error.message);
        
        // Return error - let user know to check API key
        if (error.message.includes('429') || error.message.includes('quota')) {
            return { 
                success: false, 
                error: 'API quota exceeded. Please check your Gemini API key or try again later.' 
            };
        }
        
        if (error.message.includes('API_KEY') || error.message.includes('401') || error.message.includes('403')) {
            return { 
                success: false, 
                error: 'Invalid API key. Please update GEMINI_API_KEY in the .env file.' 
            };
        }
        
        return { 
            success: false, 
            error: 'Unable to process request: ' + error.message
        };
    }
}

// Get chat history for a user
function getChatHistory(username = 'guest') {
    return userChatHistories.get(username) || [];
}

// Clear chat history for a user
function clearChatHistory(username = 'guest') {
    userChatHistories.set(username, []);
    return { success: true };
}

// ============================================================================
// SIMPLE RECOMMENDATIONS (Rule-based, no API call)
// ============================================================================

async function getRecommendations() {
    const context = await refreshContext();
    if (!context) {
        return { success: false, error: 'Unable to fetch data' };
    }

    // Simple rule-based recommendations (no AI call needed)
    const recommendations = [];
    const totalPower = parseFloat(context.summary.totalPowerW);
    
    context.loads.forEach(load => {
        const power = parseFloat(load.power || 0);
        
        if (load.device_type === 'heater' && load.is_on && power > 800) {
            recommendations.push({
                device: load.name,
                tip: '🔥 Heater using high power. Consider lowering temperature.',
                savings: '~15% energy savings'
            });
        }
        
        if (load.device_type === 'bulb' && load.is_on) {
            const hour = new Date().getHours();
            if (hour >= 9 && hour < 17) {
                recommendations.push({
                    device: load.name,
                    tip: '💡 Light is on during daytime. Use natural light if possible.',
                    savings: '~5% energy savings'
                });
            }
        }
    });

    if (totalPower > 1500) {
        recommendations.push({
            device: 'System',
            tip: '⚡ High total power consumption. Turn off unused devices.',
            savings: '~20% energy savings'
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            device: 'System',
            tip: '✅ Energy usage looks good! Keep it up.',
            savings: 'Optimal'
        });
    }

    return {
        success: true,
        recommendations,
        summary: context.summary
    };
}

// ============================================================================
// SIMPLE AI CONTROL (Rule-based, no API call)
// ============================================================================

/**
 * Get control recommendation (rule-based, no API call)
 */
async function getControlRecommendation(loadId, action) {
    const context = await refreshContext();
    if (!context) {
        return { approved: true, warnings: [] };
    }

    const load = context.loads.find(l => l.id === loadId);
    if (!load) {
        return { approved: true, warnings: [] };
    }

    const warnings = [];
    
    // Check for high power usage
    if (action === 'on' && parseFloat(context.summary.totalPowerW) > 1500) {
        warnings.push('⚡ Total power usage is already high');
    }

    // Check heater safety
    if (load.device_type === 'heater' && action === 'on') {
        const hour = new Date().getHours();
        if (hour >= 22 || hour < 6) {
            warnings.push('🌙 Night mode - consider using lower settings');
        }
    }

    return {
        approved: true,
        reason: 'Action allowed',
        warnings
    };
}

/**
 * Generate daily summary (simple, no API call)
 */
async function generateDailySummary() {
    const context = await refreshContext();
    if (!context) {
        return 'Unable to generate summary - no data available';
    }

    const summary = `
📊 **Daily Energy Summary**

🔌 **Devices:** ${context.summary.activeLoads}/${context.summary.totalLoads} active
⚡ **Current Power:** ${context.summary.totalPowerW}W
📈 **Energy Today:** ${context.summary.totalEnergyKWh} kWh
💰 **Cost Today:** $${context.summary.totalCost}

**Device Status:**
${context.loads.map(l => `- ${l.name}: ${l.is_on ? '🟢 ON' : '🔴 OFF'} (${parseFloat(l.power || 0).toFixed(1)}W)`).join('\n')}

${context.alerts.length > 0 ? `\n⚠️ **Active Alerts:** ${context.alerts.length}` : '✅ No active alerts'}
`;
    return summary;
}

async function setAIControlMode(enabled) {
    aiControlEnabled = enabled;
    
    if (enabled) {
        console.log('🤖 AI Control Mode: ENABLED - Anomaly detection active');
        
        // Trigger immediate anomaly check
        const context = await refreshContext();
        if (context) {
            const anomalies = detectAnomalies(context);
            if (anomalies.length > 0) {
                const actions = await handleAnomalies(anomalies, context);
                return { 
                    enabled: true, 
                    message: `AI control enabled. Detected ${anomalies.length} anomaly(ies) and took action.`,
                    initialActions: actions
                };
            }
        }
        
        return { 
            enabled: true, 
            message: 'AI control enabled. Monitoring for anomalies and optimizing energy usage.' 
        };
    } else {
        console.log('🤖 AI Control Mode: DISABLED');
        return { 
            enabled: false, 
            message: 'AI control disabled. Manual control restored.' 
        };
    }
}

function getAIControlStatus() {
    return { enabled: aiControlEnabled };
}

async function triggerAIDecision() {
    const context = await refreshContext();
    if (!context) {
        return { success: false, error: 'Unable to fetch data' };
    }

    // Simple rule-based decisions (no AI API call)
    const actions = [];
    const hour = new Date().getHours();

    context.loads.forEach(load => {
        const power = parseFloat(load.power || 0);
        
        // Turn off heater if power too high
        if (load.device_type === 'heater' && load.is_on && power > 900) {
            actions.push({
                loadId: load.id,
                action: 'off',
                reason: 'Power exceeds safe threshold'
            });
        }
        
        // Turn off bulb during day
        if (load.device_type === 'bulb' && load.is_on && hour >= 9 && hour < 17) {
            actions.push({
                loadId: load.id,
                action: 'off',
                reason: 'Daytime - use natural light'
            });
        }
    });

    // Execute actions
    for (const action of actions) {
        try {
            await dataIngestion.updateLoadState(action.loadId, action.action === 'on', true);
        } catch (e) {
            console.error('Action failed:', e.message);
        }
    }

    return {
        success: true,
        decision: {
            summary: actions.length > 0 
                ? `Made ${actions.length} optimization(s)` 
                : 'System is optimized - no changes needed',
            actions
        }
    };
}

// ============================================================================
// SET SOCKET.IO REFERENCE
// ============================================================================

function setSocketIO(io) {
    ioRef = io;
    console.log('   🔌 Socket.IO connected for real-time alerts');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    initializeAI,
    chat,
    getRecommendations,
    getControlRecommendation,
    generateDailySummary,
    setAIControlMode,
    getAIControlStatus,
    triggerAIDecision,
    getChatHistory,
    clearChatHistory,
    setSocketIO,
    refreshContext
};
