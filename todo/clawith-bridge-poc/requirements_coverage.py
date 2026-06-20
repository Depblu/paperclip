#!/usr/bin/env python3
"""Static coverage checks for the Paperclip x Clawith PoC requirements."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PAPERCLIP = ROOT
CLAWITH = ROOT / "todo" / "Clawith"
REQ = ROOT / "todo" / "paperclip-clawith-poc-requirements-solution.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def require(path: Path, *needles: str) -> None:
    text = read(path)
    missing = [needle for needle in needles if needle not in text]
    if missing:
        rel = path.relative_to(ROOT)
        raise AssertionError(f"{rel} missing expected text: {missing}")


def main() -> None:
    require(REQ, "P1", "P2", "P3", "P4", "P5", "P6", "P7", "C1", "C9", "A11")

    require(PAPERCLIP / "packages/shared/src/constants.ts", '"clawith_bridge"')
    require(PAPERCLIP / "server/src/adapters/builtin-adapter-types.ts", '"clawith_bridge"')
    require(PAPERCLIP / "server/src/adapters/registry.ts", "clawithBridgeAdapter", "getClawithBridgeConfigSchema")
    require(PAPERCLIP / "ui/src/adapters/registry.ts", "clawithBridgeUIAdapter")
    require(PAPERCLIP / "cli/src/adapters/registry.ts", "clawithBridgeCLIAdapter")

    require(
        PAPERCLIP / "packages/adapters/clawith-bridge/src/server/config.ts",
        "baseUrl",
        "bridgeSecret",
        "timeoutSec",
        "writeBack",
        "CLAWITH_BRIDGE_ENABLED",
    )
    require(
        PAPERCLIP / "packages/adapters/clawith-bridge/src/server/execute.ts",
        "company_id",
        "agent_id",
        "issue_id",
        "run_id",
        "idempotency_key",
        "signBridgeJwt",
        "x-request-id",
        "x-paperclip-run-id",
        "x-idempotency-key",
        "fetchReadonlySummary",
        "summary: config.writeBack === \"issue_comment\"",
        "errorFamily: \"transient_upstream\"",
    )

    require(
        CLAWITH / "backend/app/api/bridge.py",
        '@router.get("/health")',
        '@router.post("/agents/sync"',
        '@router.post("/agents/{paperclip_agent_id}/wake"',
        '@router.get("/runs/{paperclip_run_id}"',
        '@router.get("/agents/{paperclip_agent_id}/state"',
        '@router.get("/agents/{paperclip_agent_id}/focus"',
        '@router.get("/agents/{paperclip_agent_id}/reflections"',
        "get_mapping_by_idempotency_key",
        "BridgeWakeResponse.model_validate(existing.result)",
        "asyncio.wait_for",
        "CLAWITH_RUNTIME_TIMEOUT",
        "Agent route/body mismatch",
        "Mapping does not match request",
    )
    require(
        CLAWITH / "backend/app/services/bridge_auth_service.py",
        "BRIDGE_ENABLED",
        "BRIDGE_SHARED_SECRET",
        "Missing X-Request-Id",
        "Missing X-Idempotency-Key",
        "Missing bridge bearer token",
        "Bridge token expired",
        "Paperclip run header mismatch",
        "hmac.compare_digest",
    )
    require(
        CLAWITH / "backend/app/services/bridge_runtime_service.py",
        "ChatSession",
        "ChatMessage",
        "call_llm_with_failover",
        "convert_chat_messages_to_llm_format",
        "truncate_messages_with_pair_integrity",
        "current_user_name_override=\"Paperclip\"",
    )
    require(
        CLAWITH / "backend/app/models/bridge_mapping.py",
        "__tablename__ = \"bridge_mappings\"",
        "paperclip_company_id",
        "paperclip_agent_id",
        "paperclip_issue_id",
        "paperclip_run_id",
        "clawith_tenant_id",
        "clawith_agent_id",
        "clawith_session_id",
        "idempotency_key",
        "UniqueConstraint",
    )
    require(CLAWITH / "backend/app/config.py", "BRIDGE_LLM_MODEL_NAME", "BRIDGE_LLM_BASE_URL")
    require(CLAWITH / "backend/app/main.py", "bridge_router", "app.include_router")

    print("requirements coverage ok")


if __name__ == "__main__":
    main()
