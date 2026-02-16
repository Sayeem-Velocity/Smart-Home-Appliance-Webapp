/**
 * Database Initialization Script
 * Run this to create all tables and initial data
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'smart_load_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
});

async function initDatabase() {
    console.log('🔧 Initializing database...');
    
    try {
        // Read and execute schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        await pool.query(schema);
        console.log('✅ Schema created successfully');
        
        // Insert initial loads
        await pool.query(`
            INSERT INTO loads (name, type, device_type, description, max_voltage, max_current, max_power)
            VALUES 
                ('AC Bulb/Heater', 'AC', 'bulb', '220V LED Bulb or Heater', 220, 1, 150),
                ('AC Fan', 'AC', 'fan', '220V AC Cooling Fan', 220, 0.5, 100)
            ON CONFLICT DO NOTHING
        `);
        console.log('✅ Loads created');
        
        // Initialize load states
        await pool.query(`
            INSERT INTO load_states (load_id, is_on, auto_mode)
            SELECT id, false, false FROM loads
            ON CONFLICT (load_id) DO NOTHING
        `);
        console.log('✅ Load states initialized');
        
        // Set default thresholds
        await pool.query(`
            INSERT INTO thresholds (load_id, metric, min_value, max_value, warning_min, warning_max, auto_off_threshold)
            VALUES 
                -- AC Bulb/Heater thresholds (Load 1)
                (1, 'voltage', 200, 240, 205, 235, 245),
                (1, 'current', 0, 1.2, 0, 1.0, 1.2),
                (1, 'power', 0, 150, 0, 130, 150),
                
                -- AC Fan thresholds (Load 2)
                (2, 'voltage', 200, 240, 205, 235, 245),
                (2, 'current', 0, 0.6, 0, 0.5, 0.6),
                (2, 'power', 0, 120, 0, 100, 120)
            ON CONFLICT DO NOTHING
        `);
        console.log('✅ Thresholds configured');
        
        console.log('\n🎉 Database initialization complete!');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

initDatabase();
