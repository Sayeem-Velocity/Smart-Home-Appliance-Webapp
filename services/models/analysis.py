# services/models/analysis.py
"""
Analysis models for the Dashboard AI Agent
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class SeverityLevel(str, Enum):
    """Severity levels for issues and alerts"""
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TrendDirection(str, Enum):
    """Trend direction indicators"""
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"


class LoadIssue(BaseModel):
    """Individual load issue from analysis"""
    load_id: int = Field(..., description="ID of the affected load")
    load_name: str = Field(..., description="Name of the affected load")
    issue: str = Field(..., description="Description of the issue")
    severity: SeverityLevel = Field(..., description="Issue severity")
    recommendation: str = Field(..., description="Recommended action")


class AnomalyReport(BaseModel):
    """Report from anomaly analysis"""
    has_anomaly: bool = Field(..., description="Whether anomalies were detected")
    severity: SeverityLevel = Field(SeverityLevel.NONE, description="Overall severity")
    issues: List[LoadIssue] = Field(default_factory=list, description="List of detected issues")
    summary: str = Field(..., description="Summary of analysis")
    safety_alerts: List[str] = Field(default_factory=list, description="Safety-related alerts")
    efficiency_tips: List[str] = Field(default_factory=list, description="Efficiency recommendations")
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "has_anomaly": True,
                "severity": "medium",
                "issues": [
                    {
                        "load_id": 1,
                        "load_name": "DC Fan",
                        "issue": "Power consumption 20% higher than normal",
                        "severity": "medium",
                        "recommendation": "Check for mechanical obstruction"
                    }
                ],
                "summary": "One anomaly detected in DC Fan power consumption",
                "safety_alerts": [],
                "efficiency_tips": ["Consider cleaning fan blades"],
                "analyzed_at": "2026-01-19T10:30:00Z"
            }
        }


class TrendObservation(BaseModel):
    """Individual trend observation"""
    observation: str = Field(..., description="Trend observation description")
    trend_direction: TrendDirection = Field(..., description="Direction of trend")
    significance: SeverityLevel = Field(..., description="Significance level")

    class Config:
        use_enum_values = True


class EnergyRecommendation(BaseModel):
    """Energy saving recommendation"""
    title: str = Field(..., description="Recommendation title")
    description: str = Field(..., description="Detailed description")
    potential_savings: str = Field(..., description="Estimated savings")
    priority: SeverityLevel = Field(..., description="Priority level")

    class Config:
        use_enum_values = True


class HighestConsumer(BaseModel):
    """Information about highest energy consumer"""
    load_name: str = Field(..., description="Name of the load")
    consumption_kwh: float = Field(..., description="Consumption in kWh")
    percentage: float = Field(..., description="Percentage of total consumption")


class EnergyInsight(BaseModel):
    """Energy analysis insights"""
    summary: str = Field(..., description="Summary of energy analysis")
    total_consumption_kwh: float = Field(0, description="Total consumption in kWh")
    estimated_cost: float = Field(0, description="Estimated cost")
    peak_usage_time: str = Field("", description="Peak usage time period")
    highest_consumer: Optional[HighestConsumer] = Field(None, description="Highest consuming load")
    trends: List[TrendObservation] = Field(default_factory=list, description="Observed trends")
    recommendations: List[EnergyRecommendation] = Field(default_factory=list, description="Recommendations")
    comparison_note: str = Field("", description="Comparison with previous period")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    time_period: str = Field("daily", description="Analysis time period")

    class Config:
        json_schema_extra = {
            "example": {
                "summary": "Energy consumption is within normal range",
                "total_consumption_kwh": 12.5,
                "estimated_cost": 1.50,
                "peak_usage_time": "14:00-18:00",
                "highest_consumer": {
                    "load_name": "AC Heater",
                    "consumption_kwh": 8.2,
                    "percentage": 65.6
                },
                "trends": [
                    {
                        "observation": "Morning usage decreased by 10%",
                        "trend_direction": "decreasing",
                        "significance": "low"
                    }
                ],
                "recommendations": [
                    {
                        "title": "Optimize Heater Schedule",
                        "description": "Consider using timer to reduce heater runtime",
                        "potential_savings": "15-20%",
                        "priority": "medium"
                    }
                ],
                "comparison_note": "5% lower than yesterday",
                "time_period": "daily"
            }
        }


class LoadAnalysis(BaseModel):
    """Comprehensive load analysis"""
    load_id: int = Field(..., description="Load identifier")
    load_name: str = Field(..., description="Load name")
    status: str = Field(..., description="Current status (on/off)")
    current_power_w: float = Field(..., description="Current power in watts")
    voltage_v: float = Field(0, description="Voltage reading")
    current_a: float = Field(0, description="Current reading in amps")
    health_score: float = Field(100, ge=0, le=100, description="Health score 0-100")
    anomalies: List[str] = Field(default_factory=list, description="Detected anomalies")
    recommendations: List[str] = Field(default_factory=list, description="Recommendations")
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)


class ControlRecommendation(BaseModel):
    """AI recommendation for control action"""
    approved: bool = Field(..., description="Whether action is approved")
    reason: str = Field(..., description="Reason for decision")
    warnings: List[str] = Field(default_factory=list, description="Warnings if any")
    suggestions: List[str] = Field(default_factory=list, description="Alternative suggestions")
    confidence: float = Field(1.0, ge=0, le=1, description="Confidence score")

    class Config:
        json_schema_extra = {
            "example": {
                "approved": True,
                "reason": "No safety concerns detected",
                "warnings": ["Consider power consumption during peak hours"],
                "suggestions": [],
                "confidence": 0.95
            }
        }


class DailySummaryRequest(BaseModel):
    """Request for daily summary"""
    date: Optional[datetime] = Field(None, description="Date for summary (defaults to today)")
    include_recommendations: bool = Field(True)


class TelemetryAnalysisRequest(BaseModel):
    """Request for telemetry analysis"""
    telemetry_data: Dict[str, Any] = Field(..., description="Telemetry data to analyze")
    include_historical: bool = Field(False, description="Include historical comparison")


class ControlActionRequest(BaseModel):
    """Request for control action recommendation"""
    load_id: int = Field(..., description="Load to control")
    action: str = Field(..., description="Proposed action (on/off/toggle)")
    force: bool = Field(False, description="Force action despite warnings")

    class Config:
        json_schema_extra = {
            "example": {
                "load_id": 1,
                "action": "on",
                "force": False
            }
        }
