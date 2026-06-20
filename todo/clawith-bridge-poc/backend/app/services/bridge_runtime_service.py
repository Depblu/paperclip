"""Paperclip Bridge runtime service."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.audit import ChatMessage
from app.models.bridge_mapping import BridgeMapping
from app.models.chat_session import ChatSession
from app.models.llm import LLMModel
from app.schemas.bridge import BridgeWakeRequest, BridgeWakeResponse
from app.services.llm import call_llm_with_failover
from app.services.llm.utils import convert_chat_messages_to_llm_format, truncate_messages_with_pair_integrity
from app.services.token_tracker import estimate_token_usage_from_chars


async def run_bridge_wake(
    db: AsyncSession,
    mapping: BridgeMapping,
    request: BridgeWakeRequest,
) -> BridgeWakeResponse:
    result = await db.execute(select(Agent).where(Agent.id == mapping.clawith_agent_id))
    agent = result.scalar_one()
    chat_session = await ensure_bridge_session(db, agent, mapping, request)
    if not agent.primary_model_id and not agent.fallback_model_id:
        raise RuntimeError("Clawith Bridge agent has no model configured")

    primary_model = None
    fallback_model = None
    if agent.primary_model_id:
        primary_result = await db.execute(select(LLMModel).where(LLMModel.id == agent.primary_model_id))
        primary_model = primary_result.scalar_one()
    if agent.fallback_model_id:
        fallback_result = await db.execute(select(LLMModel).where(LLMModel.id == agent.fallback_model_id))
        fallback_model = fallback_result.scalar_one()

    user_prompt = _build_user_prompt(request)
    context_window_size = int(agent.context_window_size or 100)
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.agent_id == agent.id, ChatMessage.conversation_id == str(chat_session.id))
        .order_by(ChatMessage.created_at.desc())
        .limit(context_window_size)
    )
    history_messages = list(reversed(history_result.scalars().all()))
    llm_messages = convert_chat_messages_to_llm_format(history_messages)
    llm_messages.append({"role": "user", "content": user_prompt})
    llm_messages = truncate_messages_with_pair_integrity(llm_messages, context_window_size)
    db.add(ChatMessage(
        agent_id=agent.id,
        user_id=agent.creator_id,
        role="user",
        content=user_prompt,
        conversation_id=str(chat_session.id),
    ))

    message = await call_llm_with_failover(
        primary_model=primary_model,
        fallback_model=fallback_model,
        messages=llm_messages,
        agent_name=agent.name,
        role_description=agent.role_description or "",
        agent_id=agent.id,
        user_id=agent.creator_id,
        session_id=str(chat_session.id),
        supports_vision=bool(getattr(primary_model or fallback_model, "supports_vision", False)),
        current_user_name_override="Paperclip",
        system_prompt_suffix=(
            "\n\nThis request came from Paperclip Bridge. Complete the requested work in this runtime "
            "and return a concise result for Paperclip."
        ),
    )

    prompt_chars = sum(len(str(item.get("content") or "")) for item in llm_messages)
    usage = estimate_token_usage_from_chars(prompt_chars + len(message or ""))

    session_id = str(chat_session.id)
    now = datetime.now(timezone.utc)
    db.add(ChatMessage(
        agent_id=agent.id,
        user_id=agent.creator_id,
        role="assistant",
        content=message,
        conversation_id=session_id,
    ))
    chat_session.last_message_at = now
    mapping.clawith_session_id = session_id
    return BridgeWakeResponse(
        status="completed",
        paperclip_run_id=request.run_id,
        clawith_tenant_id=str(mapping.clawith_tenant_id),
        clawith_agent_id=str(mapping.clawith_agent_id),
        clawith_session_id=session_id,
        summary=message[:500],
        message=message,
        artifacts=[],
        usage={
            "model": getattr(primary_model or fallback_model, "model", None),
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cached_input_tokens": usage.cache_read_tokens,
        },
    )


async def ensure_bridge_session(
    db: AsyncSession,
    agent: Agent,
    mapping: BridgeMapping,
    request: BridgeWakeRequest,
) -> ChatSession:
    """Find or create one Clawith chat session for the Paperclip issue."""
    if mapping.clawith_session_id:
        try:
            result = await db.execute(
                select(ChatSession).where(ChatSession.id == uuid.UUID(mapping.clawith_session_id))
            )
            existing = result.scalar_one_or_none()
            if existing:
                return existing
        except Exception:
            pass

    external_conv_id = f"paperclip:{request.company_id}:{request.agent_id}:{request.issue_id or request.run_id}"
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.agent_id == agent.id,
            ChatSession.external_conv_id == external_conv_id,
        )
    )
    session = result.scalar_one_or_none()
    if session:
        return session

    title = request.issue.title or request.issue.identifier or f"Paperclip {request.run_id[:8]}"
    session = ChatSession(
        agent_id=agent.id,
        user_id=agent.creator_id,
        title=title[:200],
        source_channel="paperclip",
        external_conv_id=external_conv_id,
        is_group=False,
        is_primary=False,
    )
    db.add(session)
    await db.flush()
    return session


def _build_user_prompt(request: BridgeWakeRequest) -> str:
    comments = "\n".join(f"- {c.body}" for c in request.issue.comments[-10:])
    return "\n\n".join(
        part for part in [
            "Paperclip Bridge wake. Complete the requested work and return a concise result for Paperclip.",
            f"Company: {request.company_id}",
            f"Paperclip agent: {request.agent_id}",
            f"Run: {request.run_id}",
            f"Issue: {request.issue.identifier or request.issue.id or ''} {request.issue.title or ''}".strip(),
            request.issue.description or "",
            f"Goal: {request.goal.title}" if request.goal and request.goal.title else "",
            f"Recent comments:\n{comments}" if comments else "",
            request.message,
        ] if part
    )
