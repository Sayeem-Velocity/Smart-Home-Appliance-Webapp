import { useState, useEffect } from 'react';
import { LogOut, Zap, TrendingUp, DollarSign, Power } from 'lucide-react';
import LoadCard from './LoadCardDark';
import ESP32Monitor from './ESP32Monitor';
import AIChat from './AIChat';
import AlertsPanel from './AlertsPanel';

const Dashboard = ({ user, socket, onLogout, apiBase }) => {
  const [loads, setLoads] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeTab, setActiveTab] = useState('loads');
  const [stats, setStats] = useState({
    totalPower: 0,
    totalEnergy: 0,
    totalCost: 0,
    activeLoads: 0
  });

  useEffect(() => {
    if (socket) {
      setupSocketListeners();
      setConnectionStatus('connected');
    }
    loadDashboardData();
  }, [socket]);

  const setupSocketListeners = () => {
    socket.on('telemetryUpdate', (data) => {
      updateStats(data);
    });

    socket.on('loadStateChange', (data) => {
      setLoads(prev => prev.map(load =>
        load.id === data.id ? { ...load, ...data } : load
      ));
    });

    socket.on('newAlerts', (newAlerts) => {
      setAlerts(prev => [...newAlerts, ...prev]);
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
    });
  };

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [loadsRes, alertsRes] = await Promise.all([
        fetch(`${apiBase}/api/loads`, { headers }),
        fetch(`${apiBase}/api/alerts`, { headers })
      ]);

      if (loadsRes.ok) {
        const loadsData = await loadsRes.json();
        setLoads(loadsData.data || []);
        calculateStats(loadsData.data || []);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.data || []);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const calculateStats = (loadsData) => {
    const totalPower = loadsData.reduce((sum, load) => sum + (load.current_power || 0), 0);
    const totalEnergy = loadsData.reduce((sum, load) => sum + (load.energy_kwh || 0), 0);
    const totalCost = loadsData.reduce((sum, load) => sum + (load.cost_today || 0), 0);
    const activeLoads = loadsData.filter(load => load.state === 'ON').length;

    setStats({ totalPower, totalEnergy, totalCost, activeLoads });
  };

  const updateStats = (data) => {
    calculateStats(data.loads || loads);
  };

  const handleLoadControl = async (loadId, state) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/loads/${loadId}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ state })
      });

      if (response.ok) {
        loadDashboardData();
      }
    } catch (error) {
      console.error('Error controlling load:', error);
    }
  };

  const handleAutoModeToggle = async (loadId, autoMode) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiBase}/api/loads/${loadId}/auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ autoMode })
      });
    } catch (error) {
      console.error('Error toggling auto mode:', error);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid rgba(79, 124, 255, 0.1)' }} className="shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent-blue), #3b5cff)' }}>
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">Smart Load Dashboard</h1>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Connected</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full" style={{ background: 'rgba(0, 217, 163, 0.1)' }}>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm" style={{ color: 'var(--accent-green)' }}>Connected</span>
              </div>
              <div className="text-right px-3 py-1 rounded-lg" style={{ background: 'var(--bg-card)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{user?.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg transition-colors"
                style={{ background: 'rgba(255, 71, 87, 0.1)' }}
                title="Logout"
              >
                <LogOut className="w-5 h-5" style={{ color: 'var(--accent-red)' }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg p-4 glass" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Total Power</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{stats.totalPower.toFixed(1)} W</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(79, 124, 255, 0.1)' }}>
                <Zap className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
              </div>
            </div>
          </div>

          <div className="rounded-lg p-4 glass" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Total Energy</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{stats.totalEnergy.toFixed(4)} kWh</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0, 217, 163, 0.1)' }}>
                <TrendingUp className="w-5 h-5" style={{ color: 'var(--accent-green)' }} />
              </div>
            </div>
          </div>

          <div className="rounded-lg p-4 glass" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Total Cost</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>${stats.totalCost.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255, 193, 7, 0.1)' }}>
                <DollarSign className="w-5 h-5" style={{ color: 'var(--accent-yellow)' }} />
              </div>
            </div>
          </div>

          <div className="rounded-lg p-4 glass" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Active Loads</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{stats.activeLoads} / {loads.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0, 217, 163, 0.1)' }}>
                <Power className="w-5 h-5" style={{ color: 'var(--accent-green)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="rounded-lg p-1 mb-6" style={{ background: 'var(--bg-card)' }}>
          <nav className="flex space-x-2">
            {[
              { id: 'loads', label: '⚡ Electrical Loads', icon: Power },
              { id: 'esp32', label: '📡 ESP32 Monitor' },
              { id: 'ai', label: '🤖 AI Control' },
              { id: 'alerts', label: '🔔 Alerts' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeTab === tab.id ? 'linear-gradient(135deg, var(--accent-blue), #3b5cff)' : 'transparent',
                  color: activeTab === tab.id ? 'white' : 'var(--text-secondary)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'loads' && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center" style={{ color: 'var(--text-primary)' }}>
              <Power className="w-5 h-5 mr-2" style={{ color: 'var(--accent-blue)' }} />
              Electrical Loads
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loads.map(load => (
                <LoadCard
                  key={load.id}
                  load={load}
                  onControl={handleLoadControl}
                  onAutoModeToggle={handleAutoModeToggle}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'esp32' && (
          <ESP32Monitor apiBase={apiBase} socket={socket} />
        )}

        {activeTab === 'ai' && (
          <AIChat apiBase={apiBase} />
        )}

        {activeTab === 'alerts' && (
          <AlertsPanel alerts={alerts} apiBase={apiBase} socket={socket} />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
