import { Power, TrendingUp, Activity } from 'lucide-react';

const LoadCard = ({ load, onControl, onAutoModeToggle }) => {
  const isOn = load.is_on;
  const deviceIcons = {
    fan: '🌀',
    bulb: '💡',
    heater: '🔥'
  };

  const deviceColors = {
    fan: 'from-cyan-500 to-cyan-700',
    bulb: 'from-yellow-500 to-yellow-700',
    heater: 'from-red-500 to-red-700'
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${deviceColors[load.device_type]} flex items-center justify-center text-2xl shadow-md`}>
            {deviceIcons[load.device_type]}
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{load.name}</h3>
            <p className="text-sm text-gray-500">{load.type}</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          isOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {isOn ? 'ON' : 'OFF'}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-1">Voltage</p>
          <p className="text-lg font-bold text-blue-600">{(load.voltage || 0).toFixed(1)}V</p>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-1">Current</p>
          <p className="text-lg font-bold text-green-600">{(load.current || 0).toFixed(2)}A</p>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-1">Power</p>
          <p className="text-lg font-bold text-purple-600">{(load.power || 0).toFixed(1)}W</p>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-3 pt-3 border-t border-gray-200">
        <div className="flex space-x-2">
          <button
            onClick={() => onControl(load.id, 'on')}
            className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-2 px-4 rounded-lg font-medium hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-[1.02]"
          >
            Turn ON
          </button>
          <button
            onClick={() => onControl(load.id, 'off')}
            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-2 px-4 rounded-lg font-medium hover:from-red-600 hover:to-red-700 transition-all transform hover:scale-[1.02]"
          >
            Turn OFF
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Auto Mode</span>
          <button
            onClick={() => onAutoModeToggle(load.id, !load.auto_mode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              load.auto_mode ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                load.auto_mode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoadCard;
