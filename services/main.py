# services/main.py
"""
Main entry point for the Dashboard AI Agent FastAPI application
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .api.router import api_router
from .llm.gemini_service import gemini_service

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info(f" Starting {settings.app_name} v{settings.app_version}")
    
    if gemini_service.initialized:
        logger.info(" Gemini AI service ready")
    else:
        logger.warning(" Gemini AI not initialized - using fallback responses")
    
    yield
    
    # Shutdown
    logger.info(" Shutting down AI service")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
    ## Dashboard AI Agent API
    
    AI-powered assistant for the Smart Load Monitoring Dashboard.
    
    ### Features
    - **Chat**: Interactive AI chat about your electrical loads
    - **Analysis**: Anomaly detection and load analysis
    - **Insights**: Energy usage insights and recommendations
    - **Control**: AI-powered control recommendations
    
    ### Authentication
    Include your token in the `Authorization` header:
    ```
    Authorization: Bearer <your_token>
    ```
    """,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "ai_enabled": gemini_service.initialized,
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "ai_service": "ready" if gemini_service.initialized else "fallback",
        "version": settings.app_version
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "services.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
