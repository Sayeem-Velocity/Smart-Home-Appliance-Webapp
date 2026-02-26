/**
 * Smart Load Dashboard - Main JavaScript
 * ESP32 Real-time Monitoring with Socket.IO
 */

// ============================================
// Global Variables
// ============================================
let socket = null;
let powerChart = null;
let vcChart = null;
let energyHistoryChart = null;
let loadDistributionChart = null;
let temperatureChart = null;

// Data Storage
const dataHistory = {
    load1: { voltage: [], current: [], power: [], timestamps: [] },
    load2: { voltage: [], current: [], power: [], timestamps: [] },
    environment: { temperature: [], humidity: [], timestamps: [] }
};

const MAX_DATA_POINTS = 60;

// Current readings
let currentData = {
    load1: { voltage: 0, current: 0, power: 0, relay: false, connected: false },
    load2: { voltage: 0, current: 0, power: 0, relay: false, connected: false },
    environment: { temperature: 0, humidity: 0 }
};

// Load detection thresholds
const LOAD_DETECTION = {
    minPower: 1.0,      // Minimum power to consider load connected (W)
    minCurrent: 0.01,   // Minimum current to consider load connected (A)
    minVoltage: 50      // Minimum voltage to consider system powered (V)
};

// Database records storage
let databaseRecords = [];
let currentPage = 1;
const recordsPerPage = 15;

// AI Control state
let aiControlEnabled = false;
let esp32Connected = false;

// Control Mode: 'auto' = temperature-based, 'manual' = user ON/OFF buttons
let controlMode = 'auto';  // Default to AUTO mode (temperature control)

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Dashboard initializing...');
    
    // Load user info
    loadUserInfo();
    
    // Initialize Socket.IO
    initializeSocket();
    
    // Initialize Charts
    initializeCharts();
    
    // Initialize Gauges
    initializeAllGauges();
    
    // Setup Navigation
    setupNavigation();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Start Clock
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Load initial database data
    loadDatabaseTable();
    
    // Initialize control mode to AUTO
    setControlMode('auto');
    
    // Initialize AI model switcher
    initModelSwitcher();
    
    console.log('✅ Dashboard initialized');
});

// ============================================
// User Info
// ============================================
function loadUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const usernameEl = document.getElementById('username');
    if (usernameEl && user.username) {
        usernameEl.textContent = user.username;
    }
}

// ============================================
// Socket.IO Connection
// ============================================
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Socket.IO Connected');
        updateConnectionStatus(true);
        showToast('Connected to server', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket.IO Disconnected');
        updateConnectionStatus(false);
        showToast('Disconnected from server', 'error');
    });
    
    // ESP32 Load Data
    socket.on('esp32:load_update', (data) => {
        console.log('📊 Load Data received:', data);
        console.log('   Load Number:', data.load_number || data.load_id || data.loadId);
        console.log('   Voltage:', data.voltage, 'Current:', data.current, 'Power:', data.power);
        console.log('   Relay State:', data.relay_state || data.relay);
        handleLoadUpdate(data);
    });
    
    // ESP32 DHT11 Data
    socket.on('esp32:dht11_update', (data) => {
        console.log('🌡️ DHT11 Data:', data);
        handleDHT11Update(data);
    });
    
    // Relay State Update
    socket.on('esp32:relay_update', (data) => {
        console.log('🔌 Relay Update:', data);
        handleRelayUpdate(data);
    });
    
    // ESP32 Connection Status
    socket.on('esp32:status', (data) => {
        console.log('📡 ESP32 Status:', data);
        if (data.connected) {
            addAlert('ESP32 connected via MQTT', 'success');
        } else {
            addAlert('ESP32 disconnected', 'warning');
        }
    });
    
    // Relay status feedback from ESP32
    socket.on('esp32:relay_status', (data) => {
        console.log('🔌 Relay Status from ESP32:', data);
        const loadNum = data.load_number;
        const isOn = data.relay_state === true || data.relay_state === 'true';
        currentData[`load${loadNum}`].relay = isOn;
        updateRelayStatus(loadNum, isOn);
        updateButtonStates(loadNum, isOn);
        updateRelayHardwareStatus(loadNum, isOn);
    });
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    
    if (connected) {
        dot.classList.remove('disconnected');
        dot.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        dot.classList.remove('connected');
        dot.classList.add('disconnected');
        text.textContent = 'Disconnected';
    }
}

// ============================================
// Data Handlers
// ============================================
function handleLoadUpdate(data) {
    const loadNum = data.load_number || data.load_id || data.loadId || 1;
    const loadKey = `load${loadNum}`;
    
    const voltage = parseFloat(data.voltage) || 0;
    const current = parseFloat(data.current) || 0;
    const power = parseFloat(data.power) || 0;
    const relay = data.relay_state === true || data.relay_state === 'true' || data.relay === true || data.relay === 'true';
    
    // Detect if load is connected (plugged in) based on power/current readings
    const wasConnected = currentData[loadKey].connected;
    const isConnected = detectLoadConnected(voltage, current, power);
    
    // Update current data
    currentData[loadKey] = {
        voltage: voltage,
        current: current,
        power: power,
        relay: relay,
        connected: isConnected
    };
    
    // Handle load connection state change
    if (isConnected && !wasConnected) {
        // Load just got plugged in - show notification and auto-turn ON
        showLoadConnectedNotification(loadNum);
        
        // Auto-turn ON the relay when load is plugged in
        if (!relay) {
            console.log(`🔌 Auto-turning ON Load ${loadNum}`);
            setTimeout(() => {
                toggleLoad(loadNum, true);
            }, 500); // Small delay for smooth UX
        }
    } else if (!isConnected && wasConnected) {
        // Load got unplugged - show notification and auto-turn OFF
        showLoadDisconnectedNotification(loadNum);
        
        // Auto-turn OFF the relay when load is unplugged
        if (relay) {
            console.log(`🔌 Auto-turning OFF Load ${loadNum}`);
            setTimeout(() => {
                toggleLoad(loadNum, false);
            }, 500);
        }
    }
    
    // Update connection status indicator
    updateLoadConnectionStatus(loadNum, isConnected);
    
    // Update UI
    updateLoadDisplay(loadNum, currentData[loadKey]);
    
    // Add to history
    const timestamp = new Date().toLocaleTimeString();
    addToHistory(loadKey, currentData[loadKey], timestamp);
    
    // Update charts
    updateCharts();
    
    // Update totals
    updateTotals();
    
    // Check for alerts
    checkAlerts(loadNum, currentData[loadKey]);
    
    // Update last data time
    document.getElementById('lastDataTime').textContent = timestamp;
    document.getElementById('esp32Status').textContent = 'Connected';
    document.getElementById('esp32Status').classList.remove('off');
    document.getElementById('esp32Status').classList.add('on');
    
    // Update ESP32 Hardware Status Panel
    updateESP32Status(true);
    
    // Update relay hardware status
    updateRelayHardwareStatus(loadNum, relay);
}

// ============================================
// Load Detection Functions
// ============================================
function detectLoadConnected(voltage, current, power) {
    // Load is considered connected if:
    // - Voltage is present (system is powered)
    // - AND (current > threshold OR power > threshold)
    return voltage >= LOAD_DETECTION.minVoltage && 
           (current >= LOAD_DETECTION.minCurrent || power >= LOAD_DETECTION.minPower);
}

// Button flashing functions removed - auto-turn ON logic used instead

function updateLoadConnectionStatus(loadNum, isConnected) {
    const card = document.getElementById(`load${loadNum}Card`);
    const statusBadge = document.querySelector(`#load${loadNum}Card .connection-badge`);
    
    if (card) {
        if (isConnected) {
            card.classList.add('load-connected');
            card.classList.remove('load-disconnected');
        } else {
            card.classList.remove('load-connected');
            card.classList.add('load-disconnected');
        }
    }
    
    // Update or create connection badge
    if (statusBadge) {
        statusBadge.innerHTML = isConnected ? 
            '<i class="fas fa-plug"></i> Connected' : 
            '<i class="fas fa-plug"></i> Unplugged';
        statusBadge.className = `connection-badge ${isConnected ? 'connected' : 'disconnected'}`;
    }
}

function showLoadConnectedNotification(loadNum) {
    const loadNames = { 1: 'AC Bulb/Heater (Load 1)', 2: 'AC Fan (Load 2)' };
    showToast(`${loadNames[loadNum]} has been plugged in! Auto-turning ON...`, 'success');
    addAlert(`${loadNames[loadNum]} plugged in - Auto ON`, 'success');
}

function showLoadDisconnectedNotification(loadNum) {
    const loadNames = { 1: 'AC Bulb/Heater (Load 1)', 2: 'AC Fan (Load 2)' };
    showToast(`${loadNames[loadNum]} has been unplugged!`, 'warning');
    addAlert(`${loadNames[loadNum]} unplugged`, 'warning');
}

function handleDHT11Update(data) {
    currentData.environment = {
        temperature: parseFloat(data.temperature) || 0,
        humidity: parseFloat(data.humidity) || 0
    };
    
    // Update UI
    document.getElementById('tempValue').textContent = `${currentData.environment.temperature.toFixed(1)} °C`;
    document.getElementById('tempDisplay').textContent = currentData.environment.temperature.toFixed(1);
    document.getElementById('humidityDisplay').textContent = currentData.environment.humidity.toFixed(0);
    
    // Update gauges
    updateEnvironmentGauges();
    
    // Add to history
    const timestamp = new Date().toLocaleTimeString();
    dataHistory.environment.temperature.push(currentData.environment.temperature);
    dataHistory.environment.humidity.push(currentData.environment.humidity);
    dataHistory.environment.timestamps.push(timestamp);
    
    // Trim history
    if (dataHistory.environment.temperature.length > MAX_DATA_POINTS) {
        dataHistory.environment.temperature.shift();
        dataHistory.environment.humidity.shift();
        dataHistory.environment.timestamps.shift();
    }
    
    // Update temperature chart if on analytics page
    updateTemperatureChart();
    
    // Update auto control status display
    updateAutoControlStatus(currentData.environment.temperature);
    
    // Temperature-based automatic control logic (only in Auto mode)
    // If temp >= 30°C: Fan ON (Load 2), Bulb/Heater OFF (Load 1)
    // If temp < 30°C: Bulb/Heater ON (Load 1), Fan OFF (Load 2)
    if (controlMode === 'auto') {
        applyTemperatureControl(currentData.environment.temperature);
    }
    
    // Check for temperature alerts
    if (currentData.environment.temperature > 35) {
        addAlert(`High temperature warning: ${currentData.environment.temperature.toFixed(1)}°C`, 'warning');
    }
}

// Temperature-based automatic load control
// Logic: temp >= 30°C → Fan ON, Bulb/Heater OFF | temp < 30°C → Bulb/Heater ON, Fan OFF
let lastTempControlState = null; // Track state to avoid repeated commands

function applyTemperatureControl(temperature) {
    // Only apply in auto mode
    if (controlMode !== 'auto') return;
    
    // Determine desired state based on temperature
    const highTemp = temperature >= 30;
    const stateKey = highTemp ? 'fan_on' : 'bulb_on';
    
    // Only apply control if state changed (to avoid spamming commands)
    if (lastTempControlState === stateKey) {
        return;
    }
    
    lastTempControlState = stateKey;
    
    if (highTemp) {
        // High temperature (>=30°C): Turn ON Fan (Load 2), Turn OFF Bulb/Heater (Load 1)
        console.log(`🌡️ Temperature ${temperature}°C >= 30°C - Activating Fan, Deactivating Bulb/Heater`);
        addAlert(`Auto-control: Temp ${temperature.toFixed(1)}°C ≥ 30°C - Fan ON, Bulb/Heater OFF`, 'info');
        
        // Turn OFF Bulb/Heater (Load 1) - direct relay control without mode check
        if (currentData.load1.relay) {
            sendRelayCommand(1, false);
        }
        // Turn ON Fan (Load 2)
        if (!currentData.load2.relay) {
            setTimeout(() => sendRelayCommand(2, true), 300);
        }
    } else {
        // Low temperature (<30°C): Turn ON Bulb/Heater (Load 1), Turn OFF Fan (Load 2)
        console.log(`🌡️ Temperature ${temperature}°C < 30°C - Activating Bulb/Heater, Deactivating Fan`);
        addAlert(`Auto-control: Temp ${temperature.toFixed(1)}°C < 30°C - Bulb/Heater ON, Fan OFF`, 'info');
        
        // Turn OFF Fan (Load 2)
        if (currentData.load2.relay) {
            sendRelayCommand(2, false);
        }
        // Turn ON Bulb/Heater (Load 1)
        if (!currentData.load1.relay) {
            setTimeout(() => sendRelayCommand(1, true), 300);
        }
    }
}

// ============================================
// Auto Control Status Panel
// ============================================
function updateAutoControlStatus(temperature) {
    const tempDetail = document.getElementById('tempControlDetail');
    const tempBadge = document.getElementById('tempModeBadge');
    
    if (tempDetail) {
        if (temperature >= 30) {
            tempDetail.textContent = `${temperature.toFixed(1)}°C ≥ 30°C → Fan ON, Heater OFF`;
        } else {
            tempDetail.textContent = `${temperature.toFixed(1)}°C < 30°C → Heater ON, Fan OFF`;
        }
    }
    if (tempBadge) {
        tempBadge.textContent = controlMode === 'auto' ? 'ACTIVE' : 'STANDBY';
        tempBadge.className = controlMode === 'auto' ? 'mode-badge active' : 'mode-badge';
    }
}

// Called when manual button is pressed to show manual override in panel
function updateManualControlStatus(loadNum, state) {
    const manualDetail = document.getElementById('manualControlDetail');
    const manualBadge = document.getElementById('manualModeBadge');
    const loadNames = { 1: 'Heater', 2: 'Fan' };
    
    if (manualDetail) {
        manualDetail.textContent = `${loadNames[loadNum]} manually turned ${state ? 'ON' : 'OFF'}`;
    }
    if (manualBadge) {
        manualBadge.textContent = 'ACTIVE';
        manualBadge.className = 'mode-badge override';
    }
}

// ============================================
// Control Mode Functions
// ============================================
function setControlMode(mode) {
    controlMode = mode;
    console.log(`🎛️ Control mode set to: ${mode}`);
    
    // Send mode change to ESP32 via Socket.IO -> MQTT
    if (socket) {
        socket.emit('esp32:mode_control', { mode: mode });
    }
    
    const autoBtn = document.getElementById('autoModeBtn');
    const manualBtn = document.getElementById('manualModeBtn');
    const tempBadge = document.getElementById('tempModeBadge');
    const manualBadge = document.getElementById('manualModeBadge');
    const manualDetail = document.getElementById('manualControlDetail');
    const tempDetail = document.getElementById('tempControlDetail');
    
    // Toggle button active states
    if (autoBtn && manualBtn) {
        autoBtn.classList.toggle('active', mode === 'auto');
        manualBtn.classList.toggle('active', mode === 'manual');
    }
    
    // Update load card buttons (enable/disable)
    const load1On = document.getElementById('load1OnBtn');
    const load1Off = document.getElementById('load1OffBtn');
    const load2On = document.getElementById('load2OnBtn');
    const load2Off = document.getElementById('load2OffBtn');
    const load1Indicator = document.getElementById('load1ModeIndicator');
    const load2Indicator = document.getElementById('load2ModeIndicator');
    
    if (mode === 'manual') {
        // Buttons are always enabled, just update indicators
        
        // Update mode indicators
        if (load1Indicator) {
            load1Indicator.innerHTML = '<i class="fas fa-hand-pointer"></i> Manual Mode';
            load1Indicator.className = 'load-mode-indicator manual';
        }
        if (load2Indicator) {
            load2Indicator.innerHTML = '<i class="fas fa-hand-pointer"></i> Manual Mode';
            load2Indicator.className = 'load-mode-indicator manual';
        }
        
        // Update badges
        if (tempBadge) { tempBadge.textContent = 'STANDBY'; tempBadge.className = 'mode-badge'; }
        if (manualBadge) { manualBadge.textContent = 'ACTIVE'; manualBadge.className = 'mode-badge override'; }
        if (manualDetail) manualDetail.textContent = 'Click Turn ON/OFF buttons to control loads manually';
        
        // Reset temp control state so auto can re-trigger when switched back
        lastTempControlState = null;
        
        showToast('Manual Mode Activated - Use Turn ON/OFF buttons', 'info');
        addAlert('Manual mode ON: Use buttons to control loads', 'info');
    } else {
        // Buttons remain enabled, just update indicators
        
        // Update mode indicators
        if (load1Indicator) {
            load1Indicator.innerHTML = '<i class="fas fa-thermometer-half"></i> Auto Mode';
            load1Indicator.className = 'load-mode-indicator auto';
        }
        if (load2Indicator) {
            load2Indicator.innerHTML = '<i class="fas fa-thermometer-half"></i> Auto Mode';
            load2Indicator.className = 'load-mode-indicator auto';
        }
        
        // Update badges
        if (tempBadge) { tempBadge.textContent = 'ACTIVE'; tempBadge.className = 'mode-badge active'; }
        if (manualBadge) { manualBadge.textContent = 'STANDBY'; manualBadge.className = 'mode-badge'; }
        if (manualDetail) manualDetail.textContent = 'Temperature automatically controls loads (≥30°C: Fan ON, <30°C: Heater ON)';
        
        // Reset and re-apply temperature control immediately
        lastTempControlState = null;
        if (currentData.environment.temperature > 0) {
            console.log(`🌡️ Auto mode activated - Applying temperature control at ${currentData.environment.temperature}°C`);
            applyTemperatureControl(currentData.environment.temperature);
        }
        
        showToast('Auto Mode Activated - Temperature controls loads (30°C threshold)', 'success');
        addAlert('Auto mode ON: ≥30°C = Fan ON, <30°C = Heater ON', 'info');
    }
}

function handleRelayUpdate(data) {
    const loadNum = data.load_number || data.load_id || data.loadId || 1;
    const loadKey = `load${loadNum}`;
    const isOn = data.state === true || data.state === 'ON';
    currentData[loadKey].relay = isOn;
    updateRelayStatus(loadNum, isOn);
    updateButtonStates(loadNum, isOn);
    
    // Update relay hardware status panel
    updateRelayHardwareStatus(loadNum, isOn);
    
    // Update icon glow
    const icon = document.getElementById(`load${loadNum}Icon`);
    if (icon) {
        if (isOn) {
            icon.classList.add('glowing');
        } else {
            icon.classList.remove('glowing');
        }
    }
    
    // Show notification
    const loadNames = { 1: 'AC Bulb/Heater', 2: 'AC Fan' };
    addAlert(`${loadNames[loadNum]} relay ${isOn ? 'turned ON' : 'turned OFF'}`, isOn ? 'success' : 'info');
}

function updateLoadDisplay(loadNum, data) {
    console.log(`🔄 Updating Load ${loadNum} display with:`, data);
    
    // Apply noise threshold - show 0 for very small values when relay is off
    let voltage = data.voltage;
    let current = data.current;
    let power = data.power;
    
    // If relay is off and values are very small, show 0
    if (!data.relay) {
        if (current < 0.01) current = 0;
        if (power < 1) power = 0;
        // Keep voltage as it shows line voltage
    }
    
    // Update text values
    const voltageEl = document.getElementById(`voltage${loadNum}`);
    const currentEl = document.getElementById(`current${loadNum}`);
    const powerEl = document.getElementById(`power${loadNum}`);
    
    console.log(`   Elements found: voltage=${!!voltageEl}, current=${!!currentEl}, power=${!!powerEl}`);
    
    if (voltageEl) voltageEl.textContent = voltage.toFixed(1);
    if (currentEl) currentEl.textContent = current.toFixed(2);
    if (powerEl) powerEl.textContent = power.toFixed(1);
    
    // Update control panel values
    const controlPower = document.getElementById(`load${loadNum}ControlPower`);
    if (controlPower) {
        controlPower.textContent = `${power.toFixed(1)} W`;
    }
    
    // Update relay status
    updateRelayStatus(loadNum, data.relay);
    
    // Update gauges with filtered values
    updateLoadGauges(loadNum, { voltage, current, power, relay: data.relay });
}

function updateRelayStatus(loadNum, isOn) {
    const statusBadge = document.querySelector(`#load${loadNum}Status .status-badge`);
    const controlStatus = document.getElementById(`load${loadNum}ControlStatus`);
    const toggle = document.getElementById(`load${loadNum}Toggle`);
    const onBtn = document.getElementById(`load${loadNum}OnBtn`);
    const offBtn = document.getElementById(`load${loadNum}OffBtn`);
    
    if (statusBadge) {
        statusBadge.textContent = isOn ? 'ON' : 'OFF';
        statusBadge.classList.toggle('on', isOn);
        statusBadge.classList.toggle('off', !isOn);
    }
    
    if (controlStatus) {
        controlStatus.textContent = isOn ? 'ON' : 'OFF';
        controlStatus.classList.toggle('on', isOn);
        controlStatus.classList.toggle('off', !isOn);
    }
    
    if (toggle) {
        toggle.checked = isOn;
    }
    
    // Update button states: Turn ON dim when ON, Turn OFF glowing when ON
    if (onBtn && offBtn) {
        if (isOn) {
            // Relay is ON: Turn ON button dim, Turn OFF button glowing
            onBtn.classList.add('relay-active');
            offBtn.classList.add('relay-active');
        } else {
            // Relay is OFF: Normal state
            onBtn.classList.remove('relay-active');
            offBtn.classList.remove('relay-active');
        }
    }
}

function addToHistory(loadKey, data, timestamp) {
    dataHistory[loadKey].voltage.push(data.voltage);
    dataHistory[loadKey].current.push(data.current);
    dataHistory[loadKey].power.push(data.power);
    dataHistory[loadKey].timestamps.push(timestamp);
    
    // Trim to max points
    if (dataHistory[loadKey].voltage.length > MAX_DATA_POINTS) {
        dataHistory[loadKey].voltage.shift();
        dataHistory[loadKey].current.shift();
        dataHistory[loadKey].power.shift();
        dataHistory[loadKey].timestamps.shift();
    }
}

function updateTotals() {
    const totalVoltage = (currentData.load1.voltage + currentData.load2.voltage) / 2;
    const totalCurrent = currentData.load1.current + currentData.load2.current;
    const totalPower = currentData.load1.power + currentData.load2.power;
    
    document.getElementById('totalVoltage').textContent = `${totalVoltage.toFixed(1)} V`;
    document.getElementById('totalCurrent').textContent = `${totalCurrent.toFixed(2)} A`;
    document.getElementById('totalPower').textContent = `${totalPower.toFixed(1)} W`;
}

function checkAlerts(loadNum, data) {
    if (data.voltage > 250) {
        addAlert(`Load ${loadNum}: High voltage warning (${data.voltage.toFixed(1)}V)`, 'warning');
    }
    if (data.current > 10) {
        addAlert(`Load ${loadNum}: High current warning (${data.current.toFixed(2)}A)`, 'error');
    }
}

// ============================================
// Gauge Drawing
// ============================================
function initializeAllGauges() {
    // Load 1 Gauges
    drawGauge('voltageGauge1', 0, 300, '#3b82f6', 0);
    drawGauge('currentGauge1', 0, 15, '#a855f7', 0);
    drawGauge('powerGauge1', 0, 3000, '#eab308', 0);
    
    // Load 2 Gauges
    drawGauge('voltageGauge2', 0, 300, '#3b82f6', 0);
    drawGauge('currentGauge2', 0, 15, '#a855f7', 0);
    drawGauge('powerGauge2', 0, 3000, '#eab308', 0);
    
    // Environment Gauges
    drawGauge('tempGauge', 0, 50, '#ef4444', 0, true);
    drawGauge('humidityGauge', 0, 100, '#06b6d4', 0, true);
}

function updateLoadGauges(loadNum, data) {
    drawGauge(`voltageGauge${loadNum}`, 0, 300, '#3b82f6', data.voltage);
    drawGauge(`currentGauge${loadNum}`, 0, 15, '#a855f7', data.current);
    drawGauge(`powerGauge${loadNum}`, 0, 3000, '#eab308', data.power);
}

function updateEnvironmentGauges() {
    drawGauge('tempGauge', 0, 50, '#ef4444', currentData.environment.temperature, true);
    drawGauge('humidityGauge', 0, 100, '#06b6d4', currentData.environment.humidity, true);
}

function drawGauge(canvasId, min, max, color, value, large = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = large ? 60 : 50;
    const lineWidth = large ? 12 : 10;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Value arc
    const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1);
    const endAngle = 0.75 * Math.PI + (percentage * 1.5 * Math.PI);
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth / 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// ============================================
// Chart Initialization
// ============================================
function initializeCharts() {
    // Power Chart
    const powerCtx = document.getElementById('powerChart');
    if (powerCtx) {
        powerChart = new Chart(powerCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Load 1 Power',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Load 2 Power',
                        data: [],
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: getChartOptions('Power (W)')
        });
    }
    
    // Voltage/Current Chart
    const vcCtx = document.getElementById('vcChart');
    if (vcCtx) {
        vcChart = new Chart(vcCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Voltage',
                        data: [],
                        borderColor: '#eab308',
                        backgroundColor: 'transparent',
                        yAxisID: 'y',
                        tension: 0.4
                    },
                    {
                        label: 'Current',
                        data: [],
                        borderColor: '#a855f7',
                        backgroundColor: 'transparent',
                        yAxisID: 'y1',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#64748b' }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#eab308' },
                        title: { display: true, text: 'Voltage (V)', color: '#eab308' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#a855f7' },
                        title: { display: true, text: 'Current (A)', color: '#a855f7' }
                    }
                }
            }
        });
    }
    
    // Energy History Chart (Analytics)
    const energyCtx = document.getElementById('energyHistoryChart');
    if (energyCtx) {
        energyHistoryChart = new Chart(energyCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                    {
                        label: 'Load 1',
                        data: [12, 19, 8, 15, 22, 18, 10],
                        backgroundColor: 'rgba(59, 130, 246, 0.7)'
                    },
                    {
                        label: 'Load 2',
                        data: [8, 12, 6, 10, 15, 12, 8],
                        backgroundColor: 'rgba(34, 197, 94, 0.7)'
                    }
                ]
            },
            options: getChartOptions('Energy (kWh)')
        });
    }
    
    // Load Distribution Chart
    const distCtx = document.getElementById('loadDistributionChart');
    if (distCtx) {
        loadDistributionChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: ['Load 1', 'Load 2'],
                datasets: [{
                    data: [60, 40],
                    backgroundColor: ['#3b82f6', '#22c55e']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8' }
                    }
                }
            }
        });
    }
    
    // Temperature Chart
    const tempChartCtx = document.getElementById('temperatureChart');
    if (tempChartCtx) {
        temperatureChart = new Chart(tempChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: getChartOptions('Temperature (°C)')
        });
    }
}

function getChartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#94a3b8' }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#94a3b8' },
                title: { display: true, text: yLabel, color: '#94a3b8' }
            }
        }
    };
}

function updateCharts() {
    // Update Power Chart
    if (powerChart) {
        powerChart.data.labels = dataHistory.load1.timestamps.slice(-30);
        powerChart.data.datasets[0].data = dataHistory.load1.power.slice(-30);
        powerChart.data.datasets[1].data = dataHistory.load2.power.slice(-30);
        powerChart.update('none');
    }
    
    // Update V/C Chart
    if (vcChart) {
        vcChart.data.labels = dataHistory.load1.timestamps.slice(-30);
        vcChart.data.datasets[0].data = dataHistory.load1.voltage.slice(-30);
        vcChart.data.datasets[1].data = dataHistory.load1.current.slice(-30);
        vcChart.update('none');
    }
    
    // Update Load Distribution
    if (loadDistributionChart) {
        loadDistributionChart.data.datasets[0].data = [
            currentData.load1.power,
            currentData.load2.power
        ];
        loadDistributionChart.update('none');
    }
}

function updateTemperatureChart() {
    if (temperatureChart) {
        temperatureChart.data.labels = dataHistory.environment.timestamps.slice(-30);
        temperatureChart.data.datasets[0].data = dataHistory.environment.temperature.slice(-30);
        temperatureChart.update('none');
    }
}

// ============================================
// Relay Control
// ============================================
// ============================================
// Relay Control Functions
// ============================================

// Direct relay command (used by auto temperature control)
function sendRelayCommand(loadNum, state) {
    console.log(`🔌 Sending relay command ${loadNum}: ${state ? 'ON' : 'OFF'} (mode: ${controlMode})`);
    
    // Update button visual states immediately
    updateButtonStates(loadNum, state);
    
    // Update icon glow
    const icon = document.getElementById(`load${loadNum}Icon`);
    if (icon) {
        if (state) {
            icon.classList.add('glowing');
        } else {
            icon.classList.remove('glowing');
        }
    }
    
    // Send command via socket
    socket.emit('esp32:relay_control', {
        load_id: loadNum,
        state: state
    });
    
    const loadNames = { 1: 'AC Heater', 2: 'AC Fan' };
    showToast(`${loadNames[loadNum]} ${state ? 'ON' : 'OFF'}`, 'info');
}

// Manual relay control (auto-switches to manual mode)
function controlRelay(loadNum, state) {
    // Auto-switch to manual mode if not already in manual mode
    if (controlMode !== 'manual') {
        console.log('🔄 Auto-switching to Manual mode');
        setControlMode('manual');
    }
    
    console.log(`🔌 Controlling relay ${loadNum}: ${state ? 'ON' : 'OFF'}`);
    
    // Update button visual states immediately
    updateButtonStates(loadNum, state);
    
    // Update manual override status panel
    updateManualControlStatus(loadNum, state);
    
    // Send relay command
    sendRelayCommand(loadNum, state);
}

function updateButtonStates(loadNum, isOn) {
    const onBtn = document.getElementById(`load${loadNum}OnBtn`);
    const offBtn = document.getElementById(`load${loadNum}OffBtn`);
    
    if (onBtn && offBtn) {
        if (isOn) {
            onBtn.classList.add('active');
            offBtn.classList.remove('active');
        } else {
            onBtn.classList.remove('active');
            offBtn.classList.add('active');
        }
    }
    
    // Also update the relay status badge
    updateRelayStatus(loadNum, isOn);
}

function toggleLoad(loadNum, state) {
    controlRelay(loadNum, state);
}

// ============================================
// Navigation
// ============================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            
            // Update active nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Show page
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const targetPage = document.getElementById(`${page}Page`);
            if (targetPage) targetPage.classList.add('active');
            
            // Update header title
            const titles = {
                dashboard: 'Dashboard Overview',
                loads: 'Load Control Panel',
                analytics: 'Analytics & Reports',
                database: 'Database Records',
                ai: 'AI Assistant',
                settings: 'Settings'
            };
            document.querySelector('.header h1').textContent = titles[page] || 'Dashboard';
        });
    });
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            // Call backend logout API
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
        } catch (error) {
            console.log('Logout API call failed:', error);
        } finally {
            // Always clear local storage and redirect
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        }
    });
    
    // Sidebar toggle (mobile)
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    // AI Control Toggle
    const aiToggle = document.getElementById('aiControlToggle');
    if (aiToggle) {
        aiToggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            try {
                const response = await fetch('/api/ai/control/toggle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify({ enabled })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    showToast(result.message, 'success');
                    addAlert(`AI Control ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
                } else {
                    throw new Error('Failed to toggle AI control');
                }
            } catch (error) {
                console.error('AI control toggle error:', error);
                showToast('Failed to toggle AI control', 'error');
                e.target.checked = !enabled; // Revert
            }
        });
    }
}

// ============================================
// Alerts
// ============================================
function addAlert(message, type = 'info') {
    const alertsList = document.getElementById('alertsList');
    const time = new Date().toLocaleTimeString();
    
    const icons = {
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        success: 'fa-check-circle'
    };
    
    const alertHTML = `
        <div class="alert-item ${type}">
            <i class="fas ${icons[type]}"></i>
            <span>${message}</span>
            <span class="alert-time">${time}</span>
        </div>
    `;
    
    alertsList.insertAdjacentHTML('afterbegin', alertHTML);
    
    // Keep only last 10 alerts
    while (alertsList.children.length > 10) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

function clearAlerts() {
    const alertsList = document.getElementById('alertsList');
    alertsList.innerHTML = `
        <div class="alert-item info">
            <i class="fas fa-info-circle"></i>
            <span>Alerts cleared</span>
            <span class="alert-time">Just now</span>
        </div>
    `;
}

// ============================================
// Database Functions
// ============================================
function loadDatabaseTable() {
    const tableType = document.getElementById('dbTableSelect')?.value || 'telemetry';
    
    // For now, show data from our in-memory history
    const tbody = document.getElementById('databaseTableBody');
    
    let data = [];
    let headers = [];
    
    switch(tableType) {
        case 'load1':
            headers = ['Timestamp', 'Voltage (V)', 'Current (A)', 'Power (W)', 'Relay'];
            for (let i = 0; i < dataHistory.load1.timestamps.length; i++) {
                data.push({
                    timestamp: dataHistory.load1.timestamps[i],
                    voltage: dataHistory.load1.voltage[i],
                    current: dataHistory.load1.current[i],
                    power: dataHistory.load1.power[i],
                    relay: currentData.load1.relay ? 'ON' : 'OFF'
                });
            }
            break;
        case 'load2':
            headers = ['Timestamp', 'Voltage (V)', 'Current (A)', 'Power (W)', 'Relay'];
            for (let i = 0; i < dataHistory.load2.timestamps.length; i++) {
                data.push({
                    timestamp: dataHistory.load2.timestamps[i],
                    voltage: dataHistory.load2.voltage[i],
                    current: dataHistory.load2.current[i],
                    power: dataHistory.load2.power[i],
                    relay: currentData.load2.relay ? 'ON' : 'OFF'
                });
            }
            break;
        case 'dht11':
            headers = ['Timestamp', 'Temperature (°C)', 'Humidity (%)', '', ''];
            for (let i = 0; i < dataHistory.environment.timestamps.length; i++) {
                data.push({
                    timestamp: dataHistory.environment.timestamps[i],
                    voltage: dataHistory.environment.temperature[i],
                    current: dataHistory.environment.humidity[i],
                    power: '-',
                    relay: '-'
                });
            }
            // Update table headers
            const thead = document.querySelector('.database-table thead tr');
            thead.innerHTML = '<th>Timestamp</th><th>Temperature (°C)</th><th>Humidity (%)</th><th></th><th></th>';
            break;
        default:
            headers = ['Timestamp', 'Voltage (V)', 'Current (A)', 'Power (W)', 'Source'];
            // Combine all data
            for (let i = 0; i < dataHistory.load1.timestamps.length; i++) {
                data.push({
                    timestamp: dataHistory.load1.timestamps[i],
                    voltage: dataHistory.load1.voltage[i],
                    current: dataHistory.load1.current[i],
                    power: dataHistory.load1.power[i],
                    relay: 'Load 1'
                });
            }
    }
    
    // Reverse to show newest first
    data.reverse();
    databaseRecords = data;
    
    // Paginate
    const totalPages = Math.ceil(data.length / recordsPerPage) || 1;
    currentPage = Math.min(currentPage, totalPages);
    
    const startIdx = (currentPage - 1) * recordsPerPage;
    const pageData = data.slice(startIdx, startIdx + recordsPerPage);
    
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No data available. Connect ESP32 to start collecting data.</td></tr>';
    } else {
        tbody.innerHTML = pageData.map(row => `
            <tr>
                <td>${row.timestamp}</td>
                <td>${typeof row.voltage === 'number' ? row.voltage.toFixed(2) : row.voltage}</td>
                <td>${typeof row.current === 'number' ? row.current.toFixed(3) : row.current}</td>
                <td>${typeof row.power === 'number' ? row.power.toFixed(2) : row.power}</td>
                <td>${row.relay}</td>
            </tr>
        `).join('');
    }
    
    // Update pagination
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
}

function changePage(delta) {
    const totalPages = Math.ceil(databaseRecords.length / recordsPerPage) || 1;
    currentPage = Math.max(1, Math.min(currentPage + delta, totalPages));
    loadDatabaseTable();
}

function exportData() {
    if (databaseRecords.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }
    
    const csv = [
        ['Timestamp', 'Voltage', 'Current', 'Power', 'Relay'].join(','),
        ...databaseRecords.map(r => [r.timestamp, r.voltage, r.current, r.power, r.relay].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esp32_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully', 'success');
}

// ============================================
// Settings
// ============================================
function saveSettings() {
    const settings = {
        highVoltage: document.getElementById('highVoltage').value,
        highCurrent: document.getElementById('highCurrent').value,
        highTemp: document.getElementById('highTemp').value
    };
    
    localStorage.setItem('dashboardSettings', JSON.stringify(settings));
    showToast('Settings saved', 'success');
}

// ============================================
// Utilities
// ============================================
function updateDateTime() {
    const now = new Date();
    const options = { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    document.getElementById('datetime').textContent = now.toLocaleDateString('en-US', options);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// (First duplicate AI Chat block removed - active functions are below in the model-switching section)

// ============================================
// Database API Functions
// ============================================
async function loadDatabaseStats() {
    try {
        const response = await fetch('/api/database/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalRecords').textContent = stats.total || 0;
            document.getElementById('load1Records').textContent = stats.load1 || 0;
            document.getElementById('load2Records').textContent = stats.load2 || 0;
            document.getElementById('dht11Records').textContent = stats.dht11 || 0;
        }
    } catch (error) {
        console.log('Database stats not available');
    }
}

// ============================================
// AI Autonomous Control Panel Functions
// ============================================
function toggleAIControl(enabled) {
    console.log(`🤖 Toggling AI Control: ${enabled}`);
    aiControlEnabled = enabled;
    
    const enableBtn = document.getElementById('enableAIBtn');
    const statusText = document.getElementById('aiStatusText');
    const statusDot = document.getElementById('aiStatusDot');
    
    if (enableBtn) {
        if (enabled) {
            enableBtn.textContent = 'Disable AI Control';
            enableBtn.classList.add('active');
        } else {
            enableBtn.textContent = 'Enable AI Control';
            enableBtn.classList.remove('active');
        }
    }
    
    if (statusText) {
        statusText.textContent = enabled ? 'AI Control Active' : 'AI Control Inactive';
    }
    
    if (statusDot) {
        statusDot.className = enabled ? 'status-dot active' : 'status-dot';
    }
    
    // Call API
    fetch('/api/ai/control/toggle', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ enabled })
    })
    .then(response => response.json())
    .then(result => {
        showToast(result.message || `AI Control ${enabled ? 'enabled' : 'disabled'}`, 'success');
        addAlert(`AI Autonomous Control ${enabled ? 'ENABLED' : 'DISABLED'}`, enabled ? 'success' : 'info');
    })
    .catch(error => {
        console.error('AI control toggle error:', error);
        showToast('Failed to toggle AI control', 'error');
        // Revert UI
        aiControlEnabled = !enabled;
        if (enableBtn) {
            enableBtn.textContent = aiControlEnabled ? 'Disable AI Control' : 'Enable AI Control';
            enableBtn.classList.toggle('active', aiControlEnabled);
        }
    });
}

async function triggerAIDecision() {
    console.log('🧠 Triggering AI Decision...');
    
    const triggerBtn = document.getElementById('triggerDecisionBtn');
    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    }
    
    showToast('AI analyzing system state...', 'info');
    
    try {
        const response = await fetch('/api/ai/control/trigger', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                currentData: currentData,
                thresholds: thresholdValues
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('AI decision completed', 'success');
            
            // Show AI decision result
            if (result.decision) {
                addAlert(`AI Decision: ${result.decision}`, 'ai');
            }
            
            // Execute AI recommendations if any
            if (result.actions && result.actions.length > 0) {
                result.actions.forEach(action => {
                    if (action.type === 'relay_control') {
                        controlRelay(action.load_id, action.state);
                        addAlert(`AI Action: ${action.description}`, 'ai');
                    }
                });
            }
        } else {
            throw new Error(result.error || 'AI decision failed');
        }
    } catch (error) {
        console.error('AI decision error:', error);
        showToast('AI decision failed: ' + error.message, 'error');
    } finally {
        if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.innerHTML = '<i class="fas fa-bolt"></i> Trigger Decision';
        }
    }
}

// ============================================
// ESP32 Hardware Status Functions
// ============================================
function updateESP32Status(connected) {
    esp32Connected = connected;
    
    const mqttStatus = document.getElementById('mqttStatus');
    const lastUpdateEl = document.getElementById('lastUpdateTime');
    
    if (mqttStatus) {
        if (connected) {
            mqttStatus.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
            mqttStatus.className = 'esp-stat connected';
        } else {
            mqttStatus.innerHTML = '<i class="fas fa-times-circle"></i> Disconnected';
            mqttStatus.className = 'esp-stat disconnected';
        }
    }
    
    if (lastUpdateEl && connected) {
        lastUpdateEl.textContent = new Date().toLocaleTimeString();
    }
}

function updateRelayHardwareStatus(loadNum, state) {
    const statusEl = document.getElementById(`relay${loadNum}HWStatus`);
    if (statusEl) {
        if (state) {
            statusEl.innerHTML = '<i class="fas fa-toggle-on"></i> ON';
            statusEl.className = 'relay-hw-status on';
        } else {
            statusEl.innerHTML = '<i class="fas fa-toggle-off"></i> OFF';
            statusEl.className = 'relay-hw-status off';
        }
    }
}

function updateRelayStatus(loadNum, isOn) {
    // Update both dashboard status and hardware status panel
    const statusBadge = document.querySelector(`#load${loadNum}Card .relay-status`);
    if (statusBadge) {
        if (isOn) {
            statusBadge.innerHTML = '<i class="fas fa-power-off"></i> ON';
            statusBadge.className = 'relay-status on';
        } else {
            statusBadge.innerHTML = '<i class="fas fa-power-off"></i> OFF';
            statusBadge.className = 'relay-status off';
        }
    }
    
    // Update hardware status panel
    updateRelayHardwareStatus(loadNum, isOn);
    
    // Store current relay state
    currentData[`load${loadNum}`].relay = isOn;
}

// ============================================
// AI Chat Functions (with Model Switching)
// ============================================
let selectedAIModel = localStorage.getItem('selectedAIModel') || 'gemini';

function initModelSwitcher() {
    // Set initial active state
    const geminiBtn = document.getElementById('modelBtnGemini');
    const openaiBtn = document.getElementById('modelBtnOpenai');
    if (geminiBtn && openaiBtn) {
        if (selectedAIModel === 'gemini') {
            geminiBtn.classList.add('active');
            openaiBtn.classList.remove('active');
        } else {
            openaiBtn.classList.add('active');
            geminiBtn.classList.remove('active');
        }
    }
    updateModelLabels();
}

function switchAIModel(modelId) {
    selectedAIModel = modelId;
    localStorage.setItem('selectedAIModel', modelId);
    
    // Update button active states
    const geminiBtn = document.getElementById('modelBtnGemini');
    const openaiBtn = document.getElementById('modelBtnOpenai');
    if (geminiBtn && openaiBtn) {
        geminiBtn.classList.toggle('active', modelId === 'gemini');
        openaiBtn.classList.toggle('active', modelId === 'cerebras');
    }
    
    updateModelLabels();
    showToast(`Switched to ${modelId === 'gemini' ? 'Gemini 2.5 Flash' : 'OpenAI GPT-OSS 120B'}`, 'success');
}

function updateModelLabels() {
    const modelLabel = document.getElementById('aiModelLabel');
    const providerBadge = document.getElementById('aiProviderBadge');
    const infoProvider = document.getElementById('aiInfoProvider');
    const infoModel = document.getElementById('aiInfoModel');
    
    const isGemini = selectedAIModel === 'gemini';
    const providerName = isGemini ? 'Gemini 2.5 Flash' : 'GPT-OSS 120B';
    const providerShort = isGemini ? 'Gemini' : 'OpenAI';
    
    if (modelLabel) modelLabel.textContent = providerName;
    if (providerBadge) providerBadge.innerHTML = `<i class="fas fa-microchip"></i> ${providerShort}`;
    if (infoProvider) infoProvider.textContent = providerShort;
    if (infoModel) infoModel.textContent = providerName;
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

async function sendChatMessage() {
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Remove welcome card if present
    const welcomeCard = document.querySelector('.ai-welcome-card');
    if (welcomeCard) welcomeCard.remove();
    
    // Add user message to chat
    addChatMessage(message, 'user');
    input.value = '';
    
    // Show typing indicator
    const typingId = showTypingIndicator();
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ 
                message: message,
                preferredModel: selectedAIModel
            })
        });
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        const data = await response.json();
        
        // Handle auth errors
        if (response.status === 401 || response.status === 403 || (data.error && data.error.includes('token'))) {
            addChatMessage('**Session Expired**<br>Please login again. Redirecting...', 'bot');
            setTimeout(() => {
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }, 2000);
            return;
        }
        
        if (response.ok && data.success !== false) {
            const aiResponse = data.response || data.message || 'No response received.';
            addChatMessage(aiResponse, 'bot');
            
            if (data.provider) {
                console.log(`🤖 Response from: ${data.provider}`);
            }
        } else {
            const errorMsg = data.error || 'Failed to get AI response. Please try again.';
            addChatMessage(errorMsg, 'bot');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        console.error('Chat error:', error);
        addChatMessage('⚠️ Connection error. Please check your internet and try again.', 'bot');
    }
}

function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('aiChatMessages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${sender === 'user' ? 'user' : 'bot'}`;
    
    const icon = sender === 'user' ? 'fa-user' : 'fa-robot';
    const formattedContent = sender === 'bot' ? formatMessage(message) : escapeHtml(message);
    
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fas ${icon}"></i></div>
        <div class="message-content">
            <p>${formattedContent}</p>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessage(message) {
    if (!message) return '';
    
    return message
        .replace(/^### (.*$)/gm, '<h4>$1</h4>')
        .replace(/^## (.*$)/gm, '<h3>$1</h3>')
        .replace(/^# (.*$)/gm, '<h2>$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^• (.*$)/gm, '<li>$1</li>')
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
        .replace(/<\/ul><ul>/g, '');
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('aiChatMessages');
    if (!messagesContainer) return null;
    
    const id = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.id = id;
    typingDiv.className = 'ai-message bot typing';
    typingDiv.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return id;
}

function removeTypingIndicator(id) {
    if (!id) return;
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function askQuestion(question) {
    const input = document.getElementById('aiChatInput');
    if (input) {
        input.value = question;
        sendChatMessage();
    }
}

function clearChatHistory() {
    const messagesContainer = document.getElementById('aiChatMessages');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = `
        <div class="ai-welcome-card">
            <div class="welcome-icon"><i class="fas fa-robot"></i></div>
            <h3>Chat Cleared</h3>
            <p>Ready for a fresh conversation. Ask me anything about your smart load management system.</p>
            <div class="welcome-chips">
                <div class="welcome-chip" onclick="askQuestion('Show current power usage')">
                    <i class="fas fa-bolt"></i> Power Usage
                </div>
                <div class="welcome-chip" onclick="askQuestion('Give me energy saving tips')">
                    <i class="fas fa-leaf"></i> Energy Tips
                </div>
                <div class="welcome-chip" onclick="askQuestion('Analyze load patterns')">
                    <i class="fas fa-chart-line"></i> Patterns
                </div>
            </div>
        </div>
    `;
    
    // Also clear server-side history
    fetch('/api/ai/chat/clear', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
    }).catch(() => {});
    
    showToast('Chat history cleared', 'success');
}

