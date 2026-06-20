"""Paperclip Bridge mapping service."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.bridge_mapping import BridgeMapping
from app.models.llm import LLMModel
from app.models.tenant import Tenant
from app.models.user import Identity, User
from app.schemas.bridge import BridgeSyncRequest


async def get_or_create_bridge_mapping(db: AsyncSession, payload: BridgeSyncRequest) -> BridgeMapping:
    existing = await db.execute(
        select(BridgeMapping).where(
            BridgeMapping.paperclip_company_id == payload.company_id,
            BridgeMapping.paperclip_agent_id == payload.agent_id,
        )
    )
    mapping = existing.scalar_one_or_none()
    if mapping:
        return mapping

    tenant = await _get_or_create_tenant(db, payload.company_id)
    user = await _get_or_create_bridge_user(db, tenant)
    model = await _get_or_create_bridge_model(db, tenant)
    agent = Agent(
        name=payload.agent_name or f"Paperclip {payload.agent_id[:8]}",
        role_description=payload.role or payload.capabilities or "Paperclip Bridge digital employee",
        bio="Created by Paperclip Bridge sync.",
        avatar_url="",
        creator_id=user.id,
        tenant_id=tenant.id,
        status="idle",
        primary_model_id=model.id if model else None,
    )
    db.add(agent)
    await db.flush()

    mapping = BridgeMapping(
        paperclip_company_id=payload.company_id,
        paperclip_agent_id=payload.agent_id,
        clawith_tenant_id=tenant.id,
        clawith_agent_id=agent.id,
        status="active",
    )
    db.add(mapping)
    await db.flush()
    return mapping


async def get_mapping_for_run(db: AsyncSession, paperclip_run_id: str) -> BridgeMapping | None:
    result = await db.execute(select(BridgeMapping).where(BridgeMapping.paperclip_run_id == paperclip_run_id))
    return result.scalar_one_or_none()


async def get_mapping_by_idempotency_key(db: AsyncSession, key: str) -> BridgeMapping | None:
    result = await db.execute(select(BridgeMapping).where(BridgeMapping.idempotency_key == key))
    return result.scalar_one_or_none()


async def _get_or_create_tenant(db: AsyncSession, paperclip_company_id: str) -> Tenant:
    slug = f"paperclip-{paperclip_company_id[:24]}".lower()
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()
    if tenant:
        return tenant
    tenant = Tenant(name=f"Paperclip {paperclip_company_id[:8]}", slug=slug, im_provider="web_only")
    db.add(tenant)
    await db.flush()
    return tenant


async def _get_or_create_bridge_user(db: AsyncSession, tenant: Tenant) -> User:
    username = f"paperclip-bridge-{tenant.id}"
    result = await db.execute(
        select(User)
        .join(Identity, User.identity_id == Identity.id)
        .where(User.tenant_id == tenant.id, Identity.username == username)
    )
    user = result.scalar_one_or_none()
    if user:
        return user
    identity = Identity(
        username=username,
        email=f"{username}@paperclip-bridge.local",
        is_active=True,
        email_verified=True,
    )
    db.add(identity)
    await db.flush()
    user = User(
        id=uuid.uuid4(),
        identity_id=identity.id,
        tenant_id=tenant.id,
        display_name="Paperclip Bridge",
        role="agent_admin",
        is_active=True,
        registration_source="paperclip_bridge",
    )
    db.add(user)
    await db.flush()
    return user


async def _get_or_create_bridge_model(db: AsyncSession, tenant: Tenant) -> LLMModel | None:
    from app.config import get_settings

    settings = get_settings()
    if not settings.BRIDGE_LLM_MODEL_NAME or not settings.BRIDGE_LLM_API_KEY:
        return None

    result = await db.execute(
        select(LLMModel).where(
            LLMModel.tenant_id == tenant.id,
            LLMModel.provider == settings.BRIDGE_LLM_PROVIDER,
            LLMModel.model == settings.BRIDGE_LLM_MODEL_NAME,
        )
    )
    model = result.scalar_one_or_none()
    if model:
        return model

    model = LLMModel(
        tenant_id=tenant.id,
        provider=settings.BRIDGE_LLM_PROVIDER,
        model=settings.BRIDGE_LLM_MODEL_NAME,
        label=f"Paperclip Bridge {settings.BRIDGE_LLM_MODEL_NAME}",
        api_key_encrypted=settings.BRIDGE_LLM_API_KEY,
        base_url=settings.BRIDGE_LLM_BASE_URL,
        enabled=True,
        request_timeout=settings.BRIDGE_RUNTIME_TIMEOUT_SEC,
    )
    db.add(model)
    await db.flush()
    return model
