/************************************************************
 * ESP32 Monitor Frontend JavaScript
 * Real-time data display and control interface
 ************************************************************/

// Authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'index.html';
}

// API Base URL
const API_BASE = window.location.origin;

// Socket.IO Connection
const socket = io(API_BASE);

// Charts
let load1Chart, load2Chart, dht11Chart;

// Chart data buffers (keep last 50 points)
const MAX_POINTS = 50;
const chartData = {
    load1: { time: [], voltage: [], current: [], power: [] },
    load2: { time: [], voltage: [], current: [], power: [] },
    dht11: { time: [], temperature: [], humidity: [] }
};

/************************************************************
 * Initialize
 ************************************************************/
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    loadInitialData();
    setupSocketListeners();
    loadStatistics();
    
    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Auto-refresh statistics every 30 seconds
    setInterval(loadStatistics, 30000);
});

/************************************************************
 * Initialize Charts
 ************************************************************/
function initializeCharts() {
    // Load 1 Chart
    const ctx1 = document.getElementById('load1Chart').getContext('2d');
    load1Chart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Voltage (V)',
                    data: [],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Current (A)',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y1'
                },
                {
                    label: 'Power (W)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Voltage (V)' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Current (A)' }, grid: { drawOnChartArea: false } },
                y2: { type: 'linear', display: false, position: 'right' }
            }
        }
    });

    // Load 2 Chart
    const ctx2 = document.getElementById('load2Chart').getContext('2d');
    load2Chart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Voltage (V)',
                    data: [],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Current (A)',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y1'
                },
                {
                    label: 'Power (W)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Voltage (V)' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Current (A)' }, grid: { drawOnChartArea: false } },
                y2: { type: 'linear', display: false, position: 'right' }
            }
        }
    });

    // DHT11 Chart
    const ctx3 = document.getElementById('dht11Chart').getContext('2d');
    dht11Chart = new Chart(ctx3, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Temperature (°C)' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Humidity (%)' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

/************************************************************
 * Load Initial Data
 ************************************************************/
async function loadInitialData() {
    try {
        // Get current status
        const response = await fetch(`${API_BASE}/api/esp32/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            updateDisplay(result.data);
            document.getElementById('mqttStatus').textContent = 'Connected';
            document.getElementById('esp32Status').textContent = 'Online';
        }
        
        // Load historical data
        await loadHistoricalData(1);
        await loadHistoricalData(2);
        await loadDHT11History();
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        document.getElementById('mqttStatus').textContent = 'Error';
    }
}

/************************************************************
 * Load Historical Data for Charts
 ************************************************************/
async function loadHistoricalData(loadNumber) {
    try {
        const response = await fetch(`${API_BASE}/api/esp32/load/${loadNumber}/history?hours=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            const data = result.data;
            
            if (data.length > 0) {
                const loadData = chartData[`load${loadNumber}`];
                loadData.time = data.map(d => new Date(d.timestamp).toLocaleTimeString());
                loadData.voltage = data.map(d => parseFloat(d.voltage));
                loadData.current = data.map(d => parseFloat(d.current));
                loadData.power = data.map(d => parseFloat(d.power));
                
                updateChart(loadNumber);
            }
        }
    } catch (error) {
        console.error(`Error loading historical data for Load ${loadNumber}:`, error);
    }
}

async function loadDHT11History() {
    try {
        const response = await fetch(`${API_BASE}/api/esp32/dht11/history?hours=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            const data = result.data;
            
            if (data.length > 0) {
                chartData.dht11.time = data.map(d => new Date(d.timestamp).toLocaleTimeString());
                chartData.dht11.temperature = data.map(d => parseFloat(d.temperature));
                chartData.dht11.humidity = data.map(d => parseFloat(d.humidity));
                
                updateDHT11Chart();
            }
        }
    } catch (error) {
        console.error('Error loading DHT11 history:', error);
    }
}

/************************************************************
 * Update Display with Latest Data
 ************************************************************/
function updateDisplay(data) {
    if (data.loads && data.loads.length > 0) {
        data.loads.forEach(load => {
            const num = load.load_number;
            document.getElementById(`load${num}Voltage`).textContent = `${parseFloat(load.voltage || 0).toFixed(1)} V`;
            document.getElementById(`load${num}Current`).textContent = `${parseFloat(load.current || 0).toFixed(3)} A`;
            document.getElementById(`load${num}Power`).textContent = `${parseFloat(load.power || 0).toFixed(1)} W`;
            
            updateRelayStatus(num, load.relay_state);
            document.getElementById(`auto${num}`).checked = load.auto_mode;
            document.getElementById(`auto${num}Status`).textContent = load.auto_mode ? 'Enabled' : 'Disabled';
            document.getElementById(`threshold${num}`).value = load.power_threshold;
        });
    }
    
    if (data.dht11) {
        document.getElementById('temperature').textContent = `${parseFloat(data.dht11.temperature).toFixed(1)} °C`;
        document.getElementById('humidity').textContent = `${parseFloat(data.dht11.humidity).toFixed(1)} %`;
    }
    
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

/************************************************************
 * Update Relay Status Display
 ************************************************************/
function updateRelayStatus(loadNumber, state) {
    const indicator = document.querySelector(`#relay${loadNumber}Status .relay-indicator`);
    const text = document.querySelector(`#relay${loadNumber}Status span:last-child`);
    
    if (state) {
        indicator.classList.remove('off');
        indicator.classList.add('on');
        text.textContent = 'Relay ON';
    } else {
        indicator.classList.remove('on');
        indicator.classList.add('off');
        text.textContent = 'Relay OFF';
    }
}

/************************************************************
 * Update Charts
 ************************************************************/
function updateChart(loadNumber) {
    const chart = loadNumber === 1 ? load1Chart : load2Chart;
    const data = chartData[`load${loadNumber}`];
    
    chart.data.labels = data.time;
    chart.data.datasets[0].data = data.voltage;
    chart.data.datasets[1].data = data.current;
    chart.data.datasets[2].data = data.power;
    chart.update();
}

function updateDHT11Chart() {
    dht11Chart.data.labels = chartData.dht11.time;
    dht11Chart.data.datasets[0].data = chartData.dht11.temperature;
    dht11Chart.data.datasets[1].data = chartData.dht11.humidity;
    dht11Chart.update();
}

function addDataPoint(loadNumber, voltage, current, power, timestamp) {
    const data = chartData[`load${loadNumber}`];
    const time = new Date(timestamp).toLocaleTimeString();
    
    data.time.push(time);
    data.voltage.push(parseFloat(voltage));
    data.current.push(parseFloat(current));
    data.power.push(parseFloat(power));
    
    // Keep only last MAX_POINTS
    if (data.time.length > MAX_POINTS) {
        data.time.shift();
        data.voltage.shift();
        data.current.shift();
        data.power.shift();
    }
    
    updateChart(loadNumber);
}

function addDHT11DataPoint(temperature, humidity, timestamp) {
    const data = chartData.dht11;
    const time = new Date(timestamp).toLocaleTimeString();
    
    data.time.push(time);
    data.temperature.push(parseFloat(temperature));
    data.humidity.push(parseFloat(humidity));
    
    // Keep only last MAX_POINTS
    if (data.time.length > MAX_POINTS) {
        data.time.shift();
        data.temperature.shift();
        data.humidity.shift();
    }
    
    updateDHT11Chart();
}

/************************************************************
 * Socket.IO Event Listeners
 ************************************************************/
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Socket connected');
        socket.emit('authenticate', token);
    });
    
    socket.on('authenticated', (data) => {
        if (data.success) {
            console.log('Socket authenticated');
        }
    });
    
    // Real-time load data updates
    socket.on('esp32:load_update', (data) => {
        const num = data.load_number;
        document.getElementById(`load${num}Voltage`).textContent = `${parseFloat(data.voltage).toFixed(1)} V`;
        document.getElementById(`load${num}Current`).textContent = `${parseFloat(data.current).toFixed(3)} A`;
        document.getElementById(`load${num}Power`).textContent = `${parseFloat(data.power).toFixed(1)} W`;
        
        updateRelayStatus(num, data.relay_state);
        addDataPoint(num, data.voltage, data.current, data.power, data.timestamp);
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        document.getElementById('esp32Status').textContent = 'Online';
    });
    
    // Real-time DHT11 updates
    socket.on('esp32:dht11_update', (data) => {
        document.getElementById('temperature').textContent = `${parseFloat(data.temperature).toFixed(1)} °C`;
        document.getElementById('humidity').textContent = `${parseFloat(data.humidity).toFixed(1)} %`;
        
        addDHT11DataPoint(data.temperature, data.humidity, data.timestamp);
        
        // Apply temperature-based control logic
        applyTemperatureControl(parseFloat(data.temperature));
    });
    
    // Relay status updates
    socket.on('esp32:relay_status', (data) => {
        updateRelayStatus(data.load_number, data.relay_state);
    });

    // Power overload protection alerts
    socket.on('esp32:power_overload', (data) => {
        const loadNames = { 1: 'AC Bulb/Heater', 2: 'AC Fan' };
        const loadName = loadNames[data.load_number] || `Load ${data.load_number}`;
        showNotification(`⚠️ OVERLOAD! ${loadName}: ${data.power.toFixed(1)}W > ${data.threshold}W - Auto OFF!`, 'error');
        updateRelayStatus(data.load_number, false);
    });
}

// Track current relay states for temperature control
let currentRelayStates = { 1: false, 2: false };
let lastTempControlState = null;

// Temperature-based automatic load control
// Logic: temp >= 30°C → Fan ON (Load 2), Bulb/Heater OFF (Load 1)
//        temp < 30°C → Bulb/Heater ON (Load 1), Fan OFF (Load 2)
function applyTemperatureControl(temperature) {
    const highTemp = temperature >= 30;
    const stateKey = highTemp ? 'fan_on' : 'bulb_on';
    
    // Only apply control if state changed
    if (lastTempControlState === stateKey) {
        return;
    }
    
    lastTempControlState = stateKey;
    
    if (highTemp) {
        // High temperature: Fan ON, Bulb/Heater OFF
        console.log(`🌡️ Temp ${temperature}°C >= 30°C - Fan ON, Bulb/Heater OFF`);
        showNotification(`Auto: Temp ${temperature.toFixed(1)}°C ≥ 30°C - Fan ON, Bulb OFF`, 'info');
        controlRelay(1, false); // Bulb/Heater OFF
        setTimeout(() => controlRelay(2, true), 300); // Fan ON
    } else {
        // Low temperature: Bulb/Heater ON, Fan OFF
        console.log(`🌡️ Temp ${temperature}°C < 30°C - Bulb/Heater ON, Fan OFF`);
        showNotification(`Auto: Temp ${temperature.toFixed(1)}°C < 30°C - Bulb ON, Fan OFF`, 'info');
        controlRelay(2, false); // Fan OFF
        setTimeout(() => controlRelay(1, true), 300); // Bulb/Heater ON
    }
}

/************************************************************
 * Control Functions
 ************************************************************/
async function controlRelay(loadNumber, state) {
    try {
        const response = await fetch(`${API_BASE}/api/esp32/relay/${loadNumber}/control`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ state })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Load ${loadNumber} relay turned ${state ? 'ON' : 'OFF'}`, 'success');
        } else {
            showNotification('Failed to control relay', 'error');
        }
    } catch (error) {
        console.error('Error controlling relay:', error);
        showNotification('Error controlling relay', 'error');
    }
}

async function toggleAutoMode(loadNumber) {
    const checkbox = document.getElementById(`auto${loadNumber}`);
    const autoMode = checkbox.checked;
    
    try {
        const response = await fetch(`${API_BASE}/api/esp32/relay/${loadNumber}/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ auto_mode: autoMode })
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById(`auto${loadNumber}Status`).textContent = autoMode ? 'Enabled' : 'Disabled';
            showNotification(`Auto mode ${autoMode ? 'enabled' : 'disabled'} for Load ${loadNumber}`, 'success');
        } else {
            checkbox.checked = !autoMode;
            showNotification('Failed to update auto mode', 'error');
        }
    } catch (error) {
        console.error('Error updating auto mode:', error);
        checkbox.checked = !autoMode;
        showNotification('Error updating auto mode', 'error');
    }
}

async function updateThreshold(loadNumber) {
    const threshold = parseFloat(document.getElementById(`threshold${loadNumber}`).value);
    
    if (isNaN(threshold) || threshold < 0) {
        showNotification('Please enter a valid threshold value', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/esp32/relay/${loadNumber}/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ power_threshold: threshold })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Threshold updated to ${threshold}W for Load ${loadNumber}`, 'success');
        } else {
            showNotification('Failed to update threshold', 'error');
        }
    } catch (error) {
        console.error('Error updating threshold:', error);
        showNotification('Error updating threshold', 'error');
    }
}

/************************************************************
 * Load Statistics
 ************************************************************/
async function loadStatistics() {
    try {
        const response = await fetch(`${API_BASE}/api/esp32/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            const stats = result.data;
            
            stats.forEach(stat => {
                const num = stat.load_number;
                document.getElementById(`load${num}AvgPower`).textContent = parseFloat(stat.avg_power || 0).toFixed(1);
                document.getElementById(`load${num}MaxPower`).textContent = parseFloat(stat.max_power || 0).toFixed(1);
                document.getElementById(`load${num}Readings`).textContent = stat.total_readings || 0;
            });
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

/************************************************************
 * Utility Functions
 ************************************************************/
function showNotification(message, type = 'info') {
    // Simple notification - you can enhance this with a better UI
    const color = type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1';
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${color};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}
