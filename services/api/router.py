# services/api/router.py
"""
Main API Router for the AI Service
"""
from fastapi import APIRouter
from .endpoints import chat, analysis, insights

api_router = APIRouter()

# Include sub-routers
api_router.include_router(
    chat.router,
    prefix="/chat",
    tags=["Chat"]
)

api_router.include_router(
    analysis.router,
    prefix="/analysis",
    tags=["Analysis"]
)

api_router.include_router(
    insights.router,
    prefix="/insights",
    tags=["Insights"]
)
