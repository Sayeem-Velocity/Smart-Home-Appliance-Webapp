import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Zap, User, Lock, LogOut, Power, TrendingUp, DollarSign, Brain, Lightbulb, Fan, Heater, Bell, Bot, X, Send, Cpu, Thermometer, Droplets } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      validateToken(token);
    }
  }, []);

  const validateToken = async (token) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/validate`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAuthenticated(true);
        initializeSocket(token);
      } else {
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      localStorage.removeItem('token');
    }
  };

  const initializeSocket = (token) => {
    const socketConnection = io(API_BASE);
    socketConnection.on('connect', () => {
      socketConnection.emit('authenticate', token);
    });
    setSocket(socketConnection);
  };

  const handleLogin = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        initializeSocket(data.token);
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      return { success: false, message: 'Connection error' };
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    if (socket) socket.disconnect();
    setIsAuthenticated(false);
    setUser(null);
    setSocket(null);
  };

  return (
    <>
      {!isAuthenticated ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <Dashboard user={user} socket={socket} onLogout={handleLogout} />
      )}
    </>
  );
}

// Login Screen Component
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await onLogin(username, password);
    if (!result.success) {
      setError(result.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <div className="icon"><Zap size={48} /></div>
          <h1>Smart Load Dashboard</h1>
          <p>Electrical Load Monitoring System</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <div className="icon"><User size={18} /></div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
            />
          </div>
          <div className="input-group">
            <div className="icon"><Lock size={18} /></div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            <LogOut size={18} />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="login-hint">Demo: demo/demo123 or admin/admin123</p>
        </form>
        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}

// Main Dashboard Component
function Dashboard({ user, socket, onLogout }) {
  const [loads, setLoads] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [selectedChartLoad, setSelectedChartLoad] = useState(1);
  const [chartData, setChartData] = useState({ power: [], voltage: [], current: [], energy: [], labels: [] });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([{ role: 'bot', content: '👋 Hi! I\'m your Smart Energy AI Assistant. Ask me anything about your energy usage!' }]);
  const [chatInput, setChatInput] = useState('');
  const [stats, setStats] = useState({ totalPower: 0, totalEnergy: 0, totalCost: 0, activeLoads: 0 });
  
  // ESP32 State
  const [esp32Data, setEsp32Data] = useState({
    load1: { voltage: 0, current: 0, power: 0, relay_state: false },
    load2: { voltage: 0, current: 0, power: 0, relay_state: false },
    dht11: { temperature: 0, humidity: 0 }
  });
  const [threshold1, setThreshold1] = useState(120);
  const [threshold2, setThreshold2] = useState(15);

  useEffect(() => {
    if (socket) {
      setupSocketListeners();
      setConnectionStatus('connected');
    }
    loadDashboardData();
  }, [socket]);

  const setupSocketListeners = () => {
    socket.on('telemetryUpdate', (data) => {
      if (data.loads) {
        setLoads(data.loads);
        calculateStats(data.loads);
      }
    });

    socket.on('loadStateChange', (data) => {
      setLoads(prev => prev.map(load => load.id === data.id ? { ...load, ...data } : load));
    });

    socket.on('newAlerts', (newAlerts) => {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 20));
    });

    socket.on('esp32:load_update', (data) => {
      if (data.load_number === 1) {
        setEsp32Data(prev => ({ ...prev, load1: data }));
      } else if (data.load_number === 2) {
        setEsp32Data(prev => ({ ...prev, load2: data }));
      }
    });

    socket.on('esp32:dht11_update', (data) => {
      setEsp32Data(prev => ({ ...prev, dht11: data }));
    });

    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect', () => setConnectionStatus('connected'));
  };

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [loadsRes, alertsRes, aiStatusRes] = await Promise.all([
        fetch(`${API_BASE}/api/loads`, { headers }),
        fetch(`${API_BASE}/api/alerts`, { headers }),
        fetch(`${API_BASE}/api/ai/control/status`, { headers })
      ]);

      if (loadsRes.ok) {
        const loadsData = await loadsRes.json();
        setLoads(loadsData.data || []);
        calculateStats(loadsData.data || []);
        loadChartHistory(loadsData.data || []);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.data || []);
      }

      if (aiStatusRes.ok) {
        const aiData = await aiStatusRes.json();
        setAiEnabled(aiData.enabled || false);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const loadChartHistory = async (loadsData) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/telemetry/history?loadId=${selectedChartLoad}&hours=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          const labels = data.data.map(d => new Date(d.timestamp).toLocaleTimeString());
          setChartData({
            labels: labels.slice(-30),
            power: data.data.map(d => d.power).slice(-30),
            voltage: data.data.map(d => d.voltage).slice(-30),
            current: data.data.map(d => d.current).slice(-30),
            energy: data.data.map(d => d.energy_kwh).slice(-30)
          });
        }
      }
    } catch (error) {
      console.error('Error loading chart history:', error);
    }
  };

  const calculateStats = (loadsData) => {
    const totalPower = loadsData.reduce((sum, load) => sum + (load.current_power || 0), 0);
    const totalEnergy = loadsData.reduce((sum, load) => sum + (load.energy_kwh || 0), 0);
    const totalCost = loadsData.reduce((sum, load) => sum + (load.cost_today || 0), 0);
    const activeLoads = loadsData.filter(load => load.state === 'ON').length;
    setStats({ totalPower, totalEnergy, totalCost, activeLoads });
  };

  const handleLoadControl = async (loadId, state) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/loads/${loadId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ state })
      });
    } catch (error) {
      console.error('Error controlling load:', error);
    }
  };

  const handleAutoMode = async (loadId, autoMode) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/loads/${loadId}/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ autoMode })
      });
    } catch (error) {
      console.error('Error toggling auto mode:', error);
    }
  };

  const toggleAIControl = async () => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = aiEnabled ? 'disable' : 'enable';
      const response = await fetch(`${API_BASE}/api/ai/control/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setAiEnabled(!aiEnabled);
      }
    } catch (error) {
      console.error('Error toggling AI control:', error);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: chatInput })
      });

      if (response.ok) {
        const data = await response.json();
        setChatMessages(prev => [...prev, { role: 'bot', content: data.response }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'bot', content: 'Sorry, I encountered an error.' }]);
    }
  };

  const controlESP32Relay = async (loadNumber, state) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/esp32/relay/${loadNumber}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ state })
      });
    } catch (error) {
      console.error('Error controlling ESP32 relay:', error);
    }
  };

  const updateESP32Threshold = async (loadNumber) => {
    try {
      const token = localStorage.getItem('token');
      const threshold = loadNumber === 1 ? threshold1 : threshold2;
      await fetch(`${API_BASE}/api/esp32/relay/${loadNumber}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ power_threshold: threshold })
      });
    } catch (error) {
      console.error('Error updating threshold:', error);
    }
  };

  const createChartConfig = (data, label, color) => ({
    labels: chartData.labels,
    datasets: [{
      label,
      data,
      borderColor: color,
      backgroundColor: color + '20',
      tension: 0.4,
      fill: true
    }]
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
    }
  };

  const getLoadIcon = (type) => {
    if (type?.toLowerCase().includes('fan')) return <Fan size={24} />;
    if (type?.toLowerCase().includes('bulb')) return <Lightbulb size={24} />;
    if (type?.toLowerCase().includes('heater')) return <Heater size={24} />;
    return <Power size={24} />;
  };

  const getLoadClass = (type) => {
    if (type?.toLowerCase().includes('fan')) return 'fan';
    if (type?.toLowerCase().includes('bulb')) return 'bulb';
    if (type?.toLowerCase().includes('heater')) return 'heater';
    return 'fan';
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <Zap className="logo" size={28} />
          <h1>Smart Load Dashboard</h1>
        </div>
        <div className="header-right">
          <div className={`connection-status ${connectionStatus}`}>
            <div className="dot"></div>
            <span>{connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="user-info">
            <User className="icon" size={24} />
            <span>{user?.username}</span>
            <span className="user-role">{user?.role}</span>
          </div>
          <button onClick={onLogout} className="logout-btn">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Summary Cards */}
        <section className="summary-section">
          <div className="summary-card">
            <div className="icon"><Zap size={24} /></div>
            <div>
              <h3>Total Power</h3>
              <p>{stats.totalPower.toFixed(1)} W</p>
            </div>
          </div>
          <div className="summary-card">
            <div className="icon"><TrendingUp size={24} /></div>
            <div>
              <h3>Total Energy</h3>
              <p>{stats.totalEnergy.toFixed(4)} kWh</p>
            </div>
          </div>
          <div className="summary-card">
            <div className="icon"><DollarSign size={24} /></div>
            <div>
              <h3>Total Cost</h3>
              <p>${stats.totalCost.toFixed(4)}</p>
            </div>
          </div>
          <div className="summary-card">
            <div className="icon"><Power size={24} /></div>
            <div>
              <h3>Active Loads</h3>
              <p>{stats.activeLoads} / {loads.length}</p>
            </div>
          </div>
        </section>

        {/* AI Control */}
        <section className="ai-control-section">
          <div className="ai-control-card">
            <div className="ai-control-header">
              <div className="icon"><Brain size={24} /></div>
              <div>
                <h3>AI Autonomous Control</h3>
                <p>{aiEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
            </div>
            <div className="ai-control-actions">
              <button onClick={toggleAIControl} className={`ai-control-btn ${aiEnabled ? '' : 'disabled'}`}>
                <Power size={18} />
                <span>{aiEnabled ? 'Disable AI Control' : 'Enable AI Control'}</span>
              </button>
              <button className="ai-trigger-btn" disabled={!aiEnabled}>
                <Zap size={18} />
                <span>Trigger Decision</span>
              </button>
            </div>
          </div>
        </section>

        {/* Electrical Loads */}
        <section className="loads-section">
          <h2><Power size={20} /> Electrical Loads</h2>
          <div className="loads-grid">
            {loads.map(load => (
              <div key={load.id} className={`load-card ${load.state === 'OFF' ? 'off' : ''}`}>
                <div className="load-card-header">
                  <div className="load-info">
                    <div className={`load-icon ${getLoadClass(load.device_type)}`}>
                      {getLoadIcon(load.device_type)}
                    </div>
                    <div className="load-name">
                      <h3>{load.device_name}</h3>
                      <span>{load.device_type}</span>
                    </div>
                  </div>
                  <div className="load-status">
                    <span className={`status-badge ${load.state === 'ON' ? 'on' : 'off'}`}>
                      {load.state}
                    </span>
                    {load.auto_mode && (
                      <span className="auto-badge">
                        <Brain size={12} /> Auto
                      </span>
                    )}
                  </div>
                </div>

                <div className="gauges-grid">
                  <div className="gauge">
                    <div className="gauge-circle" style={{ background: `conic-gradient(#3b82f6 ${(load.voltage || 0) / 250 * 360}deg, #0f172a 0deg)` }}>
                      <span className="gauge-value">{(load.voltage || 0).toFixed(0)} V</span>
                    </div>
                    <div className="gauge-label">Voltage</div>
                  </div>
                  <div className="gauge">
                    <div className="gauge-circle" style={{ background: `conic-gradient(#10b981 ${(load.current || 0) / 5 * 360}deg, #0f172a 0deg)` }}>
                      <span className="gauge-value">{(load.current || 0).toFixed(3)} A</span>
                    </div>
                    <div className="gauge-label">Current</div>
                  </div>
                  <div className="gauge">
                    <div className="gauge-circle" style={{ background: `conic-gradient(#f59e0b ${(load.current_power || 0) / (load.rated_power || 100) * 360}deg, #0f172a 0deg)` }}>
                      <span className="gauge-value">{(load.current_power || 0).toFixed(0)} W</span>
                    </div>
                    <div className="gauge-label">Power</div>
                  </div>
                </div>

                <div className="metrics-row">
                  <div className="metric">
                    <div className="metric-value">{(load.energy_kwh || 0).toFixed(4)}</div>
                    <div className="metric-label">Energy (kWh)</div>
                  </div>
                  <div className="metric">
                    <div className="metric-value cost">${(load.cost_today || 0).toFixed(4)}</div>
                    <div className="metric-label">Cost</div>
                  </div>
                </div>

                <div className="load-controls">
                  <button 
                    className="control-btn power-on" 
                    onClick={() => handleLoadControl(load.id, 'ON')}
                  >
                    <Power size={16} /> Turn On
                  </button>
                  <button 
                    className={`control-btn auto ${load.auto_mode ? 'active' : ''}`}
                    onClick={() => handleAutoMode(load.id, !load.auto_mode)}
                  >
                    <Brain size={16} /> Auto
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ESP32 Monitor Section */}
        <section className="esp32-section">
          <h2><Cpu size={20} /> ESP32 AC Load Monitor</h2>
          <div className="esp32-grid">
            {/* Load 1 - 100W */}
            <div className="esp32-card">
              <h3><Lightbulb size={20} /> Load 1 - 100W Bulb</h3>
              <div className="gauges-grid">
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#3b82f6 ${(esp32Data.load1.voltage || 0) / 250 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.load1.voltage.toFixed(1)} V</span>
                  </div>
                  <div className="gauge-label">Voltage</div>
                </div>
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#10b981 ${(esp32Data.load1.current || 0) / 2 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.load1.current.toFixed(3)} A</span>
                  </div>
                  <div className="gauge-label">Current</div>
                </div>
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#f59e0b ${(esp32Data.load1.power || 0) / 120 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.load1.power.toFixed(1)} W</span>
                  </div>
                  <div className="gauge-label">Power</div>
                </div>
              </div>
              <div className="load-controls">
                <button className="control-btn power-on" onClick={() => controlESP32Relay(1, true)}>
                  <Power size={16} /> Turn On
                </button>
                <button className="control-btn auto" onClick={() => controlESP32Relay(1, false)}>
                  <Power size={16} /> Turn Off
                </button>
              </div>
              <div className="threshold-input">
                <input
                  type="number"
                  value={threshold1}
                  onChange={(e) => setThreshold1(Number(e.target.value))}
                  placeholder="Threshold (W)"
                />
                <button onClick={() => updateESP32Threshold(1)}>Update</button>
              </div>
            </div>

            {/* Load 2 - 8W */}
            <div className="esp32-card">
              <h3><Lightbulb size={20} /> Load 2 - 8W Bulb</h3>
              <div className="gauges-grid">
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#3b82f6 ${(esp32Data.load2.voltage || 0) / 250 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.load2.voltage.toFixed(1)} V</span>
                  </div>
                  <div className="gauge-label">Voltage</div>
                </div>
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#10b981 ${(esp32Data.load2.current || 0) / 0.5 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.load2.current.toFixed(3)} A</span>
                  </div>
                  <div className="gauge-label">Current</div>
                </div>
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#f59e0b ${(esp32Data.load2.power || 0) / 15 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.load2.power.toFixed(1)} W</span>
                  </div>
                  <div className="gauge-label">Power</div>
                </div>
              </div>
              <div className="load-controls">
                <button className="control-btn power-on" onClick={() => controlESP32Relay(2, true)}>
                  <Power size={16} /> Turn On
                </button>
                <button className="control-btn auto" onClick={() => controlESP32Relay(2, false)}>
                  <Power size={16} /> Turn Off
                </button>
              </div>
              <div className="threshold-input">
                <input
                  type="number"
                  value={threshold2}
                  onChange={(e) => setThreshold2(Number(e.target.value))}
                  placeholder="Threshold (W)"
                />
                <button onClick={() => updateESP32Threshold(2)}>Update</button>
              </div>
            </div>

            {/* DHT11 Sensor */}
            <div className="esp32-card">
              <h3><Thermometer size={20} /> DHT11 Sensor</h3>
              <div className="gauges-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#ef4444 ${(esp32Data.dht11.temperature || 0) / 50 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.dht11.temperature.toFixed(1)}°C</span>
                  </div>
                  <div className="gauge-label">Temperature</div>
                </div>
                <div className="gauge">
                  <div className="gauge-circle" style={{ background: `conic-gradient(#3b82f6 ${(esp32Data.dht11.humidity || 0) / 100 * 360}deg, #0f172a 0deg)` }}>
                    <span className="gauge-value">{esp32Data.dht11.humidity.toFixed(1)}%</span>
                  </div>
                  <div className="gauge-label">Humidity</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Charts Section */}
        <section className="charts-section">
          <h2><TrendingUp size={20} /> Historical Trends</h2>
          <div className="chart-tabs">
            {loads.map(load => (
              <button
                key={load.id}
                className={`chart-tab ${selectedChartLoad === load.id ? 'active' : ''}`}
                onClick={() => { setSelectedChartLoad(load.id); loadChartHistory(loads); }}
              >
                {load.device_name}
              </button>
            ))}
          </div>
          <div className="charts-grid">
            <div className="chart-container">
              <h4>Power (W)</h4>
              <Line data={createChartConfig(chartData.power, 'Power', '#3b82f6')} options={chartOptions} />
            </div>
            <div className="chart-container">
              <h4>Voltage (V)</h4>
              <Line data={createChartConfig(chartData.voltage, 'Voltage', '#10b981')} options={chartOptions} />
            </div>
            <div className="chart-container">
              <h4>Current (A)</h4>
              <Line data={createChartConfig(chartData.current, 'Current', '#f59e0b')} options={chartOptions} />
            </div>
            <div className="chart-container">
              <h4>Energy (kWh)</h4>
              <Line data={createChartConfig(chartData.energy, 'Energy', '#ef4444')} options={chartOptions} />
            </div>
          </div>
        </section>

        {/* Alerts Section */}
        <section className="alerts-section">
          <h2><Bell size={20} /> Recent Alerts</h2>
          <div className="alerts-list">
            {alerts.length === 0 ? (
              <p className="no-alerts">No recent alerts</p>
            ) : (
              alerts.map((alert, idx) => (
                <div key={idx} className={`alert-item ${alert.severity || 'low'}`}>
                  <div className="icon"><Bell size={18} /></div>
                  <div className="alert-content">
                    <p>{alert.message}</p>
                    <small>{new Date(alert.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Chatbot Button */}
      <button className="chatbot-btn" onClick={() => setChatOpen(!chatOpen)}>
        <Bot size={24} />
      </button>

      {/* Chatbot Popup */}
      {chatOpen && (
        <div className="chatbot-popup">
          <div className="chatbot-header">
            <h3><Bot size={20} /> AI Assistant</h3>
            <button onClick={() => setChatOpen(false)}><X size={18} /></button>
          </div>
          <div className="chatbot-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role === 'user' ? 'user' : 'bot'}`}>
                <p>{msg.content}</p>
              </div>
            ))}
          </div>
          <div className="chatbot-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about your loads..."
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
            />
            <button onClick={sendChatMessage}><Send size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
