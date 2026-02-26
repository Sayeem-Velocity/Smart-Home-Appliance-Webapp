# services/core/database.py
"""
Database connection for accessing the existing PostgreSQL database
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import asyncpg
from .config import settings

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Async database manager for PostgreSQL"""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Create connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                settings.database_connection_string,
                min_size=2,
                max_size=10
            )
            logger.info(" Database connection pool created")
        except Exception as e:
            logger.error(f" Failed to connect to database: {e}")
            self.pool = None

    async def disconnect(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")

    async def get_all_loads_with_state(self) -> List[Dict[str, Any]]:
        """Get all loads with their current state"""
        if not self.pool:
            return []
        
        try:
            query = """
                SELECT 
                    l.id as load_id,
                    l.name,
                    l.type,
                    l.max_power,
                    COALESCE(ls.is_on, false) as is_on,
                    COALESCE(ls.auto_mode, false) as auto_mode,
                    COALESCE(ls.current_power, 0) as current_power,
                    COALESCE(ls.voltage, 0) as voltage,
                    COALESCE(ls.current, 0) as current,
                    ls.last_updated
                FROM loads l
                LEFT JOIN load_states ls ON l.id = ls.load_id
                ORDER BY l.id
            """
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query)
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error fetching loads: {e}")
            return []

    async def get_recent_alerts(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent alerts"""
        if not self.pool:
            return []
        
        try:
            query = """
                SELECT 
                    a.id,
                    a.load_id,
                    l.name as load_name,
                    a.alert_type,
                    a.severity,
                    a.message,
                    a.acknowledged,
                    a.created_at
                FROM alerts a
                LEFT JOIN loads l ON a.load_id = l.id
                WHERE a.acknowledged = false
                ORDER BY a.created_at DESC
                LIMIT $1
            """
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, limit)
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error fetching alerts: {e}")
            return []

    async def get_hourly_trends(self) -> List[Dict[str, Any]]:
        """Get hourly telemetry trends"""
        if not self.pool:
            return []
        
        try:
            query = """
                SELECT 
                    load_id,
                    AVG(power) as avg_power,
                    MAX(power) as max_power,
                    AVG(voltage) as avg_voltage,
                    AVG(current) as avg_current
                FROM telemetry
                WHERE timestamp > NOW() - INTERVAL '1 hour'
                GROUP BY load_id
            """
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query)
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error fetching trends: {e}")
            return []

    async def get_energy_summary(self, date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Get energy summary for a specific date"""
        if not self.pool:
            return []
        
        try:
            target_date = date.date() if date else datetime.now().date()
            query = """
                SELECT 
                    l.name,
                    l.id as load_id,
                    COALESCE(es.total_energy, 0) as energy_kwh,
                    COALESCE(es.total_cost, 0) as cost,
                    COALESCE(es.peak_power, 0) as peak_power,
                    COALESCE(es.on_time_hours, 0) as runtime_hours
                FROM loads l
                LEFT JOIN energy_summary es ON l.id = es.load_id AND es.date = $1
            """
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, target_date)
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error fetching energy summary: {e}")
            return []

    async def get_system_context(self) -> Dict[str, Any]:
        """Get full system context for AI"""
        loads = await self.get_all_loads_with_state()
        alerts = await self.get_recent_alerts()
        trends = await self.get_hourly_trends()

        return {
            "loads": loads,
            "recentAlerts": alerts,
            "hourlyTrends": trends,
            "timestamp": datetime.utcnow().isoformat()
        }

    async def log_ai_event(
        self,
        event_type: str,
        load_id: Optional[int],
        input_data: Dict[str, Any],
        output_text: str,
        confidence: Optional[float],
        decision: Optional[str],
        user_query: Optional[str]
    ):
        """Log AI events to database"""
        if not self.pool:
            return
        
        try:
            query = """
                INSERT INTO ai_events 
                (event_type, load_id, input_data, output_text, confidence, decision, user_query, timestamp)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            """
            async with self.pool.acquire() as conn:
                await conn.execute(
                    query,
                    event_type,
                    load_id,
                    str(input_data),
                    output_text,
                    confidence,
                    decision,
                    user_query
                )
        except Exception as e:
            logger.error(f"Error logging AI event: {e}")


# Singleton instance
db_manager = DatabaseManager()


async def get_db() -> DatabaseManager:
    """Dependency for getting database manager"""
    if not db_manager.pool:
        await db_manager.connect()
    return db_manager
