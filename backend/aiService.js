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

// Cerebras AI Configuration (fallback provider)
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
let cerebrasApiKey = null;
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
let currentProvider = 'gemini'; // Track which AI provider is active

// Socket.io reference
let ioRef = null;

// Background monitoring
let monitoringInterval = null;
let aiControlEnabled = false;

// ============================================================================
// DATABASE QUERIES - REAL-TIME DATA FROM ESP32
// ============================================================================

async function getSystemContext() {
    try {
        // Get latest ESP32 load data for both loads
        const load1Query = `
            SELECT voltage, current, power, relay_state, timestamp
            FROM esp32_load_data
            WHERE load_number = 1
            ORDER BY timestamp DESC
            LIMIT 1
        `;
        const load2Query = `
            SELECT voltage, current, power, relay_state, timestamp
            FROM esp32_load_data
            WHERE load_number = 2
            ORDER BY timestamp DESC
            LIMIT 1
        `;
        
        // Get latest DHT11 data
        const dht11Query = `
            SELECT temperature, humidity, timestamp
            FROM esp32_dht11_data
            ORDER BY timestamp DESC
            LIMIT 1
        `;
        
        // Get today's energy summary from ESP32 data
        const todaySummaryQuery = `
            SELECT 
                load_number,
                COUNT(*) as readings,
                AVG(power)::numeric(10,2) as avg_power,
                MAX(power)::numeric(10,2) as max_power,
                MIN(voltage)::numeric(10,2) as min_voltage,
                MAX(voltage)::numeric(10,2) as max_voltage,
                SUM(power * 2 / 3600000)::numeric(10,6) as energy_kwh
            FROM esp32_load_data
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY load_number
        `;
        
        // Get hourly power consumption pattern
        const hourlyPatternQuery = `
            SELECT 
                EXTRACT(HOUR FROM timestamp) as hour,
                load_number,
                AVG(power)::numeric(10,2) as avg_power
            FROM esp32_load_data
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY EXTRACT(HOUR FROM timestamp), load_number
            ORDER BY hour
        `;
        
        // Get relay config with thresholds
        const relayConfigQuery = `
            SELECT load_number, power_threshold, relay_state, auto_mode
            FROM esp32_relay_config
            ORDER BY load_number
        `;
        
        const [load1, load2, dht11, todaySummary, hourlyPattern, relayConfig] = await Promise.all([
            pool.query(load1Query),
            pool.query(load2Query),
            pool.query(dht11Query),
            pool.query(todaySummaryQuery),
            pool.query(hourlyPatternQuery),
            pool.query(relayConfigQuery)
        ]);
        
        const load1Data = load1.rows[0] || { voltage: 0, current: 0, power: 0, relay_state: false };
        const load2Data = load2.rows[0] || { voltage: 0, current: 0, power: 0, relay_state: false };
        const envData = dht11.rows[0] || { temperature: 0, humidity: 0 };
        
        // Calculate costs (assuming $0.12 per kWh)
        const COST_PER_KWH = 0.12;
        const load1Summary = todaySummary.rows.find(r => r.load_number === 1) || { energy_kwh: 0, avg_power: 0, max_power: 0, max_voltage: 0 };
        const load2Summary = todaySummary.rows.find(r => r.load_number === 2) || { energy_kwh: 0, avg_power: 0, max_power: 0, max_voltage: 0 };
        
        const totalEnergyKWh = parseFloat(load1Summary.energy_kwh || 0) + parseFloat(load2Summary.energy_kwh || 0);
        const totalCost = totalEnergyKWh * COST_PER_KWH;
        
        // Build loads array for compatibility
        const loads = [
            {
                id: 1,
                name: 'AC Heater',
                device_type: 'heater',
                type: 'AC',
                is_on: load1Data.relay_state,
                voltage: parseFloat(load1Data.voltage) || 0,
                current: parseFloat(load1Data.current) || 0,
                power: parseFloat(load1Data.power) || 0,
                energy_kwh: parseFloat(load1Summary.energy_kwh) || 0,
                avg_power: parseFloat(load1Summary.avg_power) || 0,
                max_power: parseFloat(load1Summary.max_power) || 0,
                max_voltage: parseFloat(load1Summary.max_voltage) || 0,
                cost: (parseFloat(load1Summary.energy_kwh) || 0) * COST_PER_KWH,
                threshold: relayConfig.rows.find(r => r.load_number === 1)?.power_threshold || 450
            },
            {
                id: 2,
                name: 'AC Fan',
                device_type: 'fan',
                type: 'AC',
                is_on: load2Data.relay_state,
                voltage: parseFloat(load2Data.voltage) || 0,
                current: parseFloat(load2Data.current) || 0,
                power: parseFloat(load2Data.power) || 0,
                energy_kwh: parseFloat(load2Summary.energy_kwh) || 0,
                avg_power: parseFloat(load2Summary.avg_power) || 0,
                max_power: parseFloat(load2Summary.max_power) || 0,
                max_voltage: parseFloat(load2Summary.max_voltage) || 0,
                cost: (parseFloat(load2Summary.energy_kwh) || 0) * COST_PER_KWH,
                threshold: relayConfig.rows.find(r => r.load_number === 2)?.power_threshold || 300
            }
        ];
        
        const activeLoads = loads.filter(l => l.is_on).length;
        const totalPower = loads.reduce((sum, l) => sum + l.power, 0);
        
        return {
            loads,
            environment: {
                temperature: parseFloat(envData.temperature) || 0,
                humidity: parseFloat(envData.humidity) || 0,
                timestamp: envData.timestamp
            },
            summary: {
                totalLoads: 2,
                activeLoads,
                totalPowerW: totalPower.toFixed(1),
                totalEnergyKWh: totalEnergyKWh.toFixed(6),
                totalCost: totalCost.toFixed(4),
                avgPower: ((parseFloat(load1Summary.avg_power) || 0) + (parseFloat(load2Summary.avg_power) || 0)).toFixed(1)
            },
            hourlyPattern: hourlyPattern.rows,
            relayConfig: relayConfig.rows,
            alerts: [],
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
        try {
            systemContext = await getSystemContext();
        } catch (e) {
            console.error('System context update failed:', e);
            systemContext = null;
        }

        // Fallback if context is null (DB failure)
        if (!systemContext) {
            console.log(' AI Service: Using minimal mock context due to data failure');
            systemContext = {
                loads: [
                    { id: 1, name: 'AC Heater', power: 0, is_on: false, voltage: 0, current: 0, energy_kwh: 0, cost: 0, threshold: 450 }, 
                    { id: 2, name: 'AC Fan', power: 0, is_on: false, voltage: 0, current: 0, energy_kwh: 0, cost: 0, threshold: 300 }
                ],
                environment: { temperature: 25, humidity: 50 },
                summary: { activeLoads: 0, totalLoads: 2, totalPowerW: "0", totalEnergyKWh: "0", totalCost: "0", avgPower: "0" },
                hourlyPattern: [], 
                alerts: [], 
                timestamp: new Date().toISOString()
            };
        }
        lastContextUpdate = now;
    }
    return systemContext;
}

// ============================================================================
// AI INITIALIZATION
// ============================================================================

function initializeAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    cerebrasApiKey = process.env.CEREBRAS_API_KEY;
    
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        console.error(' GEMINI_API_KEY not configured in .env');
        if (cerebrasApiKey) {
            console.log(' Cerebras AI available as primary provider');
            currentProvider = 'cerebras';
        }
        return cerebrasApiKey ? true : false;
    }

    try {
        genAI = new GoogleGenerativeAI(apiKey);
        
        // Use Gemini 2.5 Flash
        model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash', 
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 4096
            }
        });

        currentProvider = 'gemini';
        console.log(' AI Chatbot initialized with Gemini 2.5 Flash');
        console.log(' API Key:', apiKey.substring(0, 20) + '...');
        
        if (cerebrasApiKey) {
            console.log(' Cerebras AI configured as fallback (model: ' + CEREBRAS_MODEL + ')');
        }
        
        // Start background anomaly monitoring
        startBackgroundMonitoring();
        
        return true;
    } catch (error) {
        console.error(' AI initialization failed:', error.message);
        if (cerebrasApiKey) {
            console.log(' Falling back to Cerebras AI');
            currentProvider = 'cerebras';
            startBackgroundMonitoring();
            return true;
        }
        return false;
    }
}

// ============================================================================
// CEREBRAS AI PROVIDER (OpenAI-compatible API)
// ============================================================================

async function callCerebrasAI(prompt, systemPrompt = '') {
    if (!cerebrasApiKey) {
        throw new Error('Cerebras API key not configured');
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(CEREBRAS_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cerebrasApiKey}`
        },
        body: JSON.stringify({
            model: CEREBRAS_MODEL,
            messages: messages,
            max_completion_tokens: 32768,
            temperature: 0.7,
            top_p: 0.9,
            stream: false
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cerebras API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// ============================================================================
// BACKGROUND ANOMALY MONITORING
// ============================================================================

async function startBackgroundMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    console.log(' Background anomaly monitoring started');
    
    // Check for anomalies every 15 seconds
    monitoringInterval = setInterval(async () => {
        if (!aiControlEnabled) return;
        
        try {
            const context = await refreshContext();
            if (!context) return;
            
            const anomalies = detectAnomalies(context);
            
            if (anomalies.length > 0 && aiControlEnabled) {
                console.log(` Detected ${anomalies.length} anomalies - taking action`);
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
        
        // Anomaly: Heater exceeding max threshold (450W)
        if (load.device_type === 'heater' && load.is_on && power > 450) {
            anomalies.push({
                type: 'excessive_heating',
                loadId: load.id,
                loadName: load.name,
                severity: 'warning',
                message: `${load.name} exceeds threshold at ${power.toFixed(1)}W (max 450W)`,
                action: 'turn_off'
            });
        }
        
        // Anomaly: Fan exceeding max threshold (300W)
        if (load.device_type === 'fan' && load.is_on && power > 300) {
            anomalies.push({
                type: 'fan_overload',
                loadId: load.id,
                loadName: load.name,
                severity: 'warning',
                message: `${load.name} exceeds threshold at ${power.toFixed(1)}W (max 300W)`,
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
// HELPER: REMOVE EMOJIS FROM TEXT
// ============================================================================

function removeEmojis(text) {
    // Remove common emojis and emoji patterns
    return text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
        .replace(/[\u{2600}-\u{26FF}]/gu, '') // Misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // Variation Selectors
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols Extended-A
        .replace(/[\u{231A}-\u{231B}]/gu, '') // Watch, Hourglass
        .replace(/[\u{23E9}-\u{23F3}]/gu, '') // Various symbols
        .replace(/[\u{23F8}-\u{23FA}]/gu, '') // Various symbols
        .replace(/[\u{25AA}-\u{25AB}]/gu, '') // Squares
        .replace(/[\u{25B6}]/gu, '') // Play button
        .replace(/[\u{25C0}]/gu, '') // Reverse button
        .replace(/[\u{25FB}-\u{25FE}]/gu, '') // Squares
        .replace(/[\u{2934}-\u{2935}]/gu, '') // Arrows
        .replace(/[\u{2B05}-\u{2B07}]/gu, '') // Arrows
        .replace(/[\u{2B1B}-\u{2B1C}]/gu, '') // Squares
        .replace(/[\u{2B50}]/gu, '') // Star
        .replace(/[\u{2B55}]/gu, '') // Circle
        .replace(/[\u{3030}]/gu, '') // Wavy Dash
        .replace(/[\u{303D}]/gu, '') // Part Alternation Mark
        .replace(/[\u{3297}]/gu, '') // Circled Ideograph
        .replace(/[\u{3299}]/gu, '') // Circled Ideograph Secret
        .trim();
}

// ============================================================================
// MAIN CHAT FUNCTION
// ============================================================================

// Store chat history per user
const userChatHistories = new Map();

// Smart fallback for common queries (professional, no emojis)
function getSmartFallback(query, context) {
    const q = query.toLowerCase();
    
    // Status queries
    if (q.includes('status') || q.includes('how') && (q.includes('device') || q.includes('load'))) {
        return `**Current System Status**

**Devices:**
${context.loads.map(l => `• ${l.name}: ${l.is_on ? 'ON (Active)' : 'OFF (Inactive)'} - ${parseFloat(l.power || 0).toFixed(1)}W`).join('\n')}

**Summary:**
• Active: ${context.summary.activeLoads}/${context.summary.totalLoads} devices
• Power: ${context.summary.totalPowerW}W
• Energy Today: ${context.summary.totalEnergyKWh} kWh
• Cost Today: $${context.summary.totalCost}`;
    }
    
    // Power/energy queries
    if (q.includes('power') || q.includes('consumption') || q.includes('using')) {
        return `**Power Consumption**

• **Total Power:** ${context.summary.totalPowerW}W
• **Today's Energy:** ${context.summary.totalEnergyKWh} kWh
• **Cost:** $${context.summary.totalCost}

**By Device:**
${context.loads.map(l => `• ${l.name}: ${parseFloat(l.power || 0).toFixed(1)}W`).join('\n')}`;
    }
    
    // Cost queries
    if (q.includes('cost') || q.includes('bill') || q.includes('money')) {
        return `**Cost Information**

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
            if (load.device_type === 'heater' && load.is_on && parseFloat(load.power || 0) > 450) {
                tips.push('• Heater exceeding 450W threshold - consider turning it off to save energy');
            }
            if (load.device_type === 'fan' && load.is_on && parseFloat(load.power || 0) > 300) {
                tips.push('• Fan exceeding 300W threshold - check if high-speed mode is necessary');
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
        
        return `**Energy Saving Tips**\n\n${tips.join('\n')}`;
    }
    
    // Alerts
    if (q.includes('alert') || q.includes('warning') || q.includes('problem')) {
        if (context.alerts.length === 0) {
            return '**No Active Alerts**\n\nYour system is running smoothly with no warnings or issues.';
        }
        return `**Active Alerts (${context.alerts.length})**\n\n${context.alerts.map(a => `• ${a.alert_type.toUpperCase()}: ${a.message}`).join('\n')}`;
    }
    
    return null;
}

async function chat(userQuery, username = 'guest', preferredModel = null) {
    console.log(` AI Proc: "${userQuery}" for ${username}${preferredModel ? ` [preferred: ${preferredModel}]` : ''}`);
    try {
        // Step 1: Get real-time data from ESP32 database tables
        const context = await refreshContext();
        if (!context) {
            return { success: false, error: 'Database connection error. Please try again.' };
        }

        // Step 2: Check AI model availability
        if (!model && !cerebrasApiKey) {
            // Provide fallback response using database data
            return generateFallbackResponse(userQuery, context, username);
        }

        // Step 3: Get user chat history
        if (!userChatHistories.has(username)) {
            userChatHistories.set(username, []);
        }
        const chatHistory = userChatHistories.get(username);

        // Step 4: Build context from recent chat
        let chatContext = '';
        if (chatHistory.length > 0) {
            const recent = chatHistory.slice(-2); // Last 2 exchanges
            chatContext = '\n\nRecent conversation:\n' + 
                recent.map(h => `User: ${h.query}\nAgent: ${h.response.substring(0, 100)}...`).join('\n') + '\n';
        }

        // Step 5: Build hourly pattern info for predictions
        let hourlyInfo = '';
        if (context.hourlyPattern && context.hourlyPattern.length > 0) {
            const peakHour = context.hourlyPattern.reduce((max, h) => 
                parseFloat(h.avg_power) > parseFloat(max.avg_power) ? h : max, 
                context.hourlyPattern[0]
            );
            hourlyInfo = `\n USAGE PATTERN:\n• Peak usage hour: ${peakHour.hour}:00 (${peakHour.avg_power}W avg)\n`;
        }

        // Step 6: Create AI agent prompt
        const agentPrompt = `You are a smart, helpful AI Energy Assistant. 
CONTEXT AND REAL-TIME DATA:
Time: ${context.timestamp}
- Load 1 (AC Heater): ${context.loads[0].power.toFixed(1)}W [${context.loads[0].is_on ? 'ON' : 'OFF'}]
- Load 2 (AC Fan): ${context.loads[1].power.toFixed(1)}W [${context.loads[1].is_on ? 'ON' : 'OFF'}]
- Environment: ${context.environment.temperature}°C, ${context.environment.humidity}% Humidity
- Total Power: ${context.summary.totalPowerW}W | Total Energy Today: ${context.summary.totalEnergyKWh} kWh
- Configured Thresholds: Heater=${context.loads[0].threshold}W (max 450W), Fan=${context.loads[1].threshold}W (max 300W)

${chatContext}
USER INPUT: "${userQuery}"

INSTRUCTIONS:
1. specific question, use the real-time data above to answer accurately.
2. If the user asks for analysis, look at the power and energy values.
3. Keep the tone professional but helpful and natural. 
4. Do NOT use emojis. 
5. Be concise.`;

        const activeProvider = preferredModel || currentProvider;
        console.log(` AI Processing with ${activeProvider === 'cerebras' ? 'Cerebras ' + CEREBRAS_MODEL : 'Gemini 2.5 Flash'}...`);

        // Step 7: Call AI - with automatic provider fallback
        let agentResponse;
        let usedProvider = activeProvider;
        
        // Try Gemini first (if preferred or default)
        if (model && activeProvider === 'gemini') {
            try {
                const result = await model.generateContent(agentPrompt);
                agentResponse = result.response.text();
                usedProvider = 'gemini';
                
                // formatting
                agentResponse = removeEmojis(agentResponse)
                    .replace(/\*\*/g, '<b>').replace(/\*\*/g, '</b>')
                    .trim();
                    
            } catch (aiError) {
                console.error(' Gemini API Failed:', aiError.message);
                
                // Try Cerebras fallback for any Gemini error (429, 404, quota, etc.)
                if (cerebrasApiKey) {
                    console.log(' Switching to Cerebras AI fallback...');
                    try {
                        agentResponse = await callCerebrasAI(agentPrompt);
                        agentResponse = removeEmojis(agentResponse).trim();
                        usedProvider = 'cerebras';
                        console.log(' Cerebras AI responded successfully');
                    } catch (cerebrasError) {
                        console.error(' Cerebras fallback also failed:', cerebrasError.message);
                        
                        // Last resort: try gemini-2.0-flash
                        if (aiError.message.includes('404') || aiError.message.includes('not found')) {
                            console.log(' Attempting fallback to gemini-2.0-flash model...');
                            try {
                                const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
                                const result = await fallbackModel.generateContent(agentPrompt);
                                agentResponse = result.response.text();
                                agentResponse = removeEmojis(agentResponse).trim();
                                usedProvider = 'gemini-2.0-flash';
                                console.log(' Fallback to gemini-2.0-flash successful');
                            } catch (fallbackError) {
                                console.error(' All AI providers failed');
                                return generateFallbackResponse(userQuery, context, username);
                            }
                        } else {
                            return generateFallbackResponse(userQuery, context, username);
                        }
                    }
                } else {
                    // No Cerebras, try gemini-2.0-flash for 404 errors
                    if (aiError.message.includes('404') || aiError.message.includes('not found')) {
                        console.log(' Attempting fallback to gemini-2.0-flash model...');
                        try {
                            const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
                            const result = await fallbackModel.generateContent(agentPrompt);
                            agentResponse = result.response.text();
                            agentResponse = removeEmojis(agentResponse).trim();
                            usedProvider = 'gemini-2.0-flash';
                            console.log(' Fallback to gemini-2.0-flash successful');
                        } catch (fallbackError) {
                            console.error(' Fallback failed:', fallbackError.message);
                            return generateFallbackResponse(userQuery, context, username);
                        }
                    } else {
                        return generateFallbackResponse(userQuery, context, username);
                    }
                }
            }
        } 
        // Use Cerebras as primary (if preferred or default)
        else if (cerebrasApiKey && (activeProvider === 'cerebras' || !model)) {
            try {
                agentResponse = await callCerebrasAI(agentPrompt);
                agentResponse = removeEmojis(agentResponse).trim();
                usedProvider = 'cerebras';
                console.log(' Cerebras AI responded successfully');
            } catch (cerebrasError) {
                console.error(' Cerebras API Failed:', cerebrasError.message);
                
                // Try Gemini if available
                if (model) {
                    try {
                        const result = await model.generateContent(agentPrompt);
                        agentResponse = result.response.text();
                        agentResponse = removeEmojis(agentResponse).trim();
                        usedProvider = 'gemini';
                    } catch (geminiError) {
                        console.error(' Gemini fallback also failed:', geminiError.message);
                        return generateFallbackResponse(userQuery, context, username);
                    }
                } else {
                    return generateFallbackResponse(userQuery, context, username);
                }
            }
        } else {
            // No AI providers available
            return generateFallbackResponse(userQuery, context, username);
        }

        // Step 8: Save to history
        chatHistory.push({
            query: userQuery,
            response: agentResponse,
            timestamp: new Date().toISOString()
        });

        // Keep last 10 messages only
        if (chatHistory.length > 10) {
            chatHistory.shift();
        }

        console.log(` AI Agent responded successfully (${usedProvider})`);

        return {
            success: true,
            response: agentResponse || "I processed your request.",
            timestamp: context.timestamp,
            dataSource: usedProvider === 'cerebras' ? 'cerebras-ai-agent' : 'gemini-ai-agent',
            provider: usedProvider
        };

    } catch (error) {
        console.error(' AI Agent error:', error.message);
        
        // Always try fallback response for any error
        console.error('Chat error details:', error);
        
        const context = await refreshContext();
        if (context) {
            console.log('Using fallback response...');
            return generateFallbackResponse(userQuery, context, username);
        }
        
        // If even fallback fails, return friendly error
        return { 
            success: true, 
            response: `I'm having trouble connecting to the AI service right now. However, I can see your loads are working:\n\n**Status:**\n• AC Heater: ${currentData?.load1?.power || 0}W\n• AC Fan: ${currentData?.load2?.power || 0}W\n\nPlease try asking your question again, or use the quick question buttons.`,
            dataSource: 'error-fallback'
        };
    }
}

// Fallback response when AI is not available (professional, no emojis)
function generateFallbackResponse(userQuery, context, username) {
    const query = userQuery.toLowerCase();
    let response = '';
    
    if (query.includes('power') || query.includes('consumption') || query.includes('usage')) {
        response = `**Current Power Usage**\n\n` +
            `**AC Heater:** ${context.loads[0].power.toFixed(1)}W (${context.loads[0].is_on ? 'ON' : 'OFF'})\n` +
            `**AC Fan:** ${context.loads[1].power.toFixed(1)}W (${context.loads[1].is_on ? 'ON' : 'OFF'})\n` +
            `**Total:** ${context.summary.totalPowerW}W\n\n` +
            `Today's energy: ${context.summary.totalEnergyKWh} kWh ($${context.summary.totalCost})`;
    }
    else if (query.includes('temperature') || query.includes('temp') || query.includes('humidity')) {
        response = `**Environment Status**\n\n` +
            `• Temperature: ${context.environment.temperature}°C\n` +
            `• Humidity: ${context.environment.humidity}%\n\n` +
            `${context.environment.temperature > 30 ? 'Warning: High temperature detected!' : 'Temperature is normal.'}`;
    }
    else if (query.includes('cost') || query.includes('money') || query.includes('bill') || query.includes('save')) {
        const dailyCost = parseFloat(context.summary.totalCost);
        const monthlyCost = dailyCost * 30;
        response = `**Cost Analysis**\n\n` +
            `**Today's Cost:** $${dailyCost.toFixed(4)}\n` +
            `**Projected Monthly:** $${monthlyCost.toFixed(2)}\n\n` +
            `**Cost-Saving Tips:**\n` +
            `1. Turn off AC Heater when not needed (uses ${context.loads[0].avg_power}W avg)\n` +
            `2. Use timer controls during peak hours\n` +
            `3. Set lower thresholds for auto-off`;
    }
    else if (query.includes('heater') || query.includes('load 1')) {
        response = `**AC Heater Status**\n\n` +
            `• Status: ${context.loads[0].is_on ? 'ON (Active)' : 'OFF (Inactive)'}\n` +
            `• Power: ${context.loads[0].power.toFixed(1)}W\n` +
            `• Voltage: ${context.loads[0].voltage.toFixed(1)}V\n` +
            `• Current: ${context.loads[0].current.toFixed(3)}A\n` +
            `• Today's Energy: ${context.loads[0].energy_kwh.toFixed(6)} kWh\n` +
            `• Today's Cost: $${context.loads[0].cost.toFixed(4)}`;
    }
    else if (query.includes('fan') || query.includes('load 2')) {
        response = `**AC Fan Status**\n\n` +
            `• Status: ${context.loads[1].is_on ? 'ON (Active)' : 'OFF (Inactive)'}\n` +
            `• Power: ${context.loads[1].power.toFixed(1)}W\n` +
            `• Voltage: ${context.loads[1].voltage.toFixed(1)}V\n` +
            `• Current: ${context.loads[1].current.toFixed(3)}A\n` +
            `• Today's Energy: ${context.loads[1].energy_kwh.toFixed(6)} kWh\n` +
            `• Today's Cost: $${context.loads[1].cost.toFixed(4)}\n` +
            `• Max Threshold: 300W`;
    }
    else if (query.includes('pattern') || query.includes('analyze') || query.includes('predict')) {
        response = `**Usage Analysis**\n\n` +
            `**Today's Summary:**\n` +
            `• Total Energy: ${context.summary.totalEnergyKWh} kWh\n` +
            `• Average Power: ${context.summary.avgPower}W\n` +
            `• Active Devices: ${context.summary.activeLoads}/${context.summary.totalLoads}\n\n` +
            `**Prediction:**\n` +
            `If usage continues, monthly consumption: ~${(parseFloat(context.summary.totalEnergyKWh) * 30).toFixed(3)} kWh\n` +
            `Estimated monthly cost: $${(parseFloat(context.summary.totalCost) * 30).toFixed(2)}`;
    }
    else {
        response = `**Hello!** I'm your Smart Home AI Assistant.\n\n` +
            `**Current Status:**\n` +
            `• AC Heater: ${context.loads[0].power.toFixed(1)}W (${context.loads[0].is_on ? 'ON' : 'OFF'})\n` +
            `• AC Fan: ${context.loads[1].power.toFixed(1)}W (${context.loads[1].is_on ? 'ON' : 'OFF'})\n` +
            `• Temperature: ${context.environment.temperature}°C\n` +
            `• Total Power: ${context.summary.totalPowerW}W\n\n` +
            `**Ask me about:**\n` +
            `• Power consumption & costs\n` +
            `• Temperature & humidity\n` +
            `• Energy-saving tips\n` +
            `• Usage predictions`;
    }
    
    return {
        success: true,
        response: response,
        timestamp: context.timestamp,
        dataSource: 'rule-based-fallback'
    };
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
        
        if (load.device_type === 'heater' && load.is_on && power > 450) {
            recommendations.push({
                device: load.name,
                tip: `Heater exceeding 450W threshold (${power.toFixed(1)}W). Turn off or reduce usage.`,
                savings: '~15% energy savings'
            });
        }
        
        if (load.device_type === 'fan' && load.is_on && power > 300) {
            recommendations.push({
                device: load.name,
                tip: `Fan exceeding 300W threshold (${power.toFixed(1)}W). Switch to lower speed or turn off.`,
                savings: '~10% energy savings'
            });
        }
    });

    if (totalPower > 1500) {
        recommendations.push({
            device: 'System',
            tip: 'High total power consumption. Turn off unused devices.',
            savings: '~20% energy savings'
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            device: 'System',
            tip: 'Energy usage looks good! Keep it up.',
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
        warnings.push('Total power usage is already high');
    }

    // Check heater safety
    if (load.device_type === 'heater' && action === 'on') {
        const hour = new Date().getHours();
        if (hour >= 22 || hour < 6) {
            warnings.push('Night mode - consider using lower settings');
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
 **Daily Energy Summary**

 **Devices:** ${context.summary.activeLoads}/${context.summary.totalLoads} active
 **Current Power:** ${context.summary.totalPowerW}W
 **Energy Today:** ${context.summary.totalEnergyKWh} kWh
 **Cost Today:** $${context.summary.totalCost}

**Device Status:**
${context.loads.map(l => `- ${l.name}: ${l.is_on ? ' ON' : ' OFF'} (${parseFloat(l.power || 0).toFixed(1)}W)`).join('\n')}

${context.alerts.length > 0 ? `\n **Active Alerts:** ${context.alerts.length}` : ' No active alerts'}
`;
    return summary;
}

async function setAIControlMode(enabled) {
    aiControlEnabled = enabled;
    
    if (enabled) {
        console.log(' AI Control Mode: ENABLED - Anomaly detection active');
        
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
        console.log(' AI Control Mode: DISABLED');
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
    console.log(' AI Decision: Starting autonomous control analysis...');
    
    // Step 1: Get real-time database context
    const context = await refreshContext();
    if (!context) {
        return { success: false, error: 'Unable to fetch database context' };
    }

    // Step 2: Check if AI model is available
    if (!model && !cerebrasApiKey) {
        console.log(' No AI providers available, using fallback rules');
        return await fallbackAIDecision(context);
    }

    try {
        // Step 3: Build comprehensive prompt for Gemini AI
        const currentTime = new Date();
        const hour = currentTime.getHours();
        const timeOfDay = hour >= 6 && hour < 12 ? 'morning' : 
                         hour >= 12 && hour < 17 ? 'afternoon' : 
                         hour >= 17 && hour < 21 ? 'evening' : 'night';
        
        const deviceDetails = context.loads.map(load => {
            return `
Device ${load.id}: ${load.device_name} (${load.device_type})
  Status: ${load.is_on ? 'ON' : 'OFF'}
  Power: ${parseFloat(load.power || 0).toFixed(1)}W
  Voltage: ${parseFloat(load.voltage || 0).toFixed(1)}V
  Current: ${parseFloat(load.current || 0).toFixed(2)}A
  Energy Today: ${parseFloat(load.energy || 0).toFixed(4)} kWh
  Cost Today: $${parseFloat(load.cost || 0).toFixed(4)}
  Auto Mode: ${load.auto_mode ? 'Enabled' : 'Disabled'}`;
        }).join('\n');

        const alertInfo = context.alerts.length > 0 
            ? `\n ACTIVE ALERTS (${context.alerts.length}):\n` + context.alerts.map(a => 
                ` - ${a.load_name}: ${a.message} (${a.alert_type})`
              ).join('\n')
            : '';

        const aiPrompt = `You are an intelligent energy management AI agent. Analyze the current state of all devices and decide which actions to take for optimal energy efficiency, safety, and cost savings.

 CURRENT SYSTEM STATE:
Time: ${currentTime.toLocaleString()} (${timeOfDay})
Active Devices: ${context.summary.active_count} / ${context.summary.total_count}
Total Power: ${context.summary.total_power}W
Total Energy: ${context.summary.total_energy} kWh
Total Cost: $${context.summary.total_cost}
${alertInfo}

 DEVICE STATUS:
${deviceDetails}

 YOUR TASK:
Analyze each device and decide whether to:
1. Turn ON a device (if it should be running)
2. Turn OFF a device (if it's wasting energy, unsafe, or unnecessary)
3. Keep current state (if optimal)

Consider:
- Time of day (${timeOfDay}) - e.g., turn off lights during daytime
- Energy efficiency - reduce total power consumption
- Safety - turn off devices with abnormal readings
- Cost optimization - minimize electricity costs
- Alerts - address any critical issues

 RESPOND WITH VALID JSON ONLY:
{
  "summary": "Brief explanation of decisions",
  "actions": [
    {
      "loadId": 1,
      "action": "on" or "off" or "keep",
      "reason": "Why this decision was made"
    }
  ]
}

IMPORTANT: Only include devices that need action (on/off). Skip devices that should "keep" their current state.`;

        // Step 4: Call AI for autonomous decision (Gemini primary, Cerebras fallback)
        console.log(' Calling AI for autonomous control decision...');
        let responseText;
        let decisionProvider = 'gemini';
        
        if (model && currentProvider === 'gemini') {
            try {
                const result = await model.generateContent(aiPrompt);
                responseText = result.response.text();
            } catch (geminiError) {
                console.error(' Gemini AI Decision failed:', geminiError.message);
                
                // Fallback to Cerebras
                if (cerebrasApiKey) {
                    console.log(' Falling back to Cerebras for AI decision...');
                    try {
                        responseText = await callCerebrasAI(aiPrompt, 'You are an intelligent energy management AI agent. Respond with valid JSON only.');
                        decisionProvider = 'cerebras';
                        console.log(' Cerebras AI decision successful');
                    } catch (cerebrasError) {
                        console.error(' Cerebras decision also failed:', cerebrasError.message);
                        return await fallbackAIDecision(context);
                    }
                } else {
                    if (geminiError.message?.includes('quota') || geminiError.message?.includes('429')) {
                        console.log(' AI quota exceeded, using fallback rules');
                    }
                    return await fallbackAIDecision(context);
                }
            }
        } else if (cerebrasApiKey) {
            try {
                responseText = await callCerebrasAI(aiPrompt, 'You are an intelligent energy management AI agent. Respond with valid JSON only.');
                decisionProvider = 'cerebras';
                console.log(' Cerebras AI decision successful');
            } catch (cerebrasError) {
                console.error(' Cerebras AI decision failed:', cerebrasError.message);
                return await fallbackAIDecision(context);
            }
        } else {
            return await fallbackAIDecision(context);
        }
        
        // Step 5: Parse AI response
        let aiDecision;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                            responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                            [null, responseText];
            const jsonText = jsonMatch[1] || responseText;
            aiDecision = JSON.parse(jsonText.trim());
        } catch (parseError) {
            console.error(' Failed to parse AI response:', parseError.message);
            console.log('Raw response:', responseText);
            return { 
                success: false, 
                error: 'AI response was not in valid JSON format',
                rawResponse: responseText 
            };
        }

        // Step 6: Validate and execute actions
        const executedActions = [];
        if (aiDecision.actions && Array.isArray(aiDecision.actions)) {
            for (const action of aiDecision.actions) {
                if (action.action === 'keep') continue; // Skip "keep" actions
                
                try {
                    const turnOn = action.action === 'on';
                    await dataIngestion.updateLoadState(action.loadId, turnOn, true);
                    
                    executedActions.push({
                        loadId: action.loadId,
                        action: action.action,
                        reason: action.reason,
                        success: true
                    });
                    
                    console.log(` AI Action: Load ${action.loadId} → ${action.action.toUpperCase()} - ${action.reason}`);
                    
                    // Emit real-time update via Socket.IO
                    if (ioRef) {
                        ioRef.emit('ai-control-action', {
                            loadId: action.loadId,
                            action: action.action,
                            reason: action.reason,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (execError) {
                    console.error(` Failed to execute action for Load ${action.loadId}:`, execError.message);
                    executedActions.push({
                        loadId: action.loadId,
                        action: action.action,
                        reason: action.reason,
                        success: false,
                        error: execError.message
                    });
                }
            }
        }

        // Step 7: Return results
        return {
            success: true,
            decision: {
                summary: aiDecision.summary || `AI made ${executedActions.length} decision(s)`,
                actions: executedActions,
                totalActions: executedActions.length,
                timestamp: new Date().toISOString()
            },
            dataSource: decisionProvider === 'cerebras' ? 'cerebras-ai-agent' : 'gemini-ai-agent',
            provider: decisionProvider
        };

    } catch (error) {
        console.error(' AI Decision Error:', error.message);
        
        // Fallback to Cerebras or rule-based on errors
        if (cerebrasApiKey && currentProvider === 'gemini') {
            console.log(' AI Decision error, trying Cerebras...');
            try {
                // Rebuild the prompt for Cerebras
                const deviceDetails = context.loads.map(load => {
                    return `Device ${load.id}: ${load.name} (${load.device_type}) - Status: ${load.is_on ? 'ON' : 'OFF'} - Power: ${parseFloat(load.power || 0).toFixed(1)}W`;
                }).join('\n');
                
                const quickPrompt = `Analyze these home devices and decide optimal on/off state for energy savings. Time: ${new Date().toLocaleString()}\n\n${deviceDetails}\n\nRespond with JSON: {"summary": "...", "actions": [{"loadId": N, "action": "on/off", "reason": "..."}]}`;
                
                const responseText = await callCerebrasAI(quickPrompt, 'You are an energy management AI. Respond with valid JSON only.');
                let aiDecision;
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                                responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                                [null, responseText];
                const jsonText = jsonMatch[1] || responseText;
                aiDecision = JSON.parse(jsonText.trim());
                
                const executedActions = [];
                if (aiDecision.actions && Array.isArray(aiDecision.actions)) {
                    for (const action of aiDecision.actions) {
                        if (action.action === 'keep') continue;
                        try {
                            const turnOn = action.action === 'on';
                            await dataIngestion.updateLoadState(action.loadId, turnOn, true);
                            executedActions.push({ loadId: action.loadId, action: action.action, reason: action.reason, success: true });
                            if (ioRef) {
                                ioRef.emit('ai-control-action', { loadId: action.loadId, action: action.action, reason: action.reason, timestamp: new Date().toISOString() });
                            }
                        } catch (e) {
                            executedActions.push({ loadId: action.loadId, action: action.action, reason: action.reason, success: false, error: e.message });
                        }
                    }
                }
                
                return {
                    success: true,
                    decision: { summary: aiDecision.summary, actions: executedActions, totalActions: executedActions.length, timestamp: new Date().toISOString() },
                    dataSource: 'cerebras-ai-agent',
                    provider: 'cerebras'
                };
            } catch (cerebrasError) {
                console.error(' Cerebras fallback decision also failed:', cerebrasError.message);
            }
        }
        
        // Final fallback to rule-based
        return await fallbackAIDecision(context);
    }
}

// Fallback rule-based decision (when AI is unavailable)
async function fallbackAIDecision(context) {
    console.log(' Using fallback rule-based decisions');
    const actions = [];
    const hour = new Date().getHours();

    context.loads.forEach(load => {
        const power = parseFloat(load.power || 0);
        
        // Turn off heater if power exceeds 450W threshold
        if (load.device_type === 'heater' && load.is_on && power > 450) {
            actions.push({
                loadId: load.id,
                action: 'off',
                reason: `Heater exceeds 450W threshold (${power.toFixed(1)}W)`
            });
        }
        
        // Turn off fan if power exceeds 300W threshold
        if (load.device_type === 'fan' && load.is_on && power > 300) {
            actions.push({
                loadId: load.id,
                action: 'off',
                reason: `Fan exceeds 300W threshold (${power.toFixed(1)}W)`
            });
        }
        
        // Turn off fan at night (11 PM - 6 AM) if running
        if (load.device_type === 'fan' && load.is_on && (hour >= 23 || hour < 6)) {
            actions.push({
                loadId: load.id,
                action: 'off',
                reason: 'Night hours - fan turned off to save energy'
            });
        }
    });

    // Execute actions
    const executedActions = [];
    for (const action of actions) {
        try {
            await dataIngestion.updateLoadState(action.loadId, action.action === 'on', true);
            executedActions.push({ ...action, success: true });
            
            if (ioRef) {
                ioRef.emit('ai-control-action', {
                    loadId: action.loadId,
                    action: action.action,
                    reason: action.reason,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (e) {
            console.error('Action failed:', e.message);
            executedActions.push({ ...action, success: false, error: e.message });
        }
    }

    return {
        success: true,
        decision: {
            summary: executedActions.length > 0 
                ? `Applied ${executedActions.length} rule-based optimization(s)` 
                : 'System is optimized - no changes needed',
            actions: executedActions,
            totalActions: executedActions.length
        },
        dataSource: 'rule-based-fallback'
    };
}

// ============================================================================
// SET SOCKET.IO REFERENCE
// ============================================================================

function setSocketIO(io) {
    ioRef = io;
    console.log(' Socket.IO connected for real-time alerts');
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
