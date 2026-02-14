/**
 * Test MQTT Publisher - Simulates ESP32 sending data
 * Run this to test MQTT → Database → Dashboard flow
 */

const mqtt = require('mqtt');

// Connect to local MQTT broker
const client = mqtt.connect('mqtt://localhost:1883', {
    clientId: 'test_esp32_simulator'
});

client.on('connect', () => {
    console.log('✅ Connected to MQTT broker');
    console.log('📡 Publishing test data every 2 seconds...\n');
    
    // Publish data every 2 seconds
    setInterval(() => {
        // Random values for Load 1 (100W Bulb)
        const load1 = {
            voltage: (220 + Math.random() * 10).toFixed(2),
            current: (0.3 + Math.random() * 0.2).toFixed(4),
            power: (60 + Math.random() * 40).toFixed(2),
            relay_state: true
        };
        
        // Random values for Load 2 (8W Bulb)
        const load2 = {
            voltage: (220 + Math.random() * 10).toFixed(2),
            current: (0.03 + Math.random() * 0.02).toFixed(4),
            power: (6 + Math.random() * 4).toFixed(2),
            relay_state: true
        };
        
        // DHT11 sensor data
        const dht11 = {
            temperature: (25 + Math.random() * 5).toFixed(2),
            humidity: (60 + Math.random() * 20).toFixed(2)
        };
        
        // Publish to topics
        client.publish('esp32/load1/data', JSON.stringify(load1));
        client.publish('esp32/load2/data', JSON.stringify(load2));
        client.publish('esp32/dht11/data', JSON.stringify(dht11));
        
        console.log(`📊 Load 1: ${load1.voltage}V, ${load1.current}A, ${load1.power}W`);
        console.log(`📊 Load 2: ${load2.voltage}V, ${load2.current}A, ${load2.power}W`);
        console.log(`🌡️  DHT11: ${dht11.temperature}°C, ${dht11.humidity}%\n`);
    }, 2000);
});

client.on('error', (err) => {
    console.error('❌ MQTT Error:', err);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Stopping test publisher...');
    client.end();
    process.exit(0);
});
