# services/models/chat.py
"""
Chat models for the Dashboard AI Agent
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    """Message role in chat"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    """Individual chat message"""
    message_id: str = Field(..., description="Unique message identifier")
    session_id: str = Field(..., description="Session this message belongs to")
    role: MessageRole = Field(..., description="Message role")
    content: str = Field(..., description="Message content")
    intent: Optional[str] = Field(None, description="Detected intent for user messages")
    entities: Optional[Dict[str, List[str]]] = Field(None, description="Extracted entities")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

    class Config:
        use_enum_values = True


class ChatRequest(BaseModel):
    """Request to send a chat message"""
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    session_id: Optional[str] = Field(None, description="Chat session identifier")
    include_context: bool = Field(True, description="Whether to include system context")

    class Config:
        json_schema_extra = {
            "example": {
                "message": "What is the current status of the DC Fan?",
                "session_id": "sess_123",
                "include_context": True
            }
        }


class ChatResponse(BaseModel):
    """Response from chat"""
    message_id: str = Field(..., description="Message identifier")
    response: str = Field(..., description="Assistant response")
    intent: str = Field(..., description="Detected intent")
    entities: Dict[str, List[str]] = Field(default_factory=dict, description="Extracted entities")
    is_follow_up: bool = Field(False, description="Whether this was a follow-up question")
    timestamp: datetime = Field(..., description="Response timestamp")
    ai_enabled: bool = Field(True, description="Whether AI was used for response")

    class Config:
        json_schema_extra = {
            "example": {
                "message_id": "msg_abc123",
                "response": "The DC Fan is currently ON and consuming 45W of power.",
                "intent": "status",
                "entities": {"load_name": ["fan"]},
                "is_follow_up": False,
                "timestamp": "2026-01-19T10:30:00Z",
                "ai_enabled": True
            }
        }


class ChatHistory(BaseModel):
    """Chat history for a session"""
    session_id: str = Field(..., description="Session identifier")
    messages: List[ChatMessage] = Field(default_factory=list, description="List of messages")
    total_messages: int = Field(default=0, description="Total number of messages")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)


class ChatSession(BaseModel):
    """Chat session information"""
    session_id: str = Field(..., description="Session identifier")
    user_id: str = Field(..., description="User who owns the session")
    title: Optional[str] = Field(None, description="Session title")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    message_count: int = Field(default=0)


class QuickInsightsRequest(BaseModel):
    """Request for quick insights"""
    include_tips: bool = Field(True, description="Include quick tips")
    include_metrics: bool = Field(True, description="Include system metrics")


class QuickInsightsResponse(BaseModel):
    """Quick insights response"""
    health: Dict[str, str] = Field(..., description="System health status")
    metrics: Dict[str, Any] = Field(..., description="Key metrics")
    quick_tips: List[str] = Field(default_factory=list, description="Contextual tips")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
