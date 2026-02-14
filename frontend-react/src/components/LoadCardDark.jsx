import { Lightbulb, Fan, Heater, Cpu, Power } from 'lucide-react';

const LoadCard = ({ load, onControl, onAutoModeToggle }) => {
  const getDeviceIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'ac bulb':
        return <Lightbulb className="w-6 h-6" />;
      case 'dc fan':
        return <Fan className="w-6 h-6" />;
      case 'ac heater':
        return <Heater className="w-6 h-6" />;
      default:
        return <Cpu className="w-6 h-6" />;
    }
  };

  const getDeviceColor = (type) => {
    switch (type.toLowerCase()) {
      case 'ac bulb':
        return { primary: '#FFC107', bg: 'rgba(255, 193, 7, 0.1)' };
      case 'dc fan':
        return { primary: '#00D9A3', bg: 'rgba(0, 217, 163, 0.1)' };
      case 'ac heater':
        return { primary: '#FF4757', bg: 'rgba(255, 71, 87, 0.1)' };
      default:
        return { primary: '#4F7CFF', bg: 'rgba(79, 124, 255, 0.1)' };
    }
  };

  const colors = getDeviceColor(load.device_type);
  const isOn = load.state === 'ON';

  return (
    <div className="rounded-xl p-5 glass transition-all hover:scale-[1.02]" style={{ 
      background: 'var(--bg-card)',
      border: `1px solid ${isOn ? colors.primary + '40' : 'rgba(79, 124, 255, 0.1)'}` 
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: colors.bg, color: colors.primary }}>
            {getDeviceIcon(load.device_type)}
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{load.device_name}</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{load.device_type}</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium`} style={{
          background: isOn ? 'rgba(0, 217, 163, 0.1)' : 'rgba(180, 185, 209, 0.1)',
          color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)'
        }}>
          {isOn ? 'ON' : 'OFF'}
        </div>
      </div>

      {/* Circular Progress */}
      <div className="flex justify-center mb-4">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="rgba(79, 124, 255, 0.1)"
              strokeWidth="8"
              fill="none"
            />
            {isOn && (
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke={colors.primary}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(load.current_power / load.rated_power) * 352} 352`}
                style={{ transition: 'stroke-dasharray 0.3s ease' }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {load.current_power ? load.current_power.toFixed(1) : '0.0'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>watts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Voltage</p>
          <p className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>
            {load.voltage ? load.voltage.toFixed(0) : '0'} V
          </p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Current</p>
          <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
            {load.current ? load.current.toFixed(2) : '0.00'} A
          </p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Power</p>
          <p className="text-sm font-bold" style={{ color: colors.primary }}>
            {load.current_power ? load.current_power.toFixed(0) : '0'} W
          </p>
        </div>
      </div>

      {/* Energy & Cost */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Energy</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
            {load.energy_kwh ? load.energy_kwh.toFixed(4) : '0.0000'} kWh
          </p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Cost Today</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--accent-yellow)' }}>
            ${load.cost_today ? load.cost_today.toFixed(2) : '0.00'}
          </p>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex space-x-2 mb-3">
        <button
          onClick={() => onControl(load.id, 'ON')}
          disabled={isOn}
          className="flex-1 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
          style={{
            background: isOn ? 'rgba(0, 217, 163, 0.2)' : 'linear-gradient(135deg, var(--accent-green), #00b386)',
            color: 'white'
          }}
        >
          Turn On
        </button>
        <button
          onClick={() => onControl(load.id, 'OFF')}
          disabled={!isOn}
          className="flex-1 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
          style={{
            background: !isOn ? 'rgba(180, 185, 209, 0.2)' : 'rgba(180, 185, 209, 0.3)',
            color: 'var(--text-secondary)'
          }}
        >
          Auto
        </button>
      </div>

      {/* Auto Mode Toggle */}
      <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Auto Mode</span>
        <button
          onClick={() => onAutoModeToggle(load.id, !load.auto_mode)}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          style={{ background: load.auto_mode ? 'var(--accent-blue)' : 'rgba(180, 185, 209, 0.3)' }}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              load.auto_mode ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export default LoadCard;
