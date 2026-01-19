# services/core/rate_limiter.py
"""
Rate limiter for API endpoints
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

# Default limits
CHAT_DAILY_LIMIT = 100
ANALYSIS_DAILY_LIMIT = 50


class RateLimiter:
    """
    Simple in-memory rate limiter.
    For production, consider using Redis-based rate limiting.
    """

    def __init__(self):
        # Structure: {user_id: {action_type: {'count': int, 'reset_at': datetime}}}
        self._limits: Dict[str, Dict[str, Dict]] = defaultdict(lambda: defaultdict(dict))
        self._lock = asyncio.Lock()
    
    async def check_rate_limit(
        self,
        user_id: str,
        action_type: str,
        limit: int = CHAT_DAILY_LIMIT
    ) -> Dict:
        """
        Check if user is within rate limit.
        
        Returns:
            Dict with 'allowed', 'remaining', 'limit', 'reset_at'
        """
        async with self._lock:
            now = datetime.utcnow()
            user_limits = self._limits[user_id][action_type]
            
            # Check if we need to reset (new day)
            reset_at = user_limits.get('reset_at')
            if not reset_at or now >= reset_at:
                # Reset for new day
                user_limits['count'] = 0
                user_limits['reset_at'] = (now + timedelta(days=1)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
            
            current_count = user_limits.get('count', 0)
            remaining = max(0, limit - current_count)
            
            return {
                'allowed': current_count < limit,
                'remaining': remaining,
                'limit': limit,
                'reset_at': user_limits['reset_at'],
                'current_count': current_count
            }
    
    async def increment_count(self, user_id: str, action_type: str) -> int:
        """
        Increment the count for a user action.
        
        Returns:
            New count
        """
        async with self._lock:
            self._limits[user_id][action_type]['count'] = \
                self._limits[user_id][action_type].get('count', 0) + 1
            return self._limits[user_id][action_type]['count']
    
    async def get_usage_stats(self, user_id: str) -> Dict:
        """
        Get usage statistics for a user.
        """
        async with self._lock:
            user_limits = self._limits.get(user_id, {})
            stats = {}
            
            for action_type, data in user_limits.items():
                stats[action_type] = {
                    'count': data.get('count', 0),
                    'reset_at': data.get('reset_at', datetime.utcnow() + timedelta(days=1))
                }
            
            return stats
    
    def reset_user_limits(self, user_id: str, action_type: Optional[str] = None):
        """
        Reset limits for a user (for admin use).
        """
        if action_type:
            if user_id in self._limits and action_type in self._limits[user_id]:
                self._limits[user_id][action_type] = {}
        else:
            if user_id in self._limits:
                self._limits[user_id] = defaultdict(dict)


# Global rate limiter instance
rate_limiter = RateLimiter()
