# services/api/endpoints/analysis.py
"""
Analysis API endpoints for anomaly detection and load analysis
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Header

from ...models.analysis import (
    AnomalyReport, LoadAnalysis, ControlRecommendation,
    TelemetryAnalysisRequest, ControlActionRequest
)
from ...llm.gemini_service import gemini_service
from ...core.rate_limiter import rate_limiter, ANALYSIS_DAILY_LIMIT

router = APIRouter()
logger = logging.getLogger(__name__)


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Extract user from authorization header."""
    if not authorization:
        return "anonymous"
    if authorization.startswith("Bearer "):
        token = authorization[7:]
        return token[:20] if token else "anonymous"
    return "anonymous"


async def get_system_context() -> Dict[str, Any]:
    """Get system context - replace with actual implementation."""
    return {
        "loads": [
            {"load_id": 1, "name": "DC Fan", "type": "dc", "is_on": True, "current_power": 45},
            {"load_id": 2, "name": "AC Bulb", "type": "ac", "is_on": True, "current_power": 60},
            {"load_id": 3, "name": "AC Heater", "type": "ac", "is_on": False, "current_power": 0}
        ],
        "recentAlerts": [],
        "hourlyTrends": [],
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/anomaly", response_model=AnomalyReport)
async def analyze_anomalies(
    request: TelemetryAnalysisRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Analyze telemetry data for anomalies using AI.
    """
    try:
        # Check rate limit
        rate_check = await rate_limiter.check_rate_limit(
            user_id=current_user,
            action_type="analysis",
            limit=ANALYSIS_DAILY_LIMIT
        )

        if not rate_check['allowed']:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Rate limit exceeded",
                    "limit": rate_check['limit'],
                    "remaining": rate_check['remaining'],
                    "reset_at": rate_check['reset_at'].isoformat()
                }
            )

        system_context = await get_system_context()
        
        report = await gemini_service.analyze_anomalies(
            telemetry_data=request.telemetry_data,
            system_context=system_context
        )

        await rate_limiter.increment_count(current_user, "analysis")

        return report

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Anomaly analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/control-recommendation", response_model=ControlRecommendation)
async def get_control_recommendation(
    request: ControlActionRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Get AI recommendation for a control action.
    """
    try:
        system_context = await get_system_context()
        
        # Find the load info
        load_info = None
        for load in system_context.get('loads', []):
            if load.get('load_id') == request.load_id:
                load_info = load
                break
        
        if not load_info:
            raise HTTPException(status_code=404, detail=f"Load {request.load_id} not found")

        # Get recent alerts for this load
        recent_alerts = [
            a for a in system_context.get('recentAlerts', [])
            if a.get('load_id') == request.load_id
        ]

        result = await gemini_service.get_control_recommendation(
            load_id=request.load_id,
            load_info=load_info,
            action=request.action,
            recent_alerts=recent_alerts
        )

        return ControlRecommendation(
            approved=result.get('approved', True),
            reason=result.get('reason', 'No specific recommendation'),
            warnings=result.get('warnings', []),
            suggestions=result.get('suggestions', []),
            confidence=0.9 if result.get('approved') else 0.7
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Control recommendation error: {e}")
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")


@router.get("/load/{load_id}", response_model=LoadAnalysis)
async def analyze_load(
    load_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Get detailed AI analysis for a specific load.
    """
    try:
        system_context = await get_system_context()
        
        # Find the load
        load_info = None
        for load in system_context.get('loads', []):
            if load.get('load_id') == load_id:
                load_info = load
                break
        
        if not load_info:
            raise HTTPException(status_code=404, detail=f"Load {load_id} not found")

        # Basic analysis - can be enhanced with AI
        anomalies = []
        recommendations = []
        health_score = 100

        # Check for anomalies
        power = load_info.get('current_power', 0)
        if power > 100:
            anomalies.append("High power consumption detected")
            health_score -= 10
            recommendations.append("Consider reducing usage or checking for issues")

        if load_info.get('is_on') and power == 0:
            anomalies.append("Load is on but showing zero power")
            health_score -= 20
            recommendations.append("Check sensor connections")

        return LoadAnalysis(
            load_id=load_id,
            load_name=load_info.get('name', f'Load {load_id}'),
            status='on' if load_info.get('is_on') else 'off',
            current_power_w=power,
            voltage_v=load_info.get('voltage', 0),
            current_a=load_info.get('current', 0),
            health_score=health_score,
            anomalies=anomalies,
            recommendations=recommendations,
            analyzed_at=datetime.utcnow()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Load analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/system-health")
async def get_system_health(
    current_user: str = Depends(get_current_user)
):
    """
    Get overall system health analysis.
    """
    try:
        system_context = await get_system_context()
        loads = system_context.get('loads', [])
        alerts = system_context.get('recentAlerts', [])

        # Calculate metrics
        total_power = sum(l.get('current_power', 0) for l in loads)
        active_loads = sum(1 for l in loads if l.get('is_on'))
        critical_alerts = sum(1 for a in alerts if a.get('severity') == 'critical')

        # Determine health status
        if critical_alerts > 0:
            status = 'critical'
            score = 40
        elif len(alerts) > 3:
            status = 'warning'
            score = 70
        else:
            status = 'healthy'
            score = 95

        return {
            "status": status,
            "health_score": score,
            "metrics": {
                "total_power_w": total_power,
                "active_loads": active_loads,
                "total_loads": len(loads),
                "active_alerts": len(alerts),
                "critical_alerts": critical_alerts
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"System health error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get system health")
