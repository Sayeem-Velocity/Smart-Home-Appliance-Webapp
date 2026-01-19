# services/api/endpoints/insights.py
"""
Energy insights and reporting API endpoints
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Header

from ...models.analysis import EnergyInsight, DailySummaryRequest
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


async def get_energy_data(time_period: str = "daily") -> Dict[str, Any]:
    """
    Get energy data for the specified period.
    Replace with actual database queries.
    """
    return {
        "period": time_period,
        "loads": [
            {
                "name": "DC Fan",
                "consumption_kwh": 0.54,
                "cost": 0.065,
                "peak_power_w": 50,
                "avg_power_w": 45,
                "runtime_hours": 12
            },
            {
                "name": "AC Bulb",
                "consumption_kwh": 0.72,
                "cost": 0.086,
                "peak_power_w": 65,
                "avg_power_w": 60,
                "runtime_hours": 12
            },
            {
                "name": "AC Heater",
                "consumption_kwh": 4.5,
                "cost": 0.54,
                "peak_power_w": 1500,
                "avg_power_w": 900,
                "runtime_hours": 5
            }
        ],
        "total_consumption_kwh": 5.76,
        "total_cost": 0.69,
        "peak_hour": "14:00-15:00",
        "timestamp": datetime.utcnow().isoformat()
    }


async def get_alerts_data(date: Optional[datetime] = None) -> list:
    """Get alerts for the specified date."""
    return [
        {
            "id": 1,
            "load_name": "AC Heater",
            "severity": "warning",
            "message": "High power consumption during peak hours",
            "timestamp": datetime.utcnow().isoformat()
        }
    ]


@router.get("/energy", response_model=EnergyInsight)
async def get_energy_insights(
    time_period: str = "daily",
    current_user: str = Depends(get_current_user)
):
    """
    Get AI-powered energy usage insights.
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
                    "remaining": rate_check['remaining'],
                    "reset_at": rate_check['reset_at'].isoformat()
                }
            )

        energy_data = await get_energy_data(time_period)
        
        insights = await gemini_service.generate_energy_insights(
            energy_data=energy_data,
            time_period=time_period
        )

        await rate_limiter.increment_count(current_user, "analysis")

        return insights

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Energy insights error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")


@router.get("/daily-summary")
async def get_daily_summary(
    current_user: str = Depends(get_current_user)
):
    """
    Get a friendly daily energy summary.
    """
    try:
        energy_data = await get_energy_data("daily")
        alerts_data = await get_alerts_data()
        
        summary = await gemini_service.generate_daily_summary(
            energy_data=energy_data,
            alerts_data=alerts_data
        )

        return {
            "summary": summary,
            "date": datetime.utcnow().date().isoformat(),
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Daily summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate summary")


@router.get("/comparison")
async def get_period_comparison(
    current_period: str = "today",
    previous_period: str = "yesterday",
    current_user: str = Depends(get_current_user)
):
    """
    Compare energy usage between two periods.
    """
    try:
        # Get data for both periods
        current_data = await get_energy_data(current_period)
        previous_data = await get_energy_data(previous_period)

        # Calculate differences
        current_total = current_data.get('total_consumption_kwh', 0)
        previous_total = previous_data.get('total_consumption_kwh', 0)
        
        if previous_total > 0:
            percentage_change = ((current_total - previous_total) / previous_total) * 100
        else:
            percentage_change = 0

        change_direction = "increased" if percentage_change > 0 else "decreased" if percentage_change < 0 else "unchanged"

        return {
            "current_period": {
                "name": current_period,
                "consumption_kwh": current_total,
                "cost": current_data.get('total_cost', 0)
            },
            "previous_period": {
                "name": previous_period,
                "consumption_kwh": previous_total,
                "cost": previous_data.get('total_cost', 0)
            },
            "comparison": {
                "percentage_change": round(percentage_change, 2),
                "direction": change_direction,
                "absolute_difference_kwh": round(current_total - previous_total, 3)
            },
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Comparison error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate comparison")


@router.get("/recommendations")
async def get_recommendations(
    current_user: str = Depends(get_current_user)
):
    """
    Get personalized energy-saving recommendations.
    """
    try:
        energy_data = await get_energy_data("weekly")
        
        # Generate recommendations based on usage patterns
        recommendations = []
        
        for load in energy_data.get('loads', []):
            consumption = load.get('consumption_kwh', 0)
            runtime = load.get('runtime_hours', 0)
            
            if consumption > 3:
                recommendations.append({
                    "load": load.get('name'),
                    "title": f"Optimize {load.get('name')} Usage",
                    "description": f"This device has consumed {consumption}kWh. Consider reducing runtime or using during off-peak hours.",
                    "potential_savings": "10-20%",
                    "priority": "high"
                })
            elif runtime > 10:
                recommendations.append({
                    "load": load.get('name'),
                    "title": f"Schedule {load.get('name')}",
                    "description": f"Running for {runtime} hours. Consider using a timer to optimize usage.",
                    "potential_savings": "5-10%",
                    "priority": "medium"
                })

        # Add general recommendation
        recommendations.append({
            "load": "General",
            "title": "Monitor Peak Hours",
            "description": "Shift high-power activities to off-peak hours (after 9 PM) for better rates.",
            "potential_savings": "15-25%",
            "priority": "medium"
        })

        return {
            "recommendations": recommendations,
            "total_potential_savings": "Up to 25% on energy bills",
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate recommendations")


@router.get("/stats")
async def get_usage_stats(
    current_user: str = Depends(get_current_user)
):
    """
    Get comprehensive usage statistics.
    """
    try:
        daily_data = await get_energy_data("daily")
        weekly_data = await get_energy_data("weekly")
        
        return {
            "daily": {
                "consumption_kwh": daily_data.get('total_consumption_kwh', 0),
                "cost": daily_data.get('total_cost', 0),
                "peak_hour": daily_data.get('peak_hour', 'N/A')
            },
            "weekly": {
                "consumption_kwh": weekly_data.get('total_consumption_kwh', 0) * 7,
                "cost": weekly_data.get('total_cost', 0) * 7,
                "avg_daily_kwh": weekly_data.get('total_consumption_kwh', 0)
            },
            "loads_breakdown": daily_data.get('loads', []),
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")
