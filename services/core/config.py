# services/core/config.py
"""
Configuration settings for the AI Service
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    app_name: str = "Dashboard AI Agent"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # API Keys - Read from .env file in parent directory
    gemini_api_key: Optional[str] = None
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # CORS
    cors_origins: str = "*"
    
    # Rate Limiting
    chat_daily_limit: int = 100
    analysis_daily_limit: int = 50
    
    # Database (for connecting to existing PostgreSQL)
    database_url: Optional[str] = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "smart_load_db"
    db_user: str = "postgres"
    db_password: str = ""
    
    # Node.js Backend URL (for forwarding requests)
    nodejs_backend_url: str = "http://localhost:3000"
    
    # Logging
    log_level: str = "INFO"
    
    class Config:
        # Look for .env in parent directory (project root)
        import os
        current_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        env_file = os.path.join(current_dir, ".env")
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    @property
    def database_connection_string(self) -> str:
        """Build database connection string"""
        if self.database_url:
            return self.database_url
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Global settings instance
settings = get_settings()
