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
                ('DC Fan', 'DC', 'fan', '12V DC Cooling Fan', 12, 2, 24),
                ('AC Bulb', 'AC', 'bulb', '220V LED Bulb', 220, 0.5, 100),
                ('AC Heater', 'AC', 'heater', '220V Room Heater', 220, 10, 2200)
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
                -- DC Fan thresholds
                (1, 'voltage', 10, 14, 10.5, 13.5, 14),
                (1, 'current', 0, 2.5, 0, 2.2, 2.5),
                (1, 'power', 0, 30, 0, 26, 30),
                
                -- AC Bulb thresholds
                (2, 'voltage', 200, 240, 205, 235, 245),
                (2, 'current', 0, 0.6, 0, 0.5, 0.6),
                (2, 'power', 0, 120, 0, 100, 120),
                
                -- AC Heater thresholds
                (3, 'voltage', 200, 240, 205, 235, 245),
                (3, 'current', 0, 12, 0, 10.5, 12),
                (3, 'power', 0, 2500, 0, 2300, 2500)
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
