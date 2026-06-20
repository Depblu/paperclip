"""Paperclip Bridge mapping service."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
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
    if payload.link_mode == "link_existing":
        return await _link_existing_bridge_mapping(db, payload, mapping)
    if mapping:
        await _ensure_mapped_agent_has_model(db, mapping)
        return mapping

    tenant, model = await _get_auto_create_target(db, payload.company_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clawith Bridge auto-create requires a tenant default model, an enabled tenant model, or BRIDGE_LLM_* config",
        )
    user = await _get_or_create_bridge_user(db, tenant)
    agent = Agent(
        name=payload.agent_name or f"Paperclip {payload.agent_id[:8]}",
        role_description=getattr(payload, "role", None)
        or getattr(payload, "capabilities", None)
        or "Paperclip Bridge digital employee",
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


async def _ensure_mapped_agent_has_model(db: AsyncSession, mapping: BridgeMapping) -> None:
    agent_result = await db.execute(select(Agent).where(Agent.id == mapping.clawith_agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent or agent.primary_model_id or agent.fallback_model_id:
        return

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == mapping.clawith_tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        return

    model = await _resolve_bridge_model(db, tenant)
    if not model:
        target = await _find_bridge_target_tenant_with_model(db)
        if target:
            tenant, model = target
            user = await _get_or_create_bridge_user(db, tenant)
            agent.tenant_id = tenant.id
            agent.creator_id = user.id
            mapping.clawith_tenant_id = tenant.id
            db.add(mapping)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clawith Bridge mapped agent has no model configured and no tenant model is available",
        )
    agent.primary_model_id = model.id
    db.add(agent)
    await db.flush()


async def validate_existing_clawith_agent(
    db: AsyncSession,
    tenant_id: str | None,
    agent_id: str | None,
) -> tuple[Tenant, Agent]:
    tenant_uuid = _read_uuid(tenant_id, "clawith_tenant_id")
    agent_uuid = _read_uuid(agent_id, "clawith_agent_id")

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_uuid))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clawith tenant not found")

    agent_result = await db.execute(select(Agent).where(Agent.id == agent_uuid))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clawith agent not found")
    if str(agent.tenant_id) != str(tenant.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clawith agent does not belong to tenant")
    return tenant, agent


async def _link_existing_bridge_mapping(
    db: AsyncSession,
    payload: BridgeSyncRequest,
    mapping: BridgeMapping | None,
) -> BridgeMapping:
    tenant, agent = await validate_existing_clawith_agent(db, payload.clawith_tenant_id, payload.clawith_agent_id)
    if mapping:
        if str(mapping.clawith_tenant_id) == str(tenant.id) and str(mapping.clawith_agent_id) == str(agent.id):
            return mapping
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paperclip agent already linked to a different Clawith agent",
        )

    mapping = BridgeMapping(
        paperclip_company_id=payload.company_id,
        paperclip_agent_id=payload.agent_id,
        clawith_tenant_id=tenant.id,
        clawith_agent_id=agent.id,
        status="active",
        metadata_json={
            "link_mode": "link_existing",
            "linked_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(mapping)
    await db.flush()
    return mapping


def _read_uuid(value: str | None, field_name: str) -> uuid.UUID:
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} is required")
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} must be a UUID")


async def get_mapping_for_run(db: AsyncSession, paperclip_run_id: str) -> BridgeMapping | None:
    result = await db.execute(select(BridgeMapping).where(BridgeMapping.paperclip_run_id == paperclip_run_id))
    return result.scalar_one_or_none()


async def get_mapping_by_idempotency_key(db: AsyncSession, key: str) -> BridgeMapping | None:
    result = await db.execute(select(BridgeMapping).where(BridgeMapping.idempotency_key == key))
    return result.scalar_one_or_none()


async def _get_auto_create_target(db: AsyncSession, paperclip_company_id: str) -> tuple[Tenant, LLMModel | None]:
    target = await _get_configured_target_tenant_with_model(db)
    if target:
        return target

    tenant = await _get_paperclip_tenant(db, paperclip_company_id)
    if tenant:
        model = await _resolve_bridge_model(db, tenant)
        if model:
            return tenant, model

    target = await _find_single_tenant_with_existing_model(db)
    if target:
        return target

    tenant = tenant or await _create_paperclip_tenant(db, paperclip_company_id)
    return tenant, await _get_or_create_bridge_model(db, tenant)


async def _get_configured_target_tenant_with_model(db: AsyncSession) -> tuple[Tenant, LLMModel] | None:
    from app.config import get_settings

    target_tenant_id = str(getattr(get_settings(), "BRIDGE_TARGET_TENANT_ID", "") or "").strip()
    if not target_tenant_id:
        return None
    try:
        tenant_uuid = uuid.UUID(target_tenant_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="BRIDGE_TARGET_TENANT_ID must be a UUID",
        )

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_uuid))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="BRIDGE_TARGET_TENANT_ID tenant not found",
        )
    model = await _resolve_bridge_model(db, tenant)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="BRIDGE_TARGET_TENANT_ID tenant has no enabled model",
        )
    return tenant, model


async def _get_paperclip_tenant(db: AsyncSession, paperclip_company_id: str) -> Tenant | None:
    slug = f"paperclip-{paperclip_company_id[:24]}".lower()
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    return result.scalar_one_or_none()


async def _create_paperclip_tenant(db: AsyncSession, paperclip_company_id: str) -> Tenant:
    slug = f"paperclip-{paperclip_company_id[:24]}".lower()
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


async def _resolve_bridge_model(db: AsyncSession, tenant: Tenant) -> LLMModel | None:
    model = await _find_existing_model_for_tenant(db, tenant)
    if model:
        return model
    return await _get_or_create_bridge_model(db, tenant)


async def _find_existing_model_for_tenant(db: AsyncSession, tenant: Tenant) -> LLMModel | None:
    if getattr(tenant, "default_model_id", None):
        result = await db.execute(
            select(LLMModel).where(
                LLMModel.id == tenant.default_model_id,
                LLMModel.enabled == True,  # noqa: E712
            )
        )
        model = result.scalar_one_or_none()
        if model:
            return model

    result = await db.execute(
        select(LLMModel)
        .where(
            LLMModel.tenant_id == tenant.id,
            LLMModel.enabled == True,  # noqa: E712
        )
        .order_by(LLMModel.created_at.asc())
    )
    model = result.scalars().first()
    if model:
        return model
    return None


def _single_tenant_model(rows: list[tuple[Tenant, LLMModel]]) -> tuple[Tenant, LLMModel] | None:
    by_tenant: dict[str, tuple[Tenant, LLMModel]] = {}
    for tenant, model in rows:
        by_tenant.setdefault(str(tenant.id), (tenant, model))
    if len(by_tenant) == 1:
        return next(iter(by_tenant.values()))
    return None


async def _find_single_tenant_with_existing_model(db: AsyncSession) -> tuple[Tenant, LLMModel] | None:
    result = await db.execute(
        select(Tenant, LLMModel)
        .join(LLMModel, Tenant.default_model_id == LLMModel.id)
        .where(LLMModel.enabled == True)  # noqa: E712
        .order_by(Tenant.created_at.asc())
    )
    row = _single_tenant_model(result.all())
    if row:
        return row

    result = await db.execute(
        select(Tenant, LLMModel)
        .join(LLMModel, LLMModel.tenant_id == Tenant.id)
        .where(LLMModel.enabled == True)  # noqa: E712
        .order_by(Tenant.created_at.asc(), LLMModel.created_at.asc())
    )
    return _single_tenant_model(result.all())


async def _find_bridge_target_tenant_with_model(db: AsyncSession) -> tuple[Tenant, LLMModel] | None:
    target = await _get_configured_target_tenant_with_model(db)
    if target:
        return target
    return await _find_single_tenant_with_existing_model(db)


async def _get_or_create_bridge_model(db: AsyncSession, tenant: Tenant) -> LLMModel | None:
    from app.config import get_settings

    settings = get_settings()
    bridge_model_name = getattr(settings, "BRIDGE_LLM_MODEL_NAME", "")
    bridge_api_key = getattr(settings, "BRIDGE_LLM_API_KEY", "")
    bridge_provider = getattr(settings, "BRIDGE_LLM_PROVIDER", "openai")
    bridge_base_url = getattr(settings, "BRIDGE_LLM_BASE_URL", None)
    bridge_timeout = getattr(settings, "BRIDGE_RUNTIME_TIMEOUT_SEC", None)
    if not bridge_model_name or not bridge_api_key:
        return None

    result = await db.execute(
        select(LLMModel).where(
            LLMModel.tenant_id == tenant.id,
            LLMModel.provider == bridge_provider,
            LLMModel.model == bridge_model_name,
        )
    )
    model = result.scalar_one_or_none()
    if model:
        return model

    model = LLMModel(
        tenant_id=tenant.id,
        provider=bridge_provider,
        model=bridge_model_name,
        label=f"Paperclip Bridge {bridge_model_name}",
        api_key_encrypted=bridge_api_key,
        base_url=bridge_base_url,
        enabled=True,
        request_timeout=bridge_timeout,
    )
    db.add(model)
    await db.flush()
    return model
