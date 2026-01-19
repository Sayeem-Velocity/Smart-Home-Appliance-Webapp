/**
 * Telemetry Simulator
 * Generates realistic simulated data for demo purposes
 * 
 * FUTURE: Replace this with real ESP32/Arduino data via MQTT or Serial
 */

const dataIngestion = require('./dataIngestion');

// Electricity rate (cost per kWh)
const ELECTRICITY_RATE = 0.12; // $0.12 per kWh

// Track cumulative energy for each load
const energyAccumulators = {
    1: 0, // DC Fan
    2: 0, // AC Bulb
    3: 0  // AC Heater
};

// Track simulation state
let simulationInterval = null;
let onDataCallback = null;

/**
 * Generate simulated telemetry for a specific load
 */
function generateTelemetry(loadId, isOn, loadInfo) {
    if (!isOn) {
        return {
            voltage: loadInfo.type === 'DC' ? 12 : 220,
            current: 0,
            power: 0,
            energy: energyAccumulators[loadId],
            cost: energyAccumulators[loadId] * ELECTRICITY_RATE,
            temperature: 25 + Math.random() * 2
        };
    }

    let voltage, current, power;
    const timeVariation = Math.sin(Date.now() / 10000) * 0.1; // Slow variation

    switch (loadId) {
        case 1: // DC Fan
            voltage = 12 + (Math.random() - 0.5) * 0.5 + timeVariation;
            current = 1.5 + (Math.random() - 0.5) * 0.3;
            break;
        case 2: // AC Bulb
            voltage = 220 + (Math.random() - 0.5) * 10 + timeVariation * 5;
            current = 0.35 + (Math.random() - 0.5) * 0.05;
            break;
        case 3: // AC Heater
            voltage = 220 + (Math.random() - 0.5) * 10 + timeVariation * 5;
            current = 8.5 + (Math.random() - 0.5) * 1;
            break;
        default:
            voltage = 0;
            current = 0;
    }

    power = voltage * current;
    
    // Calculate energy increment (kWh) based on interval
    const intervalHours = (parseInt(process.env.SIMULATION_INTERVAL_MS) || 2000) / 3600000;
    const energyIncrement = (power / 1000) * intervalHours;
    energyAccumulators[loadId] += energyIncrement;

    return {
        voltage: Math.round(voltage * 100) / 100,
        current: Math.round(current * 1000) / 1000,
        power: Math.round(power * 100) / 100,
        energy: Math.round(energyAccumulators[loadId] * 1000) / 1000,
        cost: Math.round(energyAccumulators[loadId] * ELECTRICITY_RATE * 10000) / 10000,
        temperature: 25 + (power / 100) + Math.random() * 3
    };
}

/**
 * Check thresholds and create alerts if needed
 */
async function checkThresholds(loadId, telemetry, loadName) {
    const thresholds = await dataIngestion.getThresholds(loadId);
    const alerts = [];

    for (const threshold of thresholds) {
        const value = telemetry[threshold.metric];
        if (value === undefined) continue;

        // Check critical threshold
        if (threshold.max_value && value > threshold.max_value) {
            const alert = await dataIngestion.createAlert(
                loadId,
                'critical',
                threshold.metric,
                `${loadName}: ${threshold.metric} exceeded critical limit (${value} > ${threshold.max_value})`,
                value,
                threshold.max_value
            );
            alerts.push(alert);
        }
        // Check warning threshold
        else if (threshold.warning_max && value > threshold.warning_max) {
            const alert = await dataIngestion.createAlert(
                loadId,
                'warning',
                threshold.metric,
                `${loadName}: ${threshold.metric} approaching limit (${value} > ${threshold.warning_max})`,
                value,
                threshold.warning_max
            );
            alerts.push(alert);
        }
    }

    return alerts;
}

/**
 * Handle auto-control logic based on thresholds
 * Safety auto-off works even without autoMode for critical thresholds
 */
async function handleAutoControl(loadId, telemetry, isOn, autoMode, loadName) {
    if (!isOn) return null;

    const thresholds = await dataIngestion.getThresholds(loadId);
    
    for (const threshold of thresholds) {
        const value = telemetry[threshold.metric];
        if (value === undefined) continue;

        // CRITICAL SAFETY: Auto-off when exceeding max_value (always active)
        if (threshold.max_value && value > threshold.max_value) {
            await dataIngestion.updateLoadState(loadId, false);
            await dataIngestion.logControlAction(
                loadId, 'safety_off', 'auto',
                `SAFETY OFF: ${loadName} ${threshold.metric} (${value.toFixed(2)}) exceeded critical limit (${threshold.max_value})`,
                'system'
            );
            console.log(`⚠️ SAFETY: ${loadName} turned OFF - ${threshold.metric} = ${value.toFixed(2)} > ${threshold.max_value}`);
            return { action: 'safety_off', reason: `${threshold.metric} (${value.toFixed(2)}) exceeded critical limit ${threshold.max_value}` };
        }

        // Auto-off when exceeding auto_off_threshold (only if autoMode enabled)
        if (autoMode && threshold.auto_off_threshold && value > threshold.auto_off_threshold) {
            await dataIngestion.updateLoadState(loadId, false);
            await dataIngestion.logControlAction(
                loadId, 'auto_off', 'auto',
                `Auto-off: ${loadName} ${threshold.metric} (${value.toFixed(2)}) exceeded threshold (${threshold.auto_off_threshold})`,
                'system'
            );
            console.log(`🤖 AUTO: ${loadName} turned OFF - ${threshold.metric} = ${value.toFixed(2)} > ${threshold.auto_off_threshold}`);
            return { action: 'auto_off', reason: `${threshold.metric} exceeded ${threshold.auto_off_threshold}` };
        }
    }

    return null;
}

/**
 * Run one simulation cycle
 */
async function simulateCycle() {
    try {
        const loads = await dataIngestion.getAllLoadsWithState();
        const results = [];

        for (const load of loads) {
            // Generate telemetry
            const telemetry = generateTelemetry(load.id, load.is_on, load);
            
            // Save to database
            await dataIngestion.ingestTelemetry(load.id, telemetry, 'simulation');
            
            // Update energy summary
            if (load.is_on) {
                await dataIngestion.updateEnergySummary(
                    load.id,
                    telemetry.energy / 1000, // Convert to small increment
                    telemetry.cost / 1000,
                    telemetry.power
                );
            }

            // Check thresholds and create alerts
            const alerts = await checkThresholds(load.id, telemetry, load.name);
            
            // Handle auto-control (pass load name for logging)
            const autoAction = await handleAutoControl(
                load.id, telemetry, load.is_on, load.auto_mode, load.name
            );

            results.push({
                loadId: load.id,
                name: load.name,
                type: load.type,
                deviceType: load.device_type,
                isOn: autoAction?.action === 'auto_off' ? false : load.is_on,
                autoMode: load.auto_mode,
                telemetry,
                alerts,
                autoAction
            });
        }

        // Notify callback if set
        if (onDataCallback) {
            onDataCallback(results);
        }

        return results;
    } catch (error) {
        console.error('Simulation cycle error:', error);
        return [];
    }
}

/**
 * Start simulation
 */
function startSimulation(callback) {
    if (simulationInterval) {
        clearInterval(simulationInterval);
    }

    onDataCallback = callback;
    const interval = parseInt(process.env.SIMULATION_INTERVAL_MS) || 2000;
    
    console.log(`📊 Starting simulation (interval: ${interval}ms)`);
    
    // Run immediately, then on interval
    simulateCycle();
    simulationInterval = setInterval(simulateCycle, interval);
}

/**
 * Stop simulation
 */
function stopSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        console.log('📊 Simulation stopped');
    }
}

/**
 * Reset energy accumulators
 */
function resetEnergy() {
    energyAccumulators[1] = 0;
    energyAccumulators[2] = 0;
    energyAccumulators[3] = 0;
}

module.exports = {
    startSimulation,
    stopSimulation,
    simulateCycle,
    generateTelemetry,
    resetEnergy,
    ELECTRICITY_RATE
};
