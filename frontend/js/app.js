/**
 * Smart Load Dashboard - Main Application
 * Handles UI interactions, WebSocket, and data display
 */

// =====================================================
// Configuration & State
// =====================================================

const API_URL = window.location.origin;
const WS_URL = window.location.origin;

let socket = null;
let authToken = null;
let currentUser = null;
let charts = {};
let selectedLoadId = 1;
let telemetryHistory = { 1: [], 2: [], 3: [] };
let justLoggedIn = false; // Flag to prevent false "session expired" messages

// Device icons mapping
const deviceIcons = {
    fan: 'fa-fan',
    bulb: 'fa-lightbulb',
    heater: 'fa-fire'
};

// =====================================================
// Authentication
// =====================================================

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

async function login(username, password) {
    try {
        // Clear any existing tokens first
        authToken = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            // Set flag FIRST to prevent false session expired messages
            justLoggedIn = true;
            
            // Then set token and user
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            document.getElementById('userName').textContent = currentUser.name;
            document.getElementById('userRole').textContent = currentUser.role;
            document.getElementById('loginError').textContent = '';
            
            // Hide any alert banners from previous session
            document.getElementById('alertBanner').classList.add('hidden');
            
            // Show dashboard and initialize
            showDashboard();
            initializeWebSocket();
            
            // Small delay to ensure token is propagated
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await loadInitialData();
            initializeCharts();
            await loadAIControlStatus();
            
            // Clear flag after everything is loaded (5 seconds to be safe)
            setTimeout(() => { justLoggedIn = false; }, 5000);
        } else {
            document.getElementById('loginError').textContent = data.message || 'Login failed';
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Connection error. Is the server running?';
        console.error('Login error:', error);
    }
}

function logout() {
    // Clear flag
    justLoggedIn = false;
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    
    if (socket) {
        socket.disconnect();
    }
    
    showLogin();
    document.getElementById('loginError').textContent = '';
}

async function checkAuth() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    
    if (token && user) {
        // Validate token with server before proceeding
        try {
            const response = await fetch(`${API_URL}/api/auth/validate`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                authToken = token;
                currentUser = JSON.parse(user);
                
                document.getElementById('userName').textContent = currentUser.name;
                document.getElementById('userRole').textContent = currentUser.role;
                
                showDashboard();
                initializeWebSocket();
                loadInitialData();
                initializeCharts();
                loadAIControlStatus();
            } else {
                // Token invalid - clear and show login (silently, no notification)
                console.log('Session expired - please login again');
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                showLogin();
            }
        } catch (error) {
            // Server not reachable - clear token and show login (silently)
            console.log('Cannot connect to server');
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            showLogin();
        }
    } else {
        showLogin();
    }
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
    });

    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
    });

    socket.on('authenticated', (data) => {
        if (data.success) {
            console.log('WebSocket authenticated');
        }
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

// =====================================================
// API Calls
// =====================================================

async function apiCall(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            ...options.headers
        }
    });
    
    const data = await response.json();
    
    // Handle authentication errors - re-login required
    if (response.status === 401) {
        console.error('Authentication error:', data.error);
        // Only show notification if we didn't just log in (to avoid false positives)
        if (!justLoggedIn) {
            showNotification('Session expired. Please login again.', 'error');
            logout();
        }
        return { error: data.error, authError: true };
    }
    
    return data;
}

async function loadInitialData() {
    try {
        console.log('Loading initial data...');
        
        // Load loads
        const loads = await apiCall('/api/loads');
        if (loads.error && !loads.authError) {
            console.error('Error loading loads:', loads.error);
            return;
        }
        if (loads && !loads.error) {
            renderLoadCards(loads);
        }

        // Load alerts
        const alerts = await apiCall('/api/alerts?limit=20');
        if (alerts.error && !alerts.authError) {
            console.error('Error loading alerts:', alerts.error);
            return;
        }
        if (alerts && !alerts.error) {
            renderAlerts(alerts);
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
                    <span class="gauge-value" id="voltage-${load.id}">0 V</span>
                </div>
                <div class="gauge-label">Voltage</div>
            </div>
            <div class="gauge">
                <div class="gauge-circle" id="current-gauge-${load.id}">
                    <span class="gauge-value" id="current-${load.id}">0 A</span>
                </div>
                <div class="gauge-label">Current</div>
            </div>
            <div class="gauge">
                <div class="gauge-circle" id="power-gauge-${load.id}">
                    <span class="gauge-value" id="power-${load.id}">0 W</span>
                </div>
                <div class="gauge-label">Power</div>
            </div>
        </div>
        
        <div class="metrics-row">
            <div class="metric">
                <div class="metric-value" id="energy-${load.id}">0.000</div>
                <div class="metric-label">Energy (kWh)</div>
            </div>
            <div class="metric">
                <div class="metric-value" id="cost-${load.id}">$0.0000</div>
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
    if (!gauge) return;

    const percentage = Math.min((value / max) * 100, 100);
    const degrees = (percentage / 100) * 360;
    
    gauge.style.background = `conic-gradient(var(--primary) ${degrees}deg, var(--darker) ${degrees}deg)`;
    
    // Add warning/danger classes
    if (percentage > 90) {
        gauge.classList.add('danger');
        gauge.classList.remove('warning');
    } else if (percentage > 75) {
        gauge.classList.add('warning');
        gauge.classList.remove('danger');
    } else {
        gauge.classList.remove('warning', 'danger');
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

document.addEventListener('DOMContentLoaded', () => {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        login(username, password);
    });

    // Logout
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

    // Check auth on load
    checkAuth();
    
    // Load AI control status
    loadAIControlStatus();
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
