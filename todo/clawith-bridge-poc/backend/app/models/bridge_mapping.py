"""Paperclip Bridge mapping model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BridgeMapping(Base):
    """Cross-system ID mapping for the Paperclip Bridge."""

    __tablename__ = "bridge_mappings"
    __table_args__ = (
        UniqueConstraint("paperclip_company_id", "paperclip_agent_id", name="uq_bridge_mapping_agent"),
        UniqueConstraint("idempotency_key", name="uq_bridge_mapping_idempotency_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    paperclip_company_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    paperclip_agent_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    paperclip_issue_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    paperclip_run_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    clawith_tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    clawith_agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    clawith_session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        Enum("active", "disabled", "failed", name="bridge_mapping_status_enum", create_constraint=False),
        default="active",
        nullable=False,
    )
    result: Mapped[dict | None] = mapped_column(JSON, default=None)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
