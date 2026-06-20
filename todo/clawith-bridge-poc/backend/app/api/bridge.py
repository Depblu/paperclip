"""Paperclip Bridge API."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.models.agent import Agent
from app.models.tenant import Tenant
from app.schemas.bridge import (
    BridgeAgentLinkOption,
    BridgeAgentLinkOptionsResponse,
    BridgeLinkCheckRequest,
    BridgeLinkCheckResponse,
    BridgeSyncRequest,
    BridgeSyncResponse,
    BridgeWakeRequest,
    BridgeWakeResponse,
)
from app.services.bridge_auth_service import verify_bridge_request
from app.services.bridge_mapping_service import (
    get_mapping_by_idempotency_key,
    get_mapping_for_run,
    get_or_create_bridge_mapping,
    validate_existing_clawith_agent,
)
from app.services.bridge_runtime_service import run_bridge_wake

router = APIRouter(prefix="/bridge", tags=["paperclip-bridge"])


@router.get("/health")
async def bridge_health():
    settings = get_settings()
    return {
        "status": "ok",
        "service": "clawith-bridge",
        "bridge_enabled": settings.BRIDGE_ENABLED,
        "secret_configured": bool(settings.BRIDGE_SHARED_SECRET),
    }


@router.post("/agents/sync", response_model=BridgeSyncResponse)
async def sync_agent(
    payload: BridgeSyncRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    _assert_claims_match(claims, payload.company_id, payload.agent_id, None)
    mapping = await get_or_create_bridge_mapping(db, payload)
    return BridgeSyncResponse(
        paperclip_company_id=mapping.paperclip_company_id,
        paperclip_agent_id=mapping.paperclip_agent_id,
        clawith_tenant_id=str(mapping.clawith_tenant_id),
        clawith_agent_id=str(mapping.clawith_agent_id),
        status=mapping.status,
    )


@router.get("/agents/link-options", response_model=BridgeAgentLinkOptionsResponse)
async def list_agent_link_options(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    verify_bridge_request(request)
    result = await db.execute(
        select(Agent, Tenant)
        .join(Tenant, Agent.tenant_id == Tenant.id)
        .order_by(Tenant.name.asc(), Agent.name.asc())
    )
    return BridgeAgentLinkOptionsResponse(
        agents=[
            BridgeAgentLinkOption(
                tenant_id=str(tenant.id),
                tenant_name=tenant.name,
                agent_id=str(agent.id),
                agent_name=agent.name,
                status=getattr(agent, "status", None),
            )
            for agent, tenant in result.all()
        ],
    )


@router.post("/agents/link-check", response_model=BridgeLinkCheckResponse)
async def check_agent_link(
    payload: BridgeLinkCheckRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    _assert_claims_match(claims, payload.company_id, payload.agent_id, None)
    if payload.link_mode != "link_existing":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="link_mode must be link_existing")
    tenant, agent = await validate_existing_clawith_agent(db, payload.clawith_tenant_id, payload.clawith_agent_id)
    return BridgeLinkCheckResponse(
        status="valid",
        clawith_tenant_id=str(tenant.id),
        clawith_agent_id=str(agent.id),
    )


@router.post("/agents/{paperclip_agent_id}/wake", response_model=BridgeWakeResponse)
async def wake_agent(
    paperclip_agent_id: str,
    payload: BridgeWakeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    if payload.agent_id != paperclip_agent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent route/body mismatch")
    _assert_claims_match(claims, payload.company_id, payload.agent_id, payload.run_id)
    if request.headers.get("x-idempotency-key") != payload.idempotency_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idempotency header/body mismatch")

    existing = await get_mapping_by_idempotency_key(db, payload.idempotency_key)
    if existing:
        _assert_mapping_match(existing, payload.company_id, payload.agent_id)
        if existing.result:
            return BridgeWakeResponse.model_validate(existing.result)

    mapping = existing or await get_or_create_bridge_mapping(
        db,
        BridgeSyncRequest(
            company_id=payload.company_id,
            agent_id=payload.agent_id,
            agent_name=f"Paperclip {payload.agent_id[:8]}",
        ),
    )
    _assert_mapping_match(mapping, payload.company_id, payload.agent_id)

    mapping.paperclip_issue_id = payload.issue_id
    mapping.paperclip_run_id = payload.run_id
    mapping.idempotency_key = payload.idempotency_key
    try:
        response = await asyncio.wait_for(
            run_bridge_wake(db, mapping, payload),
            timeout=float(get_settings().BRIDGE_RUNTIME_TIMEOUT_SEC),
        )
        mapping.clawith_session_id = response.clawith_session_id
        mapping.status = "active"
        mapping.result = response.model_dump()
        mapping.error_message = None
        return response
    except asyncio.TimeoutError:
        response = BridgeWakeResponse(
            status="failed",
            paperclip_run_id=payload.run_id,
            clawith_tenant_id=str(mapping.clawith_tenant_id),
            clawith_agent_id=str(mapping.clawith_agent_id),
            clawith_session_id=mapping.clawith_session_id,
            message="Clawith runtime execution timed out",
            error_code="CLAWITH_RUNTIME_TIMEOUT",
            retryable=True,
        )
        mapping.status = "failed"
        mapping.result = response.model_dump()
        mapping.error_message = response.message
        return response
    except Exception as exc:
        response = BridgeWakeResponse(
            status="failed",
            paperclip_run_id=payload.run_id,
            clawith_tenant_id=str(mapping.clawith_tenant_id),
            clawith_agent_id=str(mapping.clawith_agent_id),
            clawith_session_id=mapping.clawith_session_id,
            message=str(exc),
            error_code="CLAWITH_RUNTIME_ERROR",
            retryable=True,
        )
        mapping.status = "failed"
        mapping.result = response.model_dump()
        mapping.error_message = str(exc)
        return response


@router.get("/runs/{paperclip_run_id}", response_model=BridgeWakeResponse)
async def get_run(
    paperclip_run_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    if claims.get("run_id") != paperclip_run_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bridge token run mismatch")
    mapping = await get_mapping_for_run(db, paperclip_run_id)
    if not mapping or not mapping.result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bridge run not found")
    _assert_claims_match(claims, mapping.paperclip_company_id, mapping.paperclip_agent_id, paperclip_run_id)
    return BridgeWakeResponse.model_validate(mapping.result)


@router.get("/agents/{paperclip_agent_id}/state")
async def get_agent_state(
    paperclip_agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    company_id = str(claims.get("company_id") or "")
    _assert_claims_match(claims, company_id, paperclip_agent_id, None)
    mapping = await get_or_create_bridge_mapping(
        db,
        BridgeSyncRequest(company_id=company_id, agent_id=paperclip_agent_id),
    )
    return {
        "paperclip_company_id": mapping.paperclip_company_id,
        "paperclip_agent_id": mapping.paperclip_agent_id,
        "clawith_tenant_id": str(mapping.clawith_tenant_id),
        "clawith_agent_id": str(mapping.clawith_agent_id),
        "clawith_session_id": mapping.clawith_session_id,
        "status": mapping.status,
    }


@router.get("/agents/{paperclip_agent_id}/focus")
async def get_agent_focus(
    paperclip_agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    company_id = str(claims.get("company_id") or "")
    _assert_claims_match(claims, company_id, paperclip_agent_id, None)
    mapping = await get_or_create_bridge_mapping(
        db,
        BridgeSyncRequest(company_id=company_id, agent_id=paperclip_agent_id),
    )
    try:
        from app.models.focus import AgentFocusItem
        from sqlalchemy import select

        result = await db.execute(
            select(AgentFocusItem)
            .where(AgentFocusItem.agent_id == mapping.clawith_agent_id)
            .order_by(AgentFocusItem.updated_at.desc())
            .limit(20)
        )
        items = result.scalars().all()
        return {
            "paperclip_agent_id": paperclip_agent_id,
            "clawith_agent_id": str(mapping.clawith_agent_id),
            "items": [
                {
                    "id": str(item.id),
                    "title": getattr(item, "title", None),
                    "status": getattr(item, "status", None),
                    "kind": getattr(item, "kind", None),
                    "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None,
                }
                for item in items
            ],
        }
    except Exception:
        return {
            "paperclip_agent_id": paperclip_agent_id,
            "clawith_agent_id": str(mapping.clawith_agent_id),
            "items": [],
        }


@router.get("/agents/{paperclip_agent_id}/reflections")
async def get_agent_reflections(
    paperclip_agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    claims = verify_bridge_request(request)
    company_id = str(claims.get("company_id") or "")
    _assert_claims_match(claims, company_id, paperclip_agent_id, None)
    mapping = await get_or_create_bridge_mapping(
        db,
        BridgeSyncRequest(company_id=company_id, agent_id=paperclip_agent_id),
    )
    return {
        "paperclip_agent_id": paperclip_agent_id,
        "clawith_agent_id": str(mapping.clawith_agent_id),
        "items": [],
    }


def _assert_claims_match(claims: dict, company_id: str, agent_id: str, run_id: str | None) -> None:
    if claims.get("company_id") != company_id or claims.get("agent_id") != agent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bridge token scope mismatch")
    if run_id is not None and claims.get("run_id") != run_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bridge token run mismatch")


def _assert_mapping_match(mapping, company_id: str, agent_id: str) -> None:
    if mapping.paperclip_company_id != company_id or mapping.paperclip_agent_id != agent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mapping does not match request")
