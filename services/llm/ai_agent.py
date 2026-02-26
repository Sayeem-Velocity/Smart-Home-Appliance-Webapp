# services/llm/ai_agent.py
"""
AI Agent with Intent Detection for Dashboard UI
Provides intelligent question classification and context-aware responses
"""
import re
import logging
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from .gemini_service import gemini_service

logger = logging.getLogger(__name__)


class QuestionIntent(str, Enum):
    """Possible intents for user questions"""
    STATUS = "status" # Current load/system status
    ALERTS = "alerts" # Alert and warning information
    ENERGY = "energy" # Energy consumption queries
    COST = "cost" # Cost analysis
    CONTROL = "control" # Control actions/recommendations
    ANOMALY = "anomaly" # Anomaly detection queries
    COMPARISON = "comparison" # Comparing loads/time periods
    TREND = "trend" # Trend analysis
    SCHEDULE = "schedule" # Scheduling related
    MAINTENANCE = "maintenance" # Maintenance recommendations
    SAFETY = "safety" # Safety concerns
    OPTIMIZATION = "optimization" # Efficiency optimization
    HISTORY = "history" # Historical data
    FORECAST = "forecast" # Predictions/forecasts
    GENERAL = "general" # General questions


class AIAgent:
    """
    Intelligent AI Agent for Dashboard interactions.
    Handles intent detection, entity extraction, and context-aware responses.
    """

    def __init__(self):
        self.llm_service = gemini_service
        
        # Intent keywords mapping
        self.intent_keywords = {
            QuestionIntent.STATUS: [
                'status', 'state', 'running', 'on', 'off', 'active', 'current',
                'what is', 'show me', 'display', 'check'
            ],
            QuestionIntent.ALERTS: [
                'alert', 'warning', 'alarm', 'problem', 'issue', 'error',
                'notification', 'critical', 'urgent', 'danger'
            ],
            QuestionIntent.ENERGY: [
                'energy', 'power', 'watt', 'kwh', 'consumption', 'usage',
                'electricity', 'draw', 'load'
            ],
            QuestionIntent.COST: [
                'cost', 'price', 'bill', 'expense', 'money', 'dollar',
                'save', 'savings', 'expensive', 'cheap'
            ],
            QuestionIntent.CONTROL: [
                'turn on', 'turn off', 'switch', 'control', 'operate',
                'start', 'stop', 'enable', 'disable', 'toggle'
            ],
            QuestionIntent.ANOMALY: [
                'anomaly', 'unusual', 'abnormal', 'strange', 'weird',
                'unexpected', 'spike', 'irregular', 'detect'
            ],
            QuestionIntent.COMPARISON: [
                'compare', 'versus', 'vs', 'difference', 'which',
                'better', 'worse', 'more', 'less', 'between'
            ],
            QuestionIntent.TREND: [
                'trend', 'pattern', 'over time', 'increasing', 'decreasing',
                'graph', 'chart', 'history', 'change'
            ],
            QuestionIntent.SCHEDULE: [
                'schedule', 'timer', 'automate', 'automation', 'when',
                'time', 'program', 'routine', 'set time'
            ],
            QuestionIntent.MAINTENANCE: [
                'maintenance', 'repair', 'fix', 'service', 'replace',
                'lifespan', 'wear', 'check up', 'inspection'
            ],
            QuestionIntent.SAFETY: [
                'safe', 'safety', 'dangerous', 'hazard', 'risk',
                'fire', 'shock', 'overload', 'protection'
            ],
            QuestionIntent.OPTIMIZATION: [
                'optimize', 'efficient', 'efficiency', 'improve',
                'reduce', 'lower', 'minimize', 'best', 'tips'
            ],
            QuestionIntent.HISTORY: [
                'yesterday', 'last week', 'last month', 'previous',
                'historical', 'past', 'before', 'ago'
            ],
            QuestionIntent.FORECAST: [
                'predict', 'forecast', 'future', 'expect', 'will',
                'estimate', 'project', 'tomorrow', 'next'
            ],
        }

        # Entity patterns for extraction
        self.entity_patterns = {
            'load_name': r'\b(fan|bulb|heater|ac|dc|motor|pump|light|lamp)\b',
            'time_period': r'\b(today|yesterday|this week|last week|this month|hour|day|week|month)\b',
            'number': r'\b(\d+(?:\.\d+)?)\s*(w|kw|kwh|watts?|kilowatts?)?\b',
            'action': r'\b(turn on|turn off|switch on|switch off|start|stop|enable|disable)\b',
        }

    def detect_intent(self, message: str) -> QuestionIntent:
        """
        Detect the primary intent of a user message.
        """
        message_lower = message.lower()
        
        # Score each intent based on keyword matches
        intent_scores = {}
        for intent, keywords in self.intent_keywords.items():
            score = sum(1 for keyword in keywords if keyword in message_lower)
            # Boost score for exact phrase matches
            score += sum(2 for keyword in keywords if re.search(rf'\b{re.escape(keyword)}\b', message_lower))
            intent_scores[intent] = score

        # Get intent with highest score
        if intent_scores:
            max_intent = max(intent_scores, key=intent_scores.get)
            if intent_scores[max_intent] > 0:
                return max_intent

        return QuestionIntent.GENERAL

    def extract_entities(self, message: str) -> Dict[str, List[str]]:
        """
        Extract relevant entities from the message.
        """
        entities = {}
        message_lower = message.lower()

        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, message_lower, re.IGNORECASE)
            if matches:
                # Flatten tuples if present
                flattened = []
                for match in matches:
                    if isinstance(match, tuple):
                        flattened.extend([m for m in match if m])
                    else:
                        flattened.append(match)
                entities[entity_type] = flattened

        return entities

    def is_follow_up(self, message: str) -> bool:
        """
        Determine if the message is a follow-up question.
        """
        follow_up_indicators = [
            'what about', 'how about', 'and', 'also', 'more',
            'tell me more', 'explain', 'why', 'can you',
            'elaborate', 'details', 'specifically', 'that',
            'this', 'it', 'them', 'those'
        ]
        message_lower = message.lower()
        return any(indicator in message_lower for indicator in follow_up_indicators)

    def get_intent_guidance(self, intent: QuestionIntent, context: Dict[str, Any]) -> str:
        """
        Get specific guidance for responding based on intent.
        """
        loads = context.get('loads', [])
        alerts = context.get('recentAlerts', [])
        
        guidance_map = {
            QuestionIntent.STATUS: (
                "Report the CURRENT STATE of the system or specific loads. "
                "Include on/off status, power readings, and any relevant metrics."
            ),
            QuestionIntent.ALERTS: (
                f"Focus on ALERTS and WARNINGS. There are currently {len(alerts)} active alerts. "
                "Explain severity, affected devices, and recommended actions."
            ),
            QuestionIntent.ENERGY: (
                "Discuss ENERGY CONSUMPTION. Provide power readings in Watts, "
                "consumption in kWh, and contextual comparisons."
            ),
            QuestionIntent.COST: (
                "Analyze COSTS. Calculate estimated expenses, identify high-cost devices, "
                "and suggest cost-saving opportunities."
            ),
            QuestionIntent.CONTROL: (
                "Address CONTROL requests. Evaluate safety before recommending actions. "
                "Consider current load state and any active alerts."
            ),
            QuestionIntent.ANOMALY: (
                "Analyze for ANOMALIES. Look for unusual patterns, unexpected readings, "
                "or deviations from normal operation."
            ),
            QuestionIntent.COMPARISON: (
                "Provide COMPARISON analysis. Compare the requested items/periods "
                "with specific metrics and highlight differences."
            ),
            QuestionIntent.TREND: (
                "Discuss TRENDS over time. Identify patterns, changes in consumption, "
                "and notable shifts in usage behavior."
            ),
            QuestionIntent.SCHEDULE: (
                "Address SCHEDULING. Suggest optimal times for operation, "
                "automation possibilities, and time-based efficiency."
            ),
            QuestionIntent.MAINTENANCE: (
                "Provide MAINTENANCE guidance. Suggest inspection schedules, "
                "signs of wear, and preventive measures."
            ),
            QuestionIntent.SAFETY: (
                "Address SAFETY concerns immediately. Prioritize hazard identification, "
                "protective measures, and emergency procedures."
            ),
            QuestionIntent.OPTIMIZATION: (
                "Focus on OPTIMIZATION and efficiency. Provide actionable tips "
                "to reduce consumption and improve performance."
            ),
            QuestionIntent.HISTORY: (
                "Present HISTORICAL data. Reference past readings, events, "
                "and changes over the specified time period."
            ),
            QuestionIntent.FORECAST: (
                "Provide PREDICTIONS based on current data and historical patterns. "
                "Include confidence levels and assumptions."
            ),
            QuestionIntent.GENERAL: (
                "Provide a comprehensive response using all relevant context. "
                "Be helpful and informative."
            ),
        }
        return guidance_map.get(intent, guidance_map[QuestionIntent.GENERAL])

    async def process_query(
        self,
        message: str,
        system_context: Dict[str, Any],
        chat_history: List[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Process a user query with full intent analysis.
        
        Returns:
            Dict containing response, detected intent, entities, and metadata
        """
        # Step 1: Analyze the question
        intent = self.detect_intent(message)
        entities = self.extract_entities(message)
        is_follow_up = self.is_follow_up(message)
        
        logger.info(f"Query analysis - intent: {intent}, entities: {entities}, follow_up: {is_follow_up}")

        # Step 2: Get intent-specific guidance
        guidance = self.get_intent_guidance(intent, system_context)

        # Step 3: Enrich context with analysis metadata
        enriched_context = {
            **system_context,
            '_analysis': {
                'intent': intent.value,
                'entities': entities,
                'is_follow_up': is_follow_up,
                'guidance': guidance
            }
        }

        # Step 4: Generate response
        response = await self.llm_service.chat(
            message=message,
            system_context=enriched_context,
            chat_history=chat_history
        )

        # Step 5: Post-process response based on intent
        response = self._enhance_response(response, intent, entities, system_context)

        return {
            'response': response,
            'intent': intent.value,
            'entities': entities,
            'is_follow_up': is_follow_up,
            'timestamp': datetime.utcnow().isoformat(),
            'ai_enabled': self.llm_service.initialized
        }

    def _enhance_response(
        self,
        response: str,
        intent: QuestionIntent,
        entities: Dict[str, List[str]],
        context: Dict[str, Any]
    ) -> str:
        """
        Enhance response with additional context based on intent.
        """
        # Add relevant data appendix for certain intents
        if intent == QuestionIntent.ALERTS and context.get('recentAlerts'):
            alerts = context['recentAlerts']
            if alerts and 'alert' not in response.lower():
                alert_summary = f"\n\n---\n**Quick Alert Summary**: {len(alerts)} active alert(s)"
                return response + alert_summary

        if intent == QuestionIntent.ENERGY:
            loads = context.get('loads', [])
            total_power = sum(l.get('current_power', 0) for l in loads)
            if str(total_power) not in response:
                power_note = f"\n\n---\n**Current Total Power**: {total_power}W"
                return response + power_note

        return response

    async def get_quick_insights(self, system_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate quick insights for dashboard display.
        """
        loads = system_context.get('loads', [])
        alerts = system_context.get('recentAlerts', [])
        trends = system_context.get('hourlyTrends', [])

        # Calculate basic metrics
        total_power = sum(l.get('current_power', 0) for l in loads)
        active_loads = sum(1 for l in loads if l.get('is_on'))
        critical_alerts = sum(1 for a in alerts if a.get('severity') == 'critical')

        # Determine system health
        if critical_alerts > 0:
            health_status = 'critical'
            health_message = f" {critical_alerts} critical alert(s) require attention"
        elif len(alerts) > 3:
            health_status = 'warning'
            health_message = f"Multiple alerts ({len(alerts)}) - review recommended"
        else:
            health_status = 'healthy'
            health_message = "System operating normally"

        return {
            'health': {
                'status': health_status,
                'message': health_message
            },
            'metrics': {
                'total_power_w': total_power,
                'active_loads': active_loads,
                'total_loads': len(loads),
                'active_alerts': len(alerts),
                'critical_alerts': critical_alerts
            },
            'quick_tips': self._generate_quick_tips(loads, alerts),
            'generated_at': datetime.utcnow().isoformat()
        }

    def _generate_quick_tips(
        self,
        loads: List[Dict[str, Any]],
        alerts: List[Dict[str, Any]]
    ) -> List[str]:
        """
        Generate contextual quick tips.
        """
        tips = []

        # Check for high power loads
        for load in loads:
            if load.get('is_on') and load.get('current_power', 0) > 500:
                tips.append(f" {load.get('name', 'High-power load')} is consuming significant power")

        # Check alerts
        if alerts:
            tips.append(f" Review {len(alerts)} active alert(s) in the Alerts panel")

        # Time-based tips
        hour = datetime.now().hour
        if 9 <= hour <= 17: # Peak hours
            tips.append(" Peak hours - consider postponing non-essential high-power tasks")
        elif hour >= 22 or hour < 6:
            tips.append(" Off-peak hours - good time for high-power scheduled tasks")

        # Default tip if none generated
        if not tips:
            tips.append(" All systems normal - no immediate actions required")

        return tips[:5] # Limit to 5 tips


# Singleton instance
ai_agent = AIAgent()
