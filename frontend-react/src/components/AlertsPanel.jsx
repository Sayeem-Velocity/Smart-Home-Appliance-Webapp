import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, Filter, Trash2 } from 'lucide-react';

const AlertsPanel = ({ apiBase, socket }) => {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('all'); // all, high, medium, low, acknowledged

  useEffect(() => {
    loadAlerts();
    if (socket) {
      setupSocketListeners();
    }
  }, [socket]);

  const loadAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/alerts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data) {
          setAlerts(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  };

  const setupSocketListeners = () => {
    socket.on('newAlerts', (newAlerts) => {
      setAlerts(prev => [...newAlerts, ...prev]);
    });
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setAlerts(prev => prev.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        ));
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const deleteAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/alerts/${alertId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  const clearAllAlerts = async () => {
    if (!confirm('Are you sure you want to clear all alerts?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/alerts/clear`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setAlerts([]);
      }
    } catch (error) {
      console.error('Error clearing alerts:', error);
    }
  };

  const getFilteredAlerts = () => {
    if (filter === 'all') return alerts;
    if (filter === 'acknowledged') return alerts.filter(a => a.acknowledged);
    return alerts.filter(a => a.severity === filter && !a.acknowledged);
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high':
        return <XCircle className="w-6 h-6 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
      case 'low':
        return <Info className="w-6 h-6 text-blue-500" />;
      default:
        return <Info className="w-6 h-6 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'from-red-500 to-red-600';
      case 'medium':
        return 'from-yellow-500 to-yellow-600';
      case 'low':
        return 'from-blue-500 to-blue-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 border-red-200';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200';
      case 'low':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const filteredAlerts = getFilteredAlerts();
  const stats = {
    total: alerts.length,
    high: alerts.filter(a => a.severity === 'high' && !a.acknowledged).length,
    medium: alerts.filter(a => a.severity === 'medium' && !a.acknowledged).length,
    low: alerts.filter(a => a.severity === 'low' && !a.acknowledged).length,
    acknowledged: alerts.filter(a => a.acknowledged).length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">System Alerts</h2>
            <p className="text-red-100">Monitor and manage system notifications</p>
          </div>
          <button
            onClick={clearAllAlerts}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg font-medium transition-all flex items-center space-x-2"
          >
            <Trash2 className="w-5 h-5" />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div
          onClick={() => setFilter('all')}
          className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg ${
            filter === 'all' ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          <p className="text-xs text-gray-600 mb-1">Total Alerts</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div
          onClick={() => setFilter('high')}
          className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg ${
            filter === 'high' ? 'ring-2 ring-red-500' : ''
          }`}
        >
          <p className="text-xs text-gray-600 mb-1">High</p>
          <p className="text-2xl font-bold text-red-600">{stats.high}</p>
        </div>
        <div
          onClick={() => setFilter('medium')}
          className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg ${
            filter === 'medium' ? 'ring-2 ring-yellow-500' : ''
          }`}
        >
          <p className="text-xs text-gray-600 mb-1">Medium</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.medium}</p>
        </div>
        <div
          onClick={() => setFilter('low')}
          className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg ${
            filter === 'low' ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          <p className="text-xs text-gray-600 mb-1">Low</p>
          <p className="text-2xl font-bold text-blue-600">{stats.low}</p>
        </div>
        <div
          onClick={() => setFilter('acknowledged')}
          className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg ${
            filter === 'acknowledged' ? 'ring-2 ring-green-500' : ''
          }`}
        >
          <p className="text-xs text-gray-600 mb-1">Acknowledged</p>
          <p className="text-2xl font-bold text-green-600">{stats.acknowledged}</p>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-700">
              {filter === 'all' ? 'All Alerts' : filter === 'acknowledged' ? 'Acknowledged Alerts' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Severity Alerts`}
            </span>
            <span className="text-gray-500">({filteredAlerts.length})</span>
          </div>
        </div>

        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No alerts to display</p>
              <p className="text-sm">Your system is running smoothly</p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 transition-all hover:bg-gray-50 ${
                  alert.acknowledged ? 'opacity-60' : ''
                } animate-slide-in`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="mt-1">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{alert.message}</h4>
                        {alert.acknowledged && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Acknowledged
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        Load {alert.load_number || 'N/A'} • {alert.alert_type}
                      </p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{new Date(alert.created_at).toLocaleString()}</span>
                        {alert.value && (
                          <span className="font-medium">Value: {alert.value}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete alert"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertsPanel;
