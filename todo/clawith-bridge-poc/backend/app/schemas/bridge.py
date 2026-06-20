"""Paperclip Bridge API schemas."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class BridgeIssueComment(BaseModel):
    id: str | None = None
    body: str
    created_at: str | None = None
    author_type: str | None = None
    author_id: str | None = None


class BridgeIssue(BaseModel):
    id: str | None = None
    identifier: str | None = None
    title: str | None = None
    description: str | None = None
    comments: list[BridgeIssueComment] = Field(default_factory=list)


class BridgeGoal(BaseModel):
    id: str | None = None
    title: str | None = None


class BridgeWakeRequest(BaseModel):
    company_id: str
    agent_id: str
    issue_id: str | None = None
    run_id: str
    idempotency_key: str
    message: str
    goal: BridgeGoal | None = None
    issue: BridgeIssue = Field(default_factory=BridgeIssue)
    context: dict[str, Any] = Field(default_factory=dict)


class BridgeWakeResponse(BaseModel):
    status: Literal["completed", "accepted", "failed"]
    paperclip_run_id: str
    clawith_tenant_id: str | None = None
    clawith_agent_id: str | None = None
    clawith_session_id: str | None = None
    summary: str | None = None
    message: str | None = None
    artifacts: list[Any] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    poll_url: str | None = None
    error_code: str | None = None
    retryable: bool | None = None


class BridgeSyncRequest(BaseModel):
    company_id: str
    agent_id: str
    agent_name: str | None = None
    role: str | None = None
    capabilities: str | None = None


class BridgeSyncResponse(BaseModel):
    paperclip_company_id: str
    paperclip_agent_id: str
    clawith_tenant_id: str
    clawith_agent_id: str
    status: str
