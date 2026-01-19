# services/api/endpoints/chat.py
"""
Chat API endpoints
"""
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Header

from ...models.chat import (
    ChatRequest, ChatResponse, ChatMessage, ChatHistory, 
    MessageRole, QuickInsightsRequest, QuickInsightsResponse
)
from ...llm.ai_agent import ai_agent
from ...core.rate_limiter import rate_limiter, CHAT_DAILY_LIMIT

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory chat history storage (replace with database in production)
chat_sessions: Dict[str, List[Dict[str, str]]] = {}


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """
    Extract user from authorization header.
    In production, verify JWT token.
    """
    if not authorization:
        return "anonymous"
    
    # Simple extraction - replace with proper JWT verification
    if authorization.startswith("Bearer "):
        token = authorization[7:]
        # For now, just use token as user ID
        return token[:20] if token else "anonymous"
    
    return "anonymous"


async def get_system_context() -> Dict[str, Any]:
    """
    Get system context from the main backend or database.
    This should be replaced with actual database queries or API calls.
    """
    # Mock context for standalone testing
    # In production, this would query the PostgreSQL database or call the Node.js backend
    return {
        "loads": [
            {
                "load_id": 1,
                "name": "DC Fan",
                "type": "dc",
                "is_on": True,
                "current_power": 45,
                "voltage": 12,
                "current": 3.75,
                "auto_mode": False
            },
            {
                "load_id": 2,
                "name": "AC Bulb",
                "type": "ac",
                "is_on": True,
                "current_power": 60,
                "voltage": 220,
                "current": 0.27,
                "auto_mode": True
            },
            {
                "load_id": 3,
                "name": "AC Heater",
                "type": "ac",
                "is_on": False,
                "current_power": 0,
                "voltage": 220,
                "current": 0,
                "auto_mode": False
            }
        ],
        "recentAlerts": [
            {
                "id": 1,
                "load_id": 1,
                "severity": "warning",
                "message": "DC Fan power consumption slightly elevated",
                "timestamp": datetime.utcnow().isoformat()
            }
        ],
        "hourlyTrends": [
            {"load_id": 1, "avg_power": 42, "max_power": 50},
            {"load_id": 2, "avg_power": 58, "max_power": 65}
        ],
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Send a message to the AI assistant and get a response.
    """
    try:
        # Check rate limit
        rate_check = await rate_limiter.check_rate_limit(
            user_id=current_user,
            action_type="chat",
            limit=CHAT_DAILY_LIMIT
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

        # Get system context if requested
        system_context = {}
        if request.include_context:
            system_context = await get_system_context()

        # Get chat history for session
        session_id = request.session_id or f"default_{current_user}"
        chat_history = chat_sessions.get(session_id, [])

        # Process query through AI agent
        result = await ai_agent.process_query(
            message=request.message,
            system_context=system_context,
            chat_history=chat_history
        )

        # Generate message ID
        message_id = str(uuid.uuid4())

        # Store messages in session history
        if session_id not in chat_sessions:
            chat_sessions[session_id] = []
        
        chat_sessions[session_id].append({
            "role": "user",
            "content": request.message
        })
        chat_sessions[session_id].append({
            "role": "assistant",
            "content": result['response']
        })

        # Keep only last 20 messages per session
        if len(chat_sessions[session_id]) > 20:
            chat_sessions[session_id] = chat_sessions[session_id][-20:]

        # Increment rate limit counter
        await rate_limiter.increment_count(current_user, "chat")

        return ChatResponse(
            message_id=message_id,
            response=result['response'],
            intent=result['intent'],
            entities=result['entities'],
            is_follow_up=result['is_follow_up'],
            timestamp=datetime.utcnow(),
            ai_enabled=result['ai_enabled']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@router.get("/history/{session_id}", response_model=ChatHistory)
async def get_chat_history(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Get chat history for a session.
    """
    try:
        messages = chat_sessions.get(session_id, [])
        
        chat_messages = []
        for i, msg in enumerate(messages):
            chat_messages.append(ChatMessage(
                message_id=f"{session_id}_{i}",
                session_id=session_id,
                role=MessageRole(msg['role']),
                content=msg['content'],
                timestamp=datetime.utcnow()
            ))

        return ChatHistory(
            session_id=session_id,
            messages=chat_messages,
            total_messages=len(chat_messages)
        )

    except Exception as e:
        logger.error(f"Error getting chat history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get chat history")


@router.delete("/history/{session_id}")
async def clear_chat_history(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Clear chat history for a session.
    """
    try:
        if session_id in chat_sessions:
            del chat_sessions[session_id]
        
        return {"success": True, "message": "Chat history cleared"}

    except Exception as e:
        logger.error(f"Error clearing chat history: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear chat history")


@router.post("/quick-insights", response_model=QuickInsightsResponse)
async def get_quick_insights(
    request: QuickInsightsRequest = QuickInsightsRequest(),
    current_user: str = Depends(get_current_user)
):
    """
    Get quick AI-powered insights for the dashboard.
    """
    try:
        system_context = await get_system_context()
        insights = await ai_agent.get_quick_insights(system_context)

        return QuickInsightsResponse(
            health=insights['health'],
            metrics=insights['metrics'],
            quick_tips=insights['quick_tips'] if request.include_tips else [],
            generated_at=datetime.utcnow()
        )

    except Exception as e:
        logger.error(f"Error getting quick insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to get insights")


@router.get("/rate-limit")
async def get_rate_limit_status(
    current_user: str = Depends(get_current_user)
):
    """
    Get current rate limit status for the user.
    """
    stats = await rate_limiter.get_usage_stats(current_user)
    chat_limit = await rate_limiter.check_rate_limit(current_user, "chat", CHAT_DAILY_LIMIT)
    
    return {
        "chat": {
            "limit": chat_limit['limit'],
            "remaining": chat_limit['remaining'],
            "reset_at": chat_limit['reset_at'].isoformat()
        },
        "usage": stats
    }
