/**
 * Smart Load Dashboard - Main Application
 * Handles UI interactions, WebSocket, and data display
 */

console.log('🚀 Smart Load Dashboard JS loaded');

// =====================================================
// Configuration & State
// =====================================================

const API_URL = window.location.origin;
const WS_URL = window.location.origin;

let socket = null;
let authToken = localStorage.getItem('authToken') || null;
let currentUser = null;

// Load current user from localStorage
try {
    var storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
    }
} catch (e) {
    console.error('Error loading user:', e);
}

let charts = {};
let selectedLoadId = 1;
let telemetryHistory = { 1: [], 2: [], 3: [] };
let justLoggedIn = false;

// Device icons mapping
const deviceIcons = {
    fan: 'fa-fan',
    bulb: 'fa-lightbulb',
    heater: 'fa-fire'
};

// =====================================================
// Authentication
// =====================================================

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    
    if (socket) {
        socket.disconnect();
    }
    
    window.location.href = 'login.html';
}

// =====================================================
// WebSocket Connection
// =====================================================

function initializeWebSocket() {
    socket = io(WS_URL);

    socket.on('connect', () => {
        console.log('WebSocket connected');
        socket.emit('authenticate', authToken);
        updateConnectionStatus(true);
        // Setup ESP32 listeners after socket connected
        setupESP32SocketListeners();
    });

    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        updateMQTTStatus(false);
    });

    socket.on('authenticated', (data) => {
        if (data.success) {
            console.log('WebSocket authenticated');
        }
    });

    // MQTT Status Updates
    socket.on('mqtt:status', (data) => {
        console.log('📡 MQTT Status:', data);
        updateMQTTStatus(data.connected, data.clientId);
    });

    // MQTT Client Connected
    socket.on('mqtt:client_connected', (data) => {
        console.log('📡 MQTT Client Connected:', data.clientId);
        updateMQTTStatus(true, data.clientId);
        showNotification(`ESP32 connected: ${data.clientId}`, 'success');
    });

    // MQTT Client Disconnected
    socket.on('mqtt:client_disconnected', (data) => {
        console.log('📡 MQTT Client Disconnected:', data.clientId);
        updateMQTTStatus(false);
    });

    // Real-time telemetry updates
    socket.on('telemetryUpdate', (data) => {
        updateDashboard(data);
    });

    // New alerts
    socket.on('newAlerts', (alerts) => {
        alerts.forEach(alert => addAlert(alert));
        if (alerts.some(a => a.alert_type === 'critical')) {
            showAlertBanner(alerts.find(a => a.alert_type === 'critical').message);
        }
    });

    // Load state changes
    socket.on('loadStateChange', (data) => {
        updateLoadCard(data.loadId, data);
        if (data.aiControlled) {
            showAIActionToast(`Device ${data.loadId} turned ${data.isOn ? 'ON' : 'OFF'} by AI`);
        }
    });

    // Auto-control actions
    socket.on('autoControlAction', (data) => {
        showNotification(`${data.name}: ${data.action.action} - ${data.action.reason}`);
    });

    // AI Real-time Alerts
    socket.on('ai-alert', (data) => {
        console.log('🚨 AI Alert:', data);
        showAIAlert(data);
    });

    // AI Proactive Insights
    socket.on('ai-insight', (data) => {
        console.log('💡 AI Insight:', data);
        showAIInsight(data);
    });

    // AI Control Mode Changed
    socket.on('ai-control-mode-changed', (data) => {
        updateAIControlUI(data.enabled);
    });

    // AI Decision Made
    socket.on('ai-decision', (data) => {
        console.log('🤖 AI Decision:', data);
        showAIDecision(data);
    });

    // AI Anomaly Actions
    socket.on('ai-anomaly-action', (data) => {
        console.log('⚠️ AI Anomaly Action:', data);
        showAnomalyAlert(data);
    });

    // AI Control Action
    socket.on('ai-control-action', (data) => {
        console.log('🎮 AI Control Action:', data);
        showAIActionToast(`${data.action.toUpperCase()} - ${data.reason}`);
    });
}

function showAIActionToast(message) {
    const existing = document.querySelector('.ai-action-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'ai-action-toast';
    toast.innerHTML = `
        <h4><i class="fas fa-robot"></i> AI Action</h4>
        <p>${message}</p>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 5000);
}

function showAIDecision(data) {
    const decisionEl = document.getElementById('aiLastDecision');
    const decisionText = document.getElementById('aiDecisionText');
    
    if (decisionEl && decisionText) {
        decisionEl.classList.remove('hidden');
        
        // Check if it's an error message (rate limit, etc)
        let summary = data.decision?.summary || data.decision || 'No decision';
        
        // Clean up error messages - extract just the important part
        if (typeof summary === 'string' && summary.includes('Error:')) {
            if (summary.includes('429') || summary.includes('quota') || summary.includes('rate')) {
                summary = '⏳ Rate limited - Please wait a moment before trying again';
            } else if (summary.includes('googleapis.com')) {
                // Extract just the error type
                const match = summary.match(/\[(\d+)\s*([^\]]+)\]/);
                summary = match ? `⚠️ API Error: ${match[2]}` : '⚠️ AI service temporarily unavailable';
            }
        }
        
        let html = `<strong>${summary}</strong><br>`;
        if (data.decision?.actions && data.decision.actions.length > 0) {
            html += '<ul style="margin-top: 0.5rem; padding-left: 1.2rem;">';
            data.decision.actions.forEach(a => {
                const icon = a.action === 'on' ? '🟢' : '🔴';
                html += `<li>${icon} Load ${a.loadId}: ${a.action.toUpperCase()} - ${a.reason}</li>`;
            });
            html += '</ul>';
        }
        html += `<small style="color: #a5b4fc;">Time: ${new Date(data.timestamp).toLocaleTimeString()}</small>`;
        decisionText.innerHTML = html;
    }
    
    // Also show toast
    if (data.decision?.actions && data.decision.actions.length > 0) {
        showAIActionToast(`${data.decision.summary}`);
    }
}

function updateAIControlUI(enabled) {
    const btn = document.getElementById('aiControlToggle');
    const statusEl = document.getElementById('aiControlStatus');
    const triggerBtn = document.getElementById('aiTriggerBtn');
    
    if (enabled) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-power-off"></i> <span>Disable AI Control</span>';
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i> Active - AI is controlling devices';
        statusEl.style.color = '#10b981';
        triggerBtn.disabled = false;
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-power-off"></i> <span>Enable AI Control</span>';
        statusEl.innerHTML = 'Disabled';
        statusEl.style.color = '#a5b4fc';
        triggerBtn.disabled = true;
    }
}

function showAIAlert(data) {
    const alertsContainer = document.getElementById('alertsContainer');
    const iconClass = data.type === 'critical' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
    const alertHtml = `
        <div class="alert-item ai-alert ${data.type}" style="border-left: 4px solid ${data.type === 'critical' ? '#ef4444' : '#f59e0b'}; background: ${data.type === 'critical' ? '#fef2f2' : '#fffbeb'}; animation: slideIn 0.3s ease;">
            <i class="fas ${iconClass}" style="color: ${data.type === 'critical' ? '#ef4444' : '#f59e0b'}; font-size: 1.2rem;"></i>
            <div class="alert-content">
                <div class="alert-message"><strong>AI Monitor:</strong> ${data.message}</div>
                <div class="alert-time">${new Date(data.timestamp).toLocaleTimeString()}</div>
            </div>
        </div>
    `;
    alertsContainer.insertAdjacentHTML('afterbegin', alertHtml);
    
    // Also show as banner for critical alerts
    if (data.type === 'critical') {
        showAlertBanner(data.message);
    }
}

function showAnomalyAlert(data) {
    const iconClass = data.severity === 'critical' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
    const color = data.severity === 'critical' ? '#ef4444' : '#f59e0b';
    
    // Show notification
    showNotification(`${data.loadName}: ${data.message} - ${data.action}`, 'warning');
    
    // Add to alerts list
    const list = document.getElementById('alertsList');
    const noAlerts = list.querySelector('.no-alerts');
    if (noAlerts) noAlerts.remove();
    
    const alertEl = document.createElement('div');
    alertEl.className = `alert-item ${data.severity}`;
    alertEl.innerHTML = `
        <i class="fas ${iconClass}" style="color: ${color};"></i>
        <div class="alert-content">
            <p><strong>${data.loadName}</strong>: ${data.message}</p>
            <small style="opacity: 0.8;">AI Action: ${data.action}</small>
            <span>${new Date(data.timestamp).toLocaleTimeString()}</span>
        </div>
    `;
    list.insertBefore(alertEl, list.firstChild);
}

function showAIInsight(data) {
    // Add to chat or show as notification
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        const insightHtml = `
            <div class="chat-message assistant ai-insight" style="border-left: 3px solid #10b981; background: #ecfdf5;">
                <div class="message-avatar">💡</div>
                <div class="message-content">
                    <strong>AI Insight:</strong><br>
                    ${data.message}
                    <div class="message-time">${new Date(data.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', insightHtml);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Also show as toast notification
    showNotification(`💡 ${data.message}`, 'info');
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (connected) {
        status.classList.add('connected');
        status.classList.remove('disconnected');
        status.querySelector('span').textContent = 'Connected';
    } else {
        status.classList.remove('connected');
        status.classList.add('disconnected');
        status.querySelector('span').textContent = 'Disconnected';
    }
}

function updateMQTTStatus(connected, clientId = null) {
    const status = document.getElementById('mqttStatus');
    if (!status) return;
    
    if (connected) {
        status.classList.add('connected');
        status.classList.remove('disconnected');
        status.querySelector('span').textContent = clientId ? `MQTT: ${clientId}` : 'MQTT: Connected';
    } else {
        status.classList.remove('connected');
        status.classList.add('disconnected');
        status.querySelector('span').textContent = 'MQTT: Waiting';
    }
}

// =====================================================
// API Calls
// =====================================================

async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || 'demo-token'}`,
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        // Handle errors gracefully
        if (response.status === 401) {
            console.warn('Auth error - using demo mode');
            return data;
        }
        
        return data;
    } catch (error) {
        console.error('API call error:', error);
        return { error: error.message };
    }
}

async function loadInitialData() {
    try {
        console.log('Loading initial data...');
        
        // Always render 2 load cards for ESP32 (even with no data yet)
        const defaultLoads = [
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
        ];
        
        // Render load cards immediately
        console.log('✅ Rendering 2 load cards');
        renderLoadCards(defaultLoads);

        // Try to load ESP32 status for DHT11
        try {
            const esp32Status = await apiCall('/api/esp32/status');
            if (esp32Status.success && esp32Status.data) {
                if (esp32Status.data.dht11) {
                    updateESP32DHT11Display(esp32Status.data.dht11);
                }
            }
        } catch (err) {
            console.log('ESP32 status not available yet');
        }

        // Load alerts
        try {
            const alerts = await apiCall('/api/alerts?limit=20');
            if (alerts && !alerts.error) {
                renderAlerts(alerts);
            }
        } catch (err) {
            console.log('Alerts not available yet');
        }
        
        // Load chat history
        await loadChatHistory();
        
        console.log('Initial data loaded successfully');
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

// Load chat history for current user
async function loadChatHistory() {
    try {
        const response = await apiCall('/api/ai/chat/history');
        if (response.success && response.history && response.history.length > 0) {
            const messagesEl = document.getElementById('chatMessages');
            messagesEl.innerHTML = ''; // Clear welcome message
            
            response.history.forEach(msg => {
                // User message
                const userMsg = document.createElement('div');
                userMsg.className = 'chat-message user';
                userMsg.innerHTML = `<p>${escapeHtml(msg.query)}</p>`;
                messagesEl.appendChild(userMsg);
                
                // Bot response
                const botMsg = document.createElement('div');
                botMsg.className = 'chat-message bot';
                botMsg.innerHTML = `<p>${formatAIResponse(msg.response)}</p>`;
                messagesEl.appendChild(botMsg);
            });
            
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Clear chat history
async function clearChatHistory() {
    try {
        const response = await apiCall('/api/ai/chat/history', {
            method: 'DELETE'
        });
        
        if (response.success) {
            const messagesEl = document.getElementById('chatMessages');
            messagesEl.innerHTML = `
                <div class="chat-message bot">
                    <p>👋 Hi! I'm your Smart Energy AI Assistant. Ask me anything about your energy usage, devices, or get energy-saving tips!</p>
                </div>
            `;
            showNotification('Chat history cleared', 'success');
        }
    } catch (error) {
        console.error('Error clearing chat history:', error);
        showNotification('Failed to clear chat history', 'error');
    }
}

// =====================================================
// Render Functions
// =====================================================

function renderLoadCards(loads) {
    const grid = document.getElementById('loadsGrid');
    grid.innerHTML = '';

    loads.forEach(load => {
        const card = createLoadCard(load);
        grid.appendChild(card);
    });
}

function createLoadCard(load) {
    const card = document.createElement('div');
    card.className = `load-card ${load.is_on ? '' : 'off'}`;
    card.id = `load-${load.id}`;
    card.dataset.loadId = load.id;

    const iconClass = deviceIcons[load.device_type] || 'fa-plug';
    
    card.innerHTML = `
        <div class="load-card-header">
            <div class="load-info">
                <div class="load-icon ${load.device_type}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="load-name">
                    <h3>${load.name}</h3>
                    <span>${load.type} • ${load.device_type}</span>
                </div>
            </div>
            <div class="load-status">
                <span class="status-badge ${load.is_on ? 'on' : 'off'}">
                    ${load.is_on ? 'ON' : 'OFF'}
                </span>
                <span class="auto-badge ${load.auto_mode ? '' : 'hidden'}">
                    <i class="fas fa-robot"></i> Auto
                </span>
            </div>
        </div>
        
        <div class="gauges-grid">
            <div class="gauge">
                <div class="gauge-circle" id="voltage-gauge-${load.id}">
                    <span class="gauge-value" id="voltage-${load.id}">${(load.voltage || 0).toFixed(1)} V</span>
                </div>
                <div class="gauge-label">Voltage</div>
            </div>
            <div class="gauge">
                <div class="gauge-circle" id="current-gauge-${load.id}">
                    <span class="gauge-value" id="current-${load.id}">${(load.current || 0).toFixed(3)} A</span>
                </div>
                <div class="gauge-label">Current</div>
            </div>
            <div class="gauge">
                <div class="gauge-circle" id="power-gauge-${load.id}">
                    <span class="gauge-value" id="power-${load.id}">${(load.current_power || 0).toFixed(1)} W</span>
                </div>
                <div class="gauge-label">Power</div>
            </div>
        </div>
        
        <div class="metrics-row">
            <div class="metric">
                <div class="metric-value" id="energy-${load.id}">${(load.energy_kwh || 0).toFixed(4)}</div>
                <div class="metric-label">Energy (kWh)</div>
            </div>
            <div class="metric">
                <div class="metric-value cost" id="cost-${load.id}">$${(load.cost_today || 0).toFixed(4)}</div>
                <div class="metric-label">Cost</div>
            </div>
        </div>
        
        <div class="load-controls">
            <button class="control-btn ${load.is_on ? 'power-off' : 'power-on'}" 
                    onclick="toggleLoad(${load.id}, ${!load.is_on})">
                <i class="fas fa-power-off"></i>
                ${load.is_on ? 'Turn Off' : 'Turn On'}
            </button>
            <button class="control-btn auto ${load.auto_mode ? 'active' : ''}" 
                    onclick="toggleAutoMode(${load.id}, ${!load.auto_mode})">
                <i class="fas fa-robot"></i>
                Auto
            </button>
        </div>
    `;
    
    // Set initial gauge values after card is created
    setTimeout(() => {
        const maxVoltage = 250;
        const maxCurrent = load.id === 1 ? 2 : 0.5;
        const maxPower = load.id === 1 ? 120 : 15;
        
        updateGauge(load.id, 'voltage', load.voltage || 0, maxVoltage);
        updateGauge(load.id, 'current', load.current || 0, maxCurrent);
        updateGauge(load.id, 'power', load.current_power || 0, maxPower);
    }, 50);

    return card;
}
            <button class="control-btn auto ${load.auto_mode ? 'active' : ''}" 
                    onclick="toggleAutoMode(${load.id}, ${!load.auto_mode})">
                <i class="fas fa-robot"></i>
                Auto
            </button>
        </div>
    `;

    return card;
}

function updateDashboard(data) {
    let totalPower = 0;
    let totalEnergy = 0;
    let totalCost = 0;
    let activeCount = 0;

    data.forEach(loadData => {
        const { loadId, telemetry, isOn, autoMode, name, deviceType } = loadData;

        // Update gauges
        updateGauge(loadId, 'voltage', telemetry.voltage, deviceType === 'fan' ? 14 : 240);
        updateGauge(loadId, 'current', telemetry.current, deviceType === 'heater' ? 12 : 3);
        updateGauge(loadId, 'power', telemetry.power, deviceType === 'heater' ? 2500 : 100);

        // Update text values
        document.getElementById(`voltage-${loadId}`).textContent = `${telemetry.voltage.toFixed(1)} V`;
        document.getElementById(`current-${loadId}`).textContent = `${telemetry.current.toFixed(3)} A`;
        document.getElementById(`power-${loadId}`).textContent = `${telemetry.power.toFixed(1)} W`;
        document.getElementById(`energy-${loadId}`).textContent = telemetry.energy.toFixed(4);
        document.getElementById(`cost-${loadId}`).textContent = `$${telemetry.cost.toFixed(4)}`;

        // Update card state
        const card = document.getElementById(`load-${loadId}`);
        if (card) {
            card.className = `load-card ${isOn ? '' : 'off'}`;
            
            const statusBadge = card.querySelector('.status-badge');
            statusBadge.className = `status-badge ${isOn ? 'on' : 'off'}`;
            statusBadge.textContent = isOn ? 'ON' : 'OFF';

            const autoBadge = card.querySelector('.auto-badge');
            autoBadge.classList.toggle('hidden', !autoMode);

            const powerBtn = card.querySelector('.control-btn:first-child');
            powerBtn.className = `control-btn ${isOn ? 'power-off' : 'power-on'}`;
            powerBtn.innerHTML = `<i class="fas fa-power-off"></i> ${isOn ? 'Turn Off' : 'Turn On'}`;
            powerBtn.onclick = () => toggleLoad(loadId, !isOn);

            const autoBtn = card.querySelector('.control-btn.auto');
            autoBtn.classList.toggle('active', autoMode);
            autoBtn.onclick = () => toggleAutoMode(loadId, !autoMode);
        }

        // Accumulate totals
        if (isOn) {
            totalPower += telemetry.power;
            activeCount++;
        }
        totalEnergy += telemetry.energy;
        totalCost += telemetry.cost;

        // Store history for charts (keep last 60 points = ~3 minutes)
        if (!telemetryHistory[loadId]) telemetryHistory[loadId] = [];
        telemetryHistory[loadId].push({
            time: new Date(),
            ...telemetry
        });
        // Keep last 60 points for better trend visualization
        if (telemetryHistory[loadId].length > 60) {
            telemetryHistory[loadId].shift();
        }
    });

    // Update summary cards
    document.getElementById('totalPower').textContent = `${totalPower.toFixed(1)} W`;
    document.getElementById('totalEnergy').textContent = `${totalEnergy.toFixed(4)} kWh`;
    document.getElementById('totalCost').textContent = `$${totalCost.toFixed(4)}`;
    document.getElementById('activeLoads').textContent = `${activeCount} / 3`;

    // Update charts
    updateCharts(selectedLoadId);
}

function updateGauge(loadId, metric, value, max) {
    const gauge = document.getElementById(`${metric}-gauge-${loadId}`);
    if (!gauge) {
        console.warn(`Gauge not found: ${metric}-gauge-${loadId}`);
        return;
    }

    const percentage = Math.min((value / max) * 100, 100);
    const degrees = (percentage / 100) * 360;
    
    // Update gauge background with smooth animation
    gauge.style.background = `conic-gradient(
        #3b82f6 ${degrees}deg, 
        #0f172a ${degrees}deg
    )`;
    
    // Add warning/danger classes based on percentage
    gauge.classList.remove('warning', 'danger');
    if (percentage > 90) {
        gauge.classList.add('danger');
    } else if (percentage > 75) {
        gauge.classList.add('warning');
    }
    
    // Update the value text
    const valueEl = document.getElementById(`${metric}-${loadId}`);
    if (valueEl) {
        if (metric === 'voltage') {
            valueEl.textContent = `${value.toFixed(1)} V`;
        } else if (metric === 'current') {
            valueEl.textContent = `${value.toFixed(3)} A`;
        } else if (metric === 'power') {
            valueEl.textContent = `${value.toFixed(1)} W`;
        }
    }
}

function updateLoadCard(loadId, data) {
    const card = document.getElementById(`load-${loadId}`);
    if (!card) return;

    if (data.isOn !== undefined) {
        card.className = `load-card ${data.isOn ? '' : 'off'}`;
        const statusBadge = card.querySelector('.status-badge');
        statusBadge.className = `status-badge ${data.isOn ? 'on' : 'off'}`;
        statusBadge.textContent = data.isOn ? 'ON' : 'OFF';
    }

    if (data.autoMode !== undefined) {
        const autoBadge = card.querySelector('.auto-badge');
        autoBadge.classList.toggle('hidden', !data.autoMode);
        const autoBtn = card.querySelector('.control-btn.auto');
        autoBtn.classList.toggle('active', data.autoMode);
    }
}

// =====================================================
// Charts
// =====================================================

function initializeCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        animation: false,
        scales: {
            x: {
                type: 'category',
                display: true,
                grid: { 
                    color: 'rgba(255,255,255,0.05)',
                    drawOnChartArea: true
                },
                ticks: { 
                    color: '#64748b',
                    maxTicksLimit: 8,
                    autoSkip: true,
                    maxRotation: 0,
                    font: { size: 10 }
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                grid: { 
                    color: 'rgba(255,255,255,0.05)',
                    drawOnChartArea: true
                },
                ticks: { 
                    color: '#64748b',
                    font: { size: 10 }
                },
                beginAtZero: true
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'index',
                intersect: false
            }
        },
        elements: {
            line: { borderWidth: 2, tension: 0.3 },
            point: { radius: 0, hitRadius: 5, hoverRadius: 3 }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };

    const metrics = ['power', 'voltage', 'current', 'energy'];
    const colors = {
        power: '#3b82f6',
        voltage: '#10b981',
        current: '#f59e0b',
        energy: '#8b5cf6'
    };

    metrics.forEach(metric => {
        const ctx = document.getElementById(`${metric}Chart`).getContext('2d');
        charts[metric] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: colors[metric],
                    backgroundColor: `${colors[metric]}20`,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: chartOptions
        });
    });
}

function updateCharts(loadId) {
    const history = telemetryHistory[loadId] || [];
    if (history.length === 0) return;
    
    // Format with date and 12-hour time (e.g., 1/19 12:24 PM)
    const labels = history.map(h => {
        const d = h.time;
        const month = d.getMonth() + 1;
        const day = d.getDate();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${month}/${day} ${hours}:${minutes} ${ampm}`;
    });

    ['power', 'voltage', 'current', 'energy'].forEach(metric => {
        if (charts[metric]) {
            charts[metric].data.labels = labels;
            charts[metric].data.datasets[0].data = history.map(h => h[metric]);
            charts[metric].update();
        }
    });
}

// =====================================================
// Alerts
// =====================================================

function renderAlerts(alerts) {
    const list = document.getElementById('alertsList');
    
    if (alerts.length === 0) {
        list.innerHTML = '<p class="no-alerts">No recent alerts</p>';
        return;
    }

    list.innerHTML = alerts.map(alert => {
        const icon = alert.alert_type === 'critical' ? 'fa-exclamation-circle' : 
                     alert.alert_type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        const iconEmoji = alert.alert_type === 'critical' ? '🚨' : 
                          alert.alert_type === 'warning' ? '⚠️' : 'ℹ️';
        const time = new Date(alert.created_at);
        const timeStr = time.toLocaleTimeString() + ', ' + time.toLocaleDateString();
        
        return `
            <div class="alert-item ${alert.alert_type}">
                <i class="fas ${icon}"></i>
                <div class="alert-content">
                    <p><strong>${alert.load_name || 'System'}</strong>: ${alert.message}</p>
                    ${alert.value ? `<small style="opacity: 0.8;">Value: ${parseFloat(alert.value).toFixed(2)}${alert.metric === 'voltage' ? 'V' : alert.metric === 'current' ? 'A' : alert.metric === 'power' ? 'W' : ''} | Threshold: ${parseFloat(alert.threshold_value || 0).toFixed(2)}${alert.metric === 'voltage' ? 'V' : alert.metric === 'current' ? 'A' : alert.metric === 'power' ? 'W' : ''}</small>` : ''}
                    <span>${timeStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

function addAlert(alert) {
    const list = document.getElementById('alertsList');
    const noAlerts = list.querySelector('.no-alerts');
    if (noAlerts) noAlerts.remove();

    const icon = alert.alert_type === 'critical' ? 'fa-exclamation-circle' : 
                 alert.alert_type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    const time = new Date(alert.created_at);
    const timeStr = time.toLocaleTimeString() + ', ' + time.toLocaleDateString();
    
    const alertEl = document.createElement('div');
    alertEl.className = `alert-item ${alert.alert_type}`;
    alertEl.innerHTML = `
        <i class="fas ${icon}"></i>
        <div class="alert-content">
            <p><strong>${alert.load_name || 'System'}</strong>: ${alert.message}</p>
            ${alert.value ? `<small style="opacity: 0.8;">Value: ${parseFloat(alert.value).toFixed(2)}${alert.metric === 'voltage' ? 'V' : alert.metric === 'current' ? 'A' : alert.metric === 'power' ? 'W' : ''} | Threshold: ${parseFloat(alert.threshold_value || 0).toFixed(2)}${alert.metric === 'voltage' ? 'V' : alert.metric === 'current' ? 'A' : alert.metric === 'power' ? 'W' : ''}</small>` : ''}
            <span>${timeStr}</span>
        </div>
    `;
    list.insertBefore(alertEl, list.firstChild);
}

function showAlertBanner(message) {
    const banner = document.getElementById('alertBanner');
    document.getElementById('alertMessage').textContent = message;
    banner.classList.remove('hidden');
}

// =====================================================
// Load Control
// =====================================================

async function toggleLoad(loadId, turnOn) {
    try {
        const result = await apiCall(`/api/loads/${loadId}/control`, {
            method: 'POST',
            body: JSON.stringify({ action: turnOn ? 'on' : 'off' })
        });

        if (result.blocked) {
            showNotification(`Action blocked: ${result.reason}`, 'warning');
        } else if (result.aiWarnings?.length > 0) {
            showNotification(`Warning: ${result.aiWarnings.join(', ')}`, 'warning');
        }
    } catch (error) {
        console.error('Control error:', error);
        showNotification('Failed to control load', 'error');
    }
}

async function toggleAutoMode(loadId, enabled) {
    try {
        await apiCall(`/api/loads/${loadId}/auto-mode`, {
            method: 'POST',
            body: JSON.stringify({ enabled })
        });
    } catch (error) {
        console.error('Auto mode error:', error);
        showNotification('Failed to toggle auto mode', 'error');
    }
}

// =====================================================
// AI Chatbot
// =====================================================

function toggleChatbot() {
    const popup = document.getElementById('chatbotPopup');
    popup.classList.toggle('hidden');
    if (!popup.classList.contains('hidden')) {
        document.getElementById('chatInput').focus();
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    const messagesEl = document.getElementById('chatMessages');

    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.innerHTML = `<p>${escapeHtml(message)}</p>`;
    messagesEl.appendChild(userMsg);

    // Clear input
    input.value = '';

    // Add loading indicator
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'chat-message bot loading';
    loadingMsg.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(loadingMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        const response = await apiCall('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });

        // Remove loading
        loadingMsg.remove();

        // Handle auth error - only if not just logged in
        if (response.authError && !justLoggedIn) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'chat-message bot';
            errorMsg.innerHTML = '<p>⚠️ Session expired. Please login again.</p>';
            messagesEl.appendChild(errorMsg);
            return;
        }

        // Add bot response
        const botMsg = document.createElement('div');
        botMsg.className = 'chat-message bot';
        
        if (response.success) {
            botMsg.innerHTML = `<p>${formatAIResponse(response.response)}</p>`;
            if (response.agents) {
                botMsg.innerHTML += `<div class="chat-meta" style="font-size: 0.7em; color: #888; margin-top: 5px;">🤖 Agents: ${response.agents.join(', ')}</div>`;
            }
        } else {
            botMsg.innerHTML = `<p>⚠️ ${response.error || 'Unable to get response. Please try again.'}</p>`;
        }
        messagesEl.appendChild(botMsg);
    } catch (error) {
        loadingMsg.remove();
        const errorMsg = document.createElement('div');
        errorMsg.className = 'chat-message bot';
        errorMsg.innerHTML = '<p>⚠️ Connection error. Please check if the server is running.</p>';
        messagesEl.appendChild(errorMsg);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatAIResponse(text) {
    // Simple markdown-like formatting
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// Utilities
// =====================================================

function showNotification(message, type = 'info') {
    // Simple notification - you can enhance this
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (type === 'warning' || type === 'error') {
        showAlertBanner(message);
    }
}

// =====================================================
// Event Listeners
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Dashboard initializing...');
    
    // Update user info in header
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userRole').textContent = currentUser.role;
    }

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Alert banner dismiss
    document.getElementById('dismissAlert').addEventListener('click', () => {
        document.getElementById('alertBanner').classList.add('hidden');
    });

    // Chart tabs
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            selectedLoadId = parseInt(tab.dataset.load);
            updateCharts(selectedLoadId);
        });
    });

    // Chatbot
    document.getElementById('chatbotBtn').addEventListener('click', toggleChatbot);
    document.getElementById('closeChatbot').addEventListener('click', toggleChatbot);
    document.getElementById('sendChat').addEventListener('click', sendChatMessage);
    document.getElementById('clearChatBtn').addEventListener('click', clearChatHistory);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // AI Control Buttons
    document.getElementById('aiControlToggle').addEventListener('click', toggleAIControl);
    document.getElementById('aiTriggerBtn').addEventListener('click', triggerAIDecision);

    // Initialize dashboard
    initializeWebSocket();
    loadInitialData().catch(function(err) { console.error('Error loading data:', err); });
    initializeCharts();
    loadAIControlStatus().catch(function(err) { console.error('Error loading AI status:', err); });
});

// =====================================================
// AI Autonomous Control Functions
// =====================================================

let aiControlEnabled = false;

async function toggleAIControl() {
    const btn = document.getElementById('aiControlToggle');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Processing...</span>';
    
    try {
        const newState = !aiControlEnabled;
        const response = await apiCall('/api/ai/control/toggle', {
            method: 'POST',
            body: JSON.stringify({ enabled: newState })
        });
        
        // Handle auth error - only if not just logged in
        if (response.authError && !justLoggedIn) {
            showNotification('Session expired. Please login again.', 'error');
            updateAIControlUI(false);
            btn.disabled = false;
            return;
        }
        
        // Handle API error
        if (response.error) {
            showNotification(response.error, 'error');
            updateAIControlUI(aiControlEnabled);
            btn.disabled = false;
            return;
        }
        
        aiControlEnabled = response.enabled;
        updateAIControlUI(aiControlEnabled);
        
        if (response.initialDecision) {
            showAIDecision({ decision: response.initialDecision, results: response.results, timestamp: new Date().toISOString() });
        }
        
        // Show notification
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            const msgHtml = `
                <div class="chat-message assistant" style="border-left: 3px solid #6366f1; background: #1e1b4b;">
                    <div class="message-content">
                        <strong>🤖 AI Control ${aiControlEnabled ? 'Enabled' : 'Disabled'}</strong><br>
                        ${response.message || (aiControlEnabled ? 'I am now in control of all devices. I will make smart decisions to optimize energy usage and ensure safety.' : 'Manual control restored. You can now control devices manually.')}
                    </div>
                </div>
            `;
            chatMessages.insertAdjacentHTML('beforeend', msgHtml);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        showNotification(`AI Control ${aiControlEnabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
        console.error('Error toggling AI control:', error);
        showNotification('Failed to toggle AI control. Check server connection.', 'error');
    }
    
    btn.disabled = false;
}

async function triggerAIDecision() {
    const btn = document.getElementById('aiTriggerBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Analyzing...</span>';
    
    try {
        const response = await apiCall('/api/ai/control/trigger', {
            method: 'POST'
        });
        
        // Handle auth error - only if not just logged in
        if (response.authError && !justLoggedIn) {
            showNotification('Session expired. Please login again.', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-bolt"></i> <span>Trigger Decision</span>';
            return;
        }
        
        if (response.success) {
            showAIDecision({ decision: response.decision, results: response.results, timestamp: new Date().toISOString() });
        } else {
            showNotification(response.error || 'AI decision failed', 'error');
        }
    } catch (error) {
        console.error('Error triggering AI decision:', error);
        showNotification('Failed to trigger AI decision', 'error');
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-bolt"></i> <span>Trigger Decision</span>';
}

async function loadAIControlStatus() {
    try {
        const status = await apiCall('/api/ai/control/status');
        
        // Handle auth error silently on page load
        if (status.authError) {
            aiControlEnabled = false;
            updateAIControlUI(false);
            return;
        }
        
        aiControlEnabled = status.enabled;
        updateAIControlUI(aiControlEnabled);
        
        if (status.lastDecision) {
            showAIDecision({ decision: status.lastDecision, results: [], timestamp: status.lastDecision.timestamp });
        }
    } catch (error) {
        console.error('Error loading AI control status:', error);
    }
}

// =====================================================
// ESP32 Functions
// =====================================================

// ESP32 data state
let esp32Data = {
    load1: { voltage: 0, current: 0, power: 0, relay_state: false },
    load2: { voltage: 0, current: 0, power: 0, relay_state: false },
    dht11: { temperature: 0, humidity: 0 }
};

function setupESP32SocketListeners() {
    if (!socket) return;
    
    console.log('📡 Setting up ESP32 socket listeners...');
    
    // ESP32 Load updates
    socket.on('esp32:load_update', function(data) {
        console.log('📊 ESP32 Load Update:', data);
        
        // Update the electrical load card
        const loadId = data.load_number;
        
        // Determine max values based on load
        const maxVoltage = 250;
        const maxCurrent = loadId === 1 ? 2.0 : 0.5;
        const maxPower = loadId === 1 ? 120 : 15;
        
        // Update gauges with actual values
        updateGauge(loadId, 'voltage', data.voltage, maxVoltage);
        updateGauge(loadId, 'current', data.current, maxCurrent);
        updateGauge(loadId, 'power', data.power, maxPower);
        
        // Update energy and cost if available
        const energyEl = document.getElementById(`energy-${loadId}`);
        const costEl = document.getElementById(`cost-${loadId}`);
        if (energyEl) energyEl.textContent = (data.energy || 0).toFixed(4);
        if (costEl) costEl.textContent = `$${(data.cost || 0).toFixed(4)}`;
        
        // Update relay status in card
        const card = document.getElementById(`load-${loadId}`);
        if (card) {
            card.className = `load-card ${data.relay_state ? '' : 'off'}`;
            
            const statusBadge = card.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.className = `status-badge ${data.relay_state ? 'on' : 'off'}`;
                statusBadge.textContent = data.relay_state ? 'ON' : 'OFF';
            }
            
            const powerBtn = card.querySelector('.control-btn:first-child');
            if (powerBtn) {
                powerBtn.className = `control-btn ${data.relay_state ? 'power-off' : 'power-on'}`;
                powerBtn.innerHTML = `<i class="fas fa-power-off"></i> ${data.relay_state ? 'Turn Off' : 'Turn On'}`;
            }
        }
        
        // Update summary cards
        updateSummaryCards();
        updateESP32LastUpdate();
    });
    
    // ESP32 DHT11 data
    socket.on('esp32:dht11_update', function(data) {
        console.log('🌡️ ESP32 DHT11 Update:', data);
        updateESP32DHT11Display(data);
        updateESP32LastUpdate();
    });
    
    // ESP32 relay state changes
    socket.on('esp32:relay_status', function(data) {
        console.log('🔌 ESP32 Relay Status:', data);
        const card = document.getElementById(`load-${data.load_number}`);
        if (card) {
            card.className = `load-card ${data.relay_state ? '' : 'off'}`;
            
            const statusBadge = card.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.className = `status-badge ${data.relay_state ? 'on' : 'off'}`;
                statusBadge.textContent = data.relay_state ? 'ON' : 'OFF';
            }
        }
    });
    
    console.log('✅ ESP32 socket listeners ready');
}

function updateSummaryCards() {
    let totalPower = 0;
    let totalEnergy = 0;
    let activeLoads = 0;
    
    // Calculate totals from all load cards
    for (let i = 1; i <= 2; i++) {
        const powerEl = document.getElementById(`power-${i}`);
        const energyEl = document.getElementById(`energy-${i}`);
        const card = document.getElementById(`load-${i}`);
        
        if (powerEl) {
            const power = parseFloat(powerEl.textContent) || 0;
            totalPower += power;
        }
        
        if (energyEl) {
            const energy = parseFloat(energyEl.textContent) || 0;
            totalEnergy += energy;
        }
        
        if (card && !card.classList.contains('off')) {
            activeLoads++;
        }
    }
    
    // Update summary display
    const totalPowerEl = document.getElementById('totalPower');
    const totalEnergyEl = document.getElementById('totalEnergy');
    const totalCostEl = document.getElementById('totalCost');
    const activeLoadsEl = document.getElementById('activeLoads');
    
    if (totalPowerEl) totalPowerEl.textContent = `${totalPower.toFixed(1)} W`;
    if (totalEnergyEl) totalEnergyEl.textContent = `${totalEnergy.toFixed(4)} kWh`;
    if (totalCostEl) totalCostEl.textContent = `$${(totalEnergy * 0.12).toFixed(4)}`; // $0.12 per kWh
    if (activeLoadsEl) activeLoadsEl.textContent = `${activeLoads} / 2`;
}

function updateESP32DHT11Display(data) {
    const tempEl = document.getElementById('esp32Temperature');
    const humidityEl = document.getElementById('esp32Humidity');
    
    if (tempEl) tempEl.textContent = `${data.temperature.toFixed(1)} °C`;
    if (humidityEl) humidityEl.textContent = `${data.humidity.toFixed(1)} %`;
}

function updateESP32LastUpdate() {
    const lastUpdateEl = document.getElementById('esp32LastUpdate');
    if (lastUpdateEl) {
        lastUpdateEl.textContent = new Date().toLocaleTimeString();
    }
}

async function toggleLoad(loadId, turnOn) {
    try {
        console.log(`🔌 Toggling Load ${loadId} to ${turnOn ? 'ON' : 'OFF'}`);
        
        const response = await apiCall(`/api/loads/${loadId}/control`, {
            method: 'POST',
            body: JSON.stringify({ state: turnOn ? 'ON' : 'OFF' })
        });
        
        if (response.success) {
            showNotification(`Load ${loadId} turned ${turnOn ? 'ON' : 'OFF'}`, 'success');
            
            // Immediately update UI for better responsiveness
            const card = document.getElementById(`load-${loadId}`);
            if (card) {
                card.className = `load-card ${turnOn ? '' : 'off'}`;
                
                const statusBadge = card.querySelector('.status-badge');
                if (statusBadge) {
                    statusBadge.className = `status-badge ${turnOn ? 'on' : 'off'}`;
                    statusBadge.textContent = turnOn ? 'ON' : 'OFF';
                }
                
                const powerBtn = card.querySelector('.control-btn:first-child');
                if (powerBtn) {
                    powerBtn.className = `control-btn ${turnOn ? 'power-off' : 'power-on'}`;
                    powerBtn.innerHTML = `<i class="fas fa-power-off"></i> ${turnOn ? 'Turn Off' : 'Turn On'}`;
                }
            }
        } else {
            showNotification(response.error || 'Failed to control load', 'error');
        }
    } catch (error) {
        console.error('Error toggling load:', error);
        showNotification('Failed to control load - check connection', 'error');
    }
}

async function toggleAutoMode(loadId, enable) {
    try {
        const response = await apiCall(`/api/loads/${loadId}/auto-mode`, {
            method: 'POST',
            body: JSON.stringify({ enabled: enable })
        });
        
        if (response.success) {
            const card = document.getElementById(`load-${loadId}`);
            if (card) {
                const autoBadge = card.querySelector('.auto-badge');
                const autoBtn = card.querySelector('.control-btn.auto');
                
                if (autoBadge) {
                    autoBadge.classList.toggle('hidden', !enable);
                }
                if (autoBtn) {
                    autoBtn.classList.toggle('active', enable);
                }
            }
            showNotification(`Auto mode ${enable ? 'enabled' : 'disabled'}`, 'success');
        }
    } catch (error) {
        console.error('Error toggling auto mode:', error);
        showNotification('Failed to toggle auto mode', 'error');
    }
}