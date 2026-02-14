import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Thermometer, Droplets, Zap, Activity } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const ESP32Monitor = ({ apiBase, socket }) => {
  const [load1Data, setLoad1Data] = useState({ voltage: 0, current: 0, power: 0, relay_state: false });
  const [load2Data, setLoad2Data] = useState({ voltage: 0, current: 0, power: 0, relay_state: false });
  const [dht11Data, setDht11Data] = useState({ temperature: 0, humidity: 0 });
  const [chartData1, setChartData1] = useState({ time: [], voltage: [], current: [], power: [] });
  const [chartData2, setChartData2] = useState({ time: [], voltage: [], current: [], power: [] });
  const [esp32Status, setEsp32Status] = useState('waiting');
  const [threshold1, setThreshold1] = useState(120);
  const [threshold2, setThreshold2] = useState(15);

  useEffect(() => {
    loadESP32Data();
    if (socket) {
      setupSocketListeners();
    }
  }, [socket]);

  const loadESP32Data = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/esp32/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data.loads) {
          result.data.loads.forEach(load => {
            if (load.load_number === 1) {
              setLoad1Data(load);
              setThreshold1(load.power_threshold);
            } else if (load.load_number === 2) {
              setLoad2Data(load);
              setThreshold2(load.power_threshold);
            }
          });
        }
        if (result.data.dht11) {
          setDht11Data(result.data.dht11);
        }
        setEsp32Status('online');
      }
    } catch (error) {
      console.error('Error loading ESP32 data:', error);
    }
  };

  const setupSocketListeners = () => {
    socket.on('esp32:load_update', (data) => {
      setEsp32Status('online');
      const loadData = {
        voltage: data.voltage,
        current: data.current,
        power: data.power,
        relay_state: data.relay_state
      };

      if (data.load_number === 1) {
        setLoad1Data(loadData);
        addChartDataPoint(1, data);
      } else if (data.load_number === 2) {
        setLoad2Data(loadData);
        addChartDataPoint(2, data);
      }
    });

    socket.on('esp32:dht11_update', (data) => {
      setDht11Data({ temperature: data.temperature, humidity: data.humidity });
    });
  };

  const addChartDataPoint = (loadNumber, data) => {
    const time = new Date().toLocaleTimeString();
    const setter = loadNumber === 1 ? setChartData1 : setChartData2;

    setter(prev => {
      const newData = {
        time: [...prev.time, time].slice(-30),
        voltage: [...prev.voltage, data.voltage].slice(-30),
        current: [...prev.current, data.current].slice(-30),
        power: [...prev.power, data.power].slice(-30)
      };
      return newData;
    });
  };

  const controlRelay = async (loadNumber, state) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiBase}/api/esp32/relay/${loadNumber}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ state })
      });
    } catch (error) {
      console.error('Error controlling relay:', error);
    }
  };

  const updateThreshold = async (loadNumber) => {
    try {
      const token = localStorage.getItem('token');
      const threshold = loadNumber === 1 ? threshold1 : threshold2;
      await fetch(`${apiBase}/api/esp32/relay/${loadNumber}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ power_threshold: threshold })
      });
    } catch (error) {
      console.error('Error updating threshold:', error);
    }
  };

  const createChartData = (data, label, color) => ({
    labels: data.time,
    datasets: [{
      label: label,
      data: data.power,
      borderColor: color,
      backgroundColor: `${color}20`,
      tension: 0.4
    }]
  });

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: true, position: 'top' },
      title: { display: false }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  return (
    <div className="space-y-6">
      {/* ESP32 Status */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">ESP32 AC Load Monitor</h2>
            <p className="text-purple-100">Real-time sensor data from hardware</p>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${esp32Status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="font-semibold">{esp32Status}</span>
            </div>
            <p className="text-sm text-purple-100">MQTT Connected</p>
          </div>
        </div>
      </div>

      {/* Load Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Load 1 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">💡 Load 1 - 100W Bulb</h3>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              load1Data.relay_state ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              Relay {load1Data.relay_state ? 'ON' : 'OFF'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600">Voltage</p>
              <p className="text-lg font-bold text-blue-600">{load1Data.voltage.toFixed(1)}V</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600">Current</p>
              <p className="text-lg font-bold text-green-600">{load1Data.current.toFixed(3)}A</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600">Power</p>
              <p className="text-lg font-bold text-purple-600">{load1Data.power.toFixed(1)}W</p>
            </div>
          </div>

          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => controlRelay(1, true)}
              className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Turn ON
            </button>
            <button
              onClick={() => controlRelay(1, false)}
              className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              Turn OFF
            </button>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <span className="text-sm font-medium text-gray-700">Threshold:</span>
            <input
              type="number"
              value={threshold1}
              onChange={(e) => setThreshold1(Number(e.target.value))}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">W</span>
            <button
              onClick={() => updateThreshold(1)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Update
            </button>
          </div>

          {chartData1.time.length > 0 && (
            <div className="h-48">
              <Line data={createChartData(chartData1, 'Power (W)', '#3b82f6')} options={chartOptions} />
            </div>
          )}
        </div>

        {/* Load 2 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">💡 Load 2 - 8W Bulb</h3>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              load2Data.relay_state ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              Relay {load2Data.relay_state ? 'ON' : 'OFF'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600">Voltage</p>
              <p className="text-lg font-bold text-blue-600">{load2Data.voltage.toFixed(1)}V</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600">Current</p>
              <p className="text-lg font-bold text-green-600">{load2Data.current.toFixed(3)}A</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600">Power</p>
              <p className="text-lg font-bold text-purple-600">{load2Data.power.toFixed(1)}W</p>
            </div>
          </div>

          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => controlRelay(2, true)}
              className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Turn ON
            </button>
            <button
              onClick={() => controlRelay(2, false)}
              className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              Turn OFF
            </button>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <span className="text-sm font-medium text-gray-700">Threshold:</span>
            <input
              type="number"
              value={threshold2}
              onChange={(e) => setThreshold2(Number(e.target.value))}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">W</span>
            <button
              onClick={() => updateThreshold(2)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Update
            </button>
          </div>

          {chartData2.time.length > 0 && (
            <div className="h-48">
              <Line data={createChartData(chartData2, 'Power (W)', '#10b981')} options={chartOptions} />
            </div>
          )}
        </div>
      </div>

      {/* DHT11 Sensor */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">🌡️ DHT11 Sensor - Temperature & Humidity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-red-100 to-red-200 p-6 rounded-xl">
            <div className="flex items-center space-x-3 mb-2">
              <Thermometer className="w-8 h-8 text-red-600" />
              <span className="text-sm font-medium text-gray-700">Temperature</span>
            </div>
            <p className="text-4xl font-bold text-red-600">{dht11Data.temperature.toFixed(1)}°C</p>
          </div>
          <div className="bg-gradient-to-br from-blue-100 to-blue-200 p-6 rounded-xl">
            <div className="flex items-center space-x-3 mb-2">
              <Droplets className="w-8 h-8 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Humidity</span>
            </div>
            <p className="text-4xl font-bold text-blue-600">{dht11Data.humidity.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ESP32Monitor;
