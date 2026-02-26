# services/llm/gemini_service.py
"""
Google Gemini AI Service for Dashboard UI
Handles chatbot, anomaly detection, and load analysis functionality
Works with free API keys from Google AI Studio (https://aistudio.google.com/app/apikey)
"""
import asyncio
import logging
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

import httpx
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from ..core.config import settings
from ..models.chat import ChatMessage, MessageRole
from ..models.analysis import LoadAnalysis, AnomalyReport, EnergyInsight

logger = logging.getLogger(__name__)

CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"


class GeminiService:
    """Google Gemini AI service for dashboard analytics and chat"""

    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.cerebras_api_key = settings.cerebras_api_key
        self.cerebras_model = settings.cerebras_model
        self.current_provider = 'gemini'

        if not self.api_key:
            logger.warning("No Gemini API key found")
            if self.cerebras_api_key:
                logger.info(" Cerebras AI available as primary provider")
                self.current_provider = 'cerebras'
                self.initialized = True
                return
            logger.warning("No AI keys found - will use mock responses")
            self.initialized = False
            return

        try:
            # Configure the SDK with API key
            genai.configure(api_key=self.api_key)

            # Use Gemini 2.5 Flash
            self.model = genai.GenerativeModel(
                model_name="gemini-2.5-flash",
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "top_k": 40,
                    "max_output_tokens": 4096,
                },
                safety_settings={
                    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                }
            )

            self.initialized = True
            self.current_provider = 'gemini'
            logger.info(" Gemini service initialized with gemini-2.5-flash")
            if self.cerebras_api_key:
                logger.info(f" Cerebras AI configured as fallback (model: {self.cerebras_model})")

        except Exception as e:
            logger.error(f" Failed to initialize Gemini service: {e}")
            if self.cerebras_api_key:
                logger.info(" Falling back to Cerebras AI")
                self.current_provider = 'cerebras'
                self.initialized = True
            else:
                self.initialized = False

    async def _call_cerebras(self, prompt: str, system_prompt: str = "") -> str:
        """Call Cerebras AI API (OpenAI-compatible) as fallback provider."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                CEREBRAS_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.cerebras_api_key}"
                },
                json={
                    "model": self.cerebras_model,
                    "messages": messages,
                    "max_completion_tokens": 32768,
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "stream": False
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def chat(
        self,
        message: str,
        system_context: Dict[str, Any],
        chat_history: List[Dict[str, str]] = None
    ) -> str:
        """
        Chat about the dashboard/load system with context-aware responses.
        """
        if not self.initialized:
            return self._generate_fallback_response(message, system_context)

        try:
            # Build conversation context
            conversation_context = ""
            if chat_history and len(chat_history) > 0:
                recent = chat_history[-6:] if len(chat_history) > 6 else chat_history
                for msg in recent:
                    role = "User" if msg.get("role") == "user" else "Assistant"
                    conversation_context += f"{role}: {msg.get('content', '')}\n\n"

            # Build comprehensive prompt
            prompt = f"""You are an expert AI assistant for a smart electrical load monitoring dashboard.
You help users understand their energy usage, device status, anomalies, and potential issues.

=== SYSTEM STATE ===
**Loads Status:**
{json.dumps(system_context.get('loads', []), indent=2)}

**Recent Alerts:**
{json.dumps(system_context.get('recentAlerts', []), indent=2)}

**Hourly Trends:**
{json.dumps(system_context.get('hourlyTrends', []), indent=2)}

**Timestamp:** {system_context.get('timestamp', datetime.now().isoformat())}

=== RESPONSE GUIDELINES ===
1. Be concise and helpful - users want quick, actionable insights
2. Focus on the electrical loads: DC Fan, AC Bulb, AC Heater, etc.
3. Provide specific data from the context when available
4. Warn about any abnormal readings or active alerts
5. Suggest energy-saving tips when relevant
6. If asked about controls, explain but remind about safety
7. Use proper formatting with headers and bullet points
8. Include actual numbers and measurements when discussing data

{f"=== CONVERSATION HISTORY ==={chr(10)}{conversation_context}" if conversation_context else ""}

=== USER QUESTION ===
{message}

Provide a helpful, detailed response:"""

            # Generate response - try Gemini first, fallback to Cerebras
            try:
                response = await asyncio.to_thread(
                    self.model.generate_content, prompt
                )

                if response and response.text:
                    return response.text.strip()
                else:
                    raise Exception("Empty Gemini response")
                    
            except Exception as gemini_error:
                logger.warning(f"Gemini chat failed: {gemini_error}")
                
                # Fallback to Cerebras
                if self.cerebras_api_key:
                    logger.info("Falling back to Cerebras AI for chat...")
                    try:
                        result = await self._call_cerebras(prompt)
                        return result.strip()
                    except Exception as cerebras_error:
                        logger.error(f"Cerebras fallback also failed: {cerebras_error}")
                
                return self._generate_fallback_response(message, system_context)

        except Exception as e:
            logger.error(f"Chat error: {e}")
            
            # Try Cerebras if available
            if self.cerebras_api_key:
                try:
                    result = await self._call_cerebras(
                        f"User question about smart home energy monitoring: {message}",
                        "You are an expert AI assistant for a smart electrical load monitoring dashboard."
                    )
                    return result.strip()
                except Exception:
                    pass
            
            return self._generate_fallback_response(message, system_context)

    async def analyze_anomalies(
        self,
        telemetry_data: Dict[str, Any],
        system_context: Dict[str, Any]
    ) -> AnomalyReport:
        """
        Analyze telemetry data for anomalies using AI.
        """
        if not self.initialized:
            return self._generate_fallback_anomaly_report(telemetry_data)

        try:
            prompt = f"""Analyze this electrical load telemetry data for anomalies:

CURRENT READINGS:
{json.dumps(telemetry_data, indent=2)}

SYSTEM CONTEXT:
{json.dumps(system_context, indent=2)}

Identify any:
1. Unusual voltage/current patterns
2. Power consumption anomalies 
3. Potential safety concerns
4. Efficiency issues
5. Maintenance recommendations

Respond in JSON format ONLY:
{{
    "has_anomaly": boolean,
    "severity": "none" | "low" | "medium" | "high" | "critical",
    "issues": [
        {{
            "load_id": number,
            "load_name": string,
            "issue": string,
            "severity": "low" | "medium" | "high" | "critical",
            "recommendation": string
        }}
    ],
    "summary": string,
    "safety_alerts": [string],
    "efficiency_tips": [string]
}}"""

            response = await asyncio.to_thread(
                self.model.generate_content, prompt
            )

            if response and response.text:
                text = response.text.strip()
                # Clean markdown code blocks if present
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                data = json.loads(text)
                return AnomalyReport(
                    has_anomaly=data.get("has_anomaly", False),
                    severity=data.get("severity", "none"),
                    issues=data.get("issues", []),
                    summary=data.get("summary", ""),
                    safety_alerts=data.get("safety_alerts", []),
                    efficiency_tips=data.get("efficiency_tips", []),
                    analyzed_at=datetime.utcnow()
                )

        except Exception as e:
            logger.error(f"Anomaly analysis error: {e}")

        return self._generate_fallback_anomaly_report(telemetry_data)

    async def get_control_recommendation(
        self,
        load_id: int,
        load_info: Dict[str, Any],
        action: str,
        recent_alerts: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Get AI recommendation for load control action.
        """
        if not self.initialized:
            return {"approved": True, "reason": "AI not available, allowing action", "warnings": []}

        try:
            prompt = f"""A user wants to {action} the following electrical load.

LOAD INFORMATION:
{json.dumps(load_info, indent=2)}

RECENT ALERTS FOR THIS LOAD:
{json.dumps(recent_alerts, indent=2)}

SAFETY RULES:
1. Don't turn on devices if recent critical alerts exist
2. Consider power consumption implications
3. Heaters should have temperature monitoring
4. Check for overcurrent or voltage issues before turning on
5. Consider time-of-day efficiency (peak hours)

Should this action be allowed? Respond in JSON ONLY:
{{
    "approved": boolean,
    "reason": string,
    "warnings": [string],
    "suggestions": [string]
}}"""

            response = await asyncio.to_thread(
                self.model.generate_content, prompt
            )

            if response and response.text:
                text = response.text.strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                return json.loads(text)

        except Exception as e:
            logger.error(f"Control recommendation error: {e}")

        return {"approved": True, "reason": "Could not process recommendation", "warnings": []}

    async def generate_energy_insights(
        self,
        energy_data: Dict[str, Any],
        time_period: str = "daily"
    ) -> EnergyInsight:
        """
        Generate energy usage insights and recommendations.
        """
        if not self.initialized:
            return self._generate_fallback_energy_insight(energy_data, time_period)

        try:
            prompt = f"""Analyze this energy usage data and provide insights:

ENERGY DATA ({time_period}):
{json.dumps(energy_data, indent=2)}

Provide comprehensive analysis in JSON format:
{{
    "summary": "Brief overview of energy usage",
    "total_consumption_kwh": number,
    "estimated_cost": number,
    "peak_usage_time": string,
    "highest_consumer": {{
        "load_name": string,
        "consumption_kwh": number,
        "percentage": number
    }},
    "trends": [
        {{
            "observation": string,
            "trend_direction": "increasing" | "decreasing" | "stable",
            "significance": "low" | "medium" | "high"
        }}
    ],
    "recommendations": [
        {{
            "title": string,
            "description": string,
            "potential_savings": string,
            "priority": "low" | "medium" | "high"
        }}
    ],
    "comparison_note": string
}}"""

            response = await asyncio.to_thread(
                self.model.generate_content, prompt
            )

            if response and response.text:
                text = response.text.strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                data = json.loads(text)
                return EnergyInsight(
                    summary=data.get("summary", ""),
                    total_consumption_kwh=data.get("total_consumption_kwh", 0),
                    estimated_cost=data.get("estimated_cost", 0),
                    peak_usage_time=data.get("peak_usage_time", ""),
                    highest_consumer=data.get("highest_consumer", {}),
                    trends=data.get("trends", []),
                    recommendations=data.get("recommendations", []),
                    comparison_note=data.get("comparison_note", ""),
                    generated_at=datetime.utcnow(),
                    time_period=time_period
                )

        except Exception as e:
            logger.error(f"Energy insights error: {e}")

        return self._generate_fallback_energy_insight(energy_data, time_period)

    async def generate_daily_summary(
        self,
        energy_data: Dict[str, Any],
        alerts_data: List[Dict[str, Any]]
    ) -> str:
        """
        Generate a friendly daily energy summary.
        """
        if not self.initialized:
            return self._generate_fallback_daily_summary(energy_data, alerts_data)

        try:
            prompt = f"""Generate a brief, friendly daily energy summary for this smart home system:

TODAY'S ENERGY DATA:
{json.dumps(energy_data, indent=2)}

ALERTS TODAY:
{json.dumps(alerts_data, indent=2)}

Provide a friendly, concise summary (2-3 paragraphs) including:
1. Total energy usage and estimated cost
2. Any notable events or alerts that occurred
3. One practical energy-saving tip for tomorrow

Use a conversational tone like you're talking to a homeowner."""

            response = await asyncio.to_thread(
                self.model.generate_content, prompt
            )

            if response and response.text:
                return response.text.strip()

        except Exception as e:
            logger.error(f"Daily summary error: {e}")

        return self._generate_fallback_daily_summary(energy_data, alerts_data)

    # =========================================================================
    # FALLBACK METHODS
    # =========================================================================

    def _generate_fallback_response(self, message: str, context: Dict[str, Any]) -> str:
        """Generate intelligent fallback responses based on context."""
        message_lower = message.lower()
        loads = context.get('loads', [])
        alerts = context.get('recentAlerts', [])

        if any(w in message_lower for w in ['status', 'state', 'how', 'what']):
            load_status = []
            for load in loads:
                status = "ON" if load.get('is_on') else "OFF"
                power = load.get('current_power', 0)
                load_status.append(f"• **{load.get('name', 'Unknown')}**: {status} ({power}W)")
            
            return f"""## Current System Status

### Load States
{chr(10).join(load_status) if load_status else "No load data available"}

### Active Alerts
{f" {len(alerts)} active alert(s)" if alerts else " No active alerts"}

### Summary
The system is operating {'normally' if not alerts else 'with some alerts that need attention'}.

---
Would you like more details about any specific load or alert?"""

        elif any(w in message_lower for w in ['alert', 'warning', 'problem', 'issue']):
            if alerts:
                alert_list = []
                for alert in alerts[:5]:
                    alert_list.append(f"• **{alert.get('severity', 'Info').upper()}**: {alert.get('message', 'No message')}")
                return f"""## Active Alerts

{chr(10).join(alert_list)}

### Recommendations
- Check the affected loads for any physical issues
- Review the power readings for anomalies
- Consider reducing load if power consumption is high

---
Need help with a specific alert?"""
            else:
                return """## Alert Status

 **No active alerts!**

Your system is operating normally. All loads are within expected parameters.

---
Is there anything specific you'd like me to check?"""

        elif any(w in message_lower for w in ['energy', 'power', 'consumption', 'cost']):
            total_power = sum(l.get('current_power', 0) for l in loads)
            return f"""## Energy Overview

### Current Consumption
**Total Power**: {total_power}W

### Load Breakdown
{chr(10).join([f"• {l.get('name', 'Unknown')}: {l.get('current_power', 0)}W" for l in loads])}

### Energy-Saving Tips
1. Turn off unused devices during peak hours
2. Consider using timers for heaters
3. Monitor high-consumption devices closely

---
Would you like a detailed energy report?"""

        else:
            return f"""## Smart Load Dashboard Assistant

I'm here to help you with your smart electrical monitoring system!

### What I Can Help With
• **System Status** - Check current load states and readings
• **Alerts & Warnings** - View and understand active alerts
• **Energy Analysis** - Get insights on power consumption
• **Control Recommendations** - Safe operation guidance
• **Troubleshooting** - Help diagnose issues

### Current Quick Stats
- Active Loads: {sum(1 for l in loads if l.get('is_on'))} / {len(loads)}
- Total Power: {sum(l.get('current_power', 0) for l in loads)}W
- Active Alerts: {len(alerts)}

---
How can I assist you today?"""

    def _generate_fallback_anomaly_report(self, telemetry_data: Dict[str, Any]) -> AnomalyReport:
        """Generate fallback anomaly report."""
        return AnomalyReport(
            has_anomaly=False,
            severity="none",
            issues=[],
            summary="AI analysis temporarily unavailable. Manual inspection recommended.",
            safety_alerts=[],
            efficiency_tips=["Regularly monitor power consumption", "Check connections periodically"],
            analyzed_at=datetime.utcnow()
        )

    def _generate_fallback_energy_insight(self, energy_data: Dict[str, Any], time_period: str) -> EnergyInsight:
        """Generate fallback energy insight."""
        return EnergyInsight(
            summary=f"Energy analysis for {time_period} period",
            total_consumption_kwh=0,
            estimated_cost=0,
            peak_usage_time="Unknown",
            highest_consumer={},
            trends=[],
            recommendations=[
                {
                    "title": "Monitor Usage",
                    "description": "Keep track of your daily energy consumption",
                    "potential_savings": "5-10%",
                    "priority": "medium"
                }
            ],
            comparison_note="Detailed comparison requires AI service",
            generated_at=datetime.utcnow(),
            time_period=time_period
        )

    def _generate_fallback_daily_summary(self, energy_data: Dict[str, Any], alerts_data: List[Dict[str, Any]]) -> str:
        """Generate fallback daily summary."""
        return f"""## Daily Energy Summary

Today's energy data has been recorded. 
{" " + str(len(alerts_data)) + " alert(s) were logged today." if alerts_data else " No significant issues today."}

**Tip**: Consider scheduling high-power devices during off-peak hours to reduce costs.

---
*Detailed AI analysis will be available when the service is fully configured.*"""


# Singleton instance
gemini_service = GeminiService()
