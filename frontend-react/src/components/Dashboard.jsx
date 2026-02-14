import { useState, useEffect } from 'react';
import { LogOut, Zap, TrendingUp, DollarSign, Power, Activity, Cpu, Bell, Bot } from 'lucide-react';
import LoadCard from './LoadCard';
import ESP32Monitor from './ESP32Monitor';
import AIChat from './AIChat';
import AlertsPanel from './AlertsPanel';

const Dashboard = ({ user, socket, onLogout, apiBase }) => {
  const [loads, setLoads] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeTab, setActiveTab] = useState('loads'); // loads, esp32, ai, alerts
  const [stats, setStats] = useState({
    totalPower: 0,
    totalEnergy: 0,
    totalCost: 0,
    activeLoads: 0
  });

  useEffect(() => {
    loadData();
    if (socket) {
      setupSocketListeners();
    }
  }, [socket]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [loadsRes, alertsRes] = await Promise.all([
        fetch(`${apiBase}/api/loads`, { headers }),
        fetch(`${apiBase}/api/alerts`, { headers })
      ]);

      if (loadsRes.ok) {
        const loadsData = await loadsRes.ok();
        setLoads(loadsData);
        calculateStats(loadsData);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const setupSocketListeners = () => {
    socket.on('authenticated', (data) => {
      if (data.success) {
        setConnectionStatus('connected');
      }
    });

    socket.on('telemetryUpdate', (data) => {
      setLoads(prevLoads => {
        const updated = [...prevLoads];
        data.forEach(update => {
          const index = updated.findIndex(l => l.id === update.loadId);
          if (index !== -1) {
            updated[index] = { ...updated[index], ...update };
          }
        });
        calculateStats(updated);
        return updated;
      });
    });

    socket.on('loadStateChange', (data) => {
      setLoads(prevLoads => {
        const updated = prevLoads.map(load =>
          load.id === data.loadId ? { ...load, is_on: data.isOn, auto_mode: data.autoMode } : load
        );
        calculateStats(updated);
        return updated;
      });
    });

    socket.on('newAlerts', (newAlerts) => {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
    });
  };

  const calculateStats = (loadsData) => {
    const totalPower = loadsData.reduce((sum, load) => sum + (load.power || 0), 0);
    const totalEnergy = loadsData.reduce((sum, load) => sum + (load.energy || 0), 0);
    const totalCost = loadsData.reduce((sum, load) => sum + (load.cost || 0), 0);
    const activeLoads = loadsData.filter(load => load.is_on).length;

    setStats({ totalPower, totalEnergy, totalCost, activeLoads });
  };

  const handleLoadControl = async (loadId, action) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/loads/${loadId}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });

      const result = await response.json();
      if (result.success) {
        // Update handled by socket
      }
    } catch (error) {
      console.error('Error controlling load:', error);
    }
  };

  const handleAutoModeToggle = async (loadId, enabled) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiBase}/api/loads/${loadId}/auto-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ enabled })
      });
    } catch (error) {
      console.error('Error toggling auto mode:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold gradient-text">Smart Home Dashboard</h1>
                <p className="text-sm text-gray-600">Real-time Monitoring & Control</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                <span className="text-sm text-gray-600">{connectionStatus}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.username}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('loads')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'loads'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Power className="w-4 h-4" />
                <span>AC Loads</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('esp32')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'esp32'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4" />
                <span>ESP32 Monitor</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'ai'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Bot className="w-4 h-4" />
                <span>AI Assistant</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'alerts'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4" />
                <span>Alerts</span>
                {alerts.filter(a => !a.is_acknowledged).length > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                    {alerts.filter(a => !a.is_acknowledged).length}
                  </span>
                )}
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards - Always Visible */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Power</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalPower.toFixed(1)} W</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Energy</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalEnergy.toFixed(2)} kWh</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-between">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Cost</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">${stats.totalCost.toFixed(2)}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Active Loads</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.activeLoads} / {loads.length}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'loads' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loads.map(load => (
              <LoadCard
                key={load.id}
                load={load}
                onControl={handleLoadControl}
                onAutoModeToggle={handleAutoModeToggle}
              />
            ))}
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
