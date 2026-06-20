"""Offline Bridge contract smoke for the staged Clawith PoC files.

This verifier intentionally uses only the Python standard library so it can run
when Clawith backend dependencies are not installed. It checks the stable
Paperclip <-> Clawith Bridge contract: JWT scope, required headers, idempotency,
standard responses, readonly summaries, and security error classes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field


SECRET = "dev-secret"
ISSUER = "paperclip"
AUDIENCE = "clawith-bridge"


class BridgeError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Mapping:
    paperclip_company_id: str
    paperclip_agent_id: str
    clawith_tenant_id: str
    clawith_agent_id: str
    clawith_session_id: str | None = None
    paperclip_issue_id: str | None = None
    paperclip_run_id: str | None = None
    idempotency_key: str | None = None
    status: str = "active"
    result: dict | None = None
    executions: int = 0
    focus_items: list[dict] = field(default_factory=list)
    reflection_items: list[dict] = field(default_factory=list)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode((data + "=" * (-len(data) % 4)).encode("ascii"))


def sign_bridge_jwt(payload: dict, secret: str = SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64(signature)}"


def verify_bridge_request(headers: dict, method: str = "POST") -> dict:
    if not headers.get("X-Request-Id"):
        raise BridgeError(400, "Missing X-Request-Id")
    if not headers.get("X-Idempotency-Key"):
        raise BridgeError(400, "Missing X-Idempotency-Key")
    authorization = headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise BridgeError(401, "Missing bridge bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
        expected = hmac.new(SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual = _b64decode(encoded_signature)
        if not hmac.compare_digest(expected, actual):
            raise ValueError("bad signature")
        payload = json.loads(_b64decode(encoded_payload))
    except Exception as exc:
        raise BridgeError(401, "Invalid bridge token") from exc

    now = int(time.time())
    if int(payload.get("exp") or 0) < now:
        raise BridgeError(401, "Bridge token expired")
    if payload.get("iss") != ISSUER:
        raise BridgeError(401, "Invalid bridge issuer")
    if payload.get("aud") != AUDIENCE:
        raise BridgeError(401, "Invalid bridge audience")
    if payload.get("run_id") and headers.get("X-Paperclip-Run-Id") != payload["run_id"]:
        raise BridgeError(400, "Paperclip run header mismatch")
    return payload


def assert_claims_match(claims: dict, company_id: str, agent_id: str, run_id: str | None = None) -> None:
    if claims.get("company_id") != company_id or claims.get("agent_id") != agent_id:
        raise BridgeError(403, "Bridge token scope mismatch")
    if run_id is not None and claims.get("run_id") != run_id:
        raise BridgeError(403, "Bridge token run mismatch")


def assert_mapping_match(mapping: Mapping, company_id: str, agent_id: str) -> None:
    if mapping.paperclip_company_id != company_id or mapping.paperclip_agent_id != agent_id:
        raise BridgeError(403, "Mapping does not match request")


def make_headers(wake: dict, token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Paperclip-Run-Id": wake["run_id"],
        "X-Idempotency-Key": wake["idempotency_key"],
        "X-Request-Id": "demo-request-001",
    }


def bridge_wake(mapping: Mapping, wake: dict, headers: dict) -> dict:
    claims = verify_bridge_request(headers)
    assert_claims_match(claims, wake["company_id"], wake["agent_id"], wake["run_id"])
    if headers["X-Idempotency-Key"] != wake["idempotency_key"]:
        raise BridgeError(400, "Idempotency header/body mismatch")
    assert_mapping_match(mapping, wake["company_id"], wake["agent_id"])
    if mapping.idempotency_key == wake["idempotency_key"] and mapping.result:
        return mapping.result

    mapping.executions += 1
    mapping.paperclip_issue_id = wake["issue_id"]
    mapping.paperclip_run_id = wake["run_id"]
    mapping.idempotency_key = wake["idempotency_key"]
    mapping.clawith_session_id = f"cw-session-{wake['issue_id']}"
    mapping.result = {
        "status": "completed",
        "paperclip_run_id": wake["run_id"],
        "clawith_tenant_id": mapping.clawith_tenant_id,
        "clawith_agent_id": mapping.clawith_agent_id,
        "clawith_session_id": mapping.clawith_session_id,
        "summary": "ok",
        "message": "ok",
        "artifacts": [],
        "usage": {
            "model": "gpt-5.4-mini",
            "input_tokens": 1,
            "output_tokens": 1,
        },
    }
    return mapping.result


def bridge_state(mapping: Mapping, headers: dict) -> dict:
    claims = verify_bridge_request(headers, method="GET")
    assert_claims_match(claims, mapping.paperclip_company_id, mapping.paperclip_agent_id)
    return {
        "paperclip_company_id": mapping.paperclip_company_id,
        "paperclip_agent_id": mapping.paperclip_agent_id,
        "clawith_tenant_id": mapping.clawith_tenant_id,
        "clawith_agent_id": mapping.clawith_agent_id,
        "clawith_session_id": mapping.clawith_session_id,
        "status": mapping.status,
    }


def bridge_run(mapping: Mapping, paperclip_run_id: str, headers: dict) -> dict:
    claims = verify_bridge_request(headers, method="GET")
    if claims.get("run_id") != paperclip_run_id:
        raise BridgeError(403, "Bridge token run mismatch")
    assert_claims_match(claims, mapping.paperclip_company_id, mapping.paperclip_agent_id, paperclip_run_id)
    if mapping.paperclip_run_id != paperclip_run_id or not mapping.result:
        raise BridgeError(404, "Bridge run not found")
    return mapping.result


def bridge_focus(mapping: Mapping, headers: dict) -> dict:
    verify_bridge_request(headers, method="GET")
    return {
        "paperclip_agent_id": mapping.paperclip_agent_id,
        "clawith_agent_id": mapping.clawith_agent_id,
        "items": mapping.focus_items,
    }


def bridge_reflections(mapping: Mapping, headers: dict) -> dict:
    verify_bridge_request(headers, method="GET")
    return {
        "paperclip_agent_id": mapping.paperclip_agent_id,
        "clawith_agent_id": mapping.clawith_agent_id,
        "items": mapping.reflection_items,
    }


def expect_bridge_error(status: int, detail: str, fn) -> None:
    try:
        fn()
    except BridgeError as exc:
        assert exc.status == status, f"expected HTTP {status}, got {exc.status}"
        assert exc.detail == detail, f"expected {detail!r}, got {exc.detail!r}"
        return
    raise AssertionError(f"expected BridgeError({status}, {detail!r})")


def main() -> None:
    now = int(time.time())
    wake = {
        "company_id": "demo-company",
        "agent_id": "demo-agent",
        "issue_id": "demo-issue",
        "run_id": "demo-run-001",
        "idempotency_key": "demo-company:demo-agent:demo-issue:demo-run-001",
        "message": "请根据该 issue 输出一份执行建议。",
        "goal": {"id": "demo-goal", "title": "PoC"},
        "issue": {
            "id": "demo-issue",
            "identifier": "PC-1",
            "title": "PoC 测试 issue",
            "description": "验证 Paperclip 调用 Clawith 数字员工。",
            "comments": [],
        },
        "context": {"source": "paperclip", "mode": "poc"},
    }
    token = sign_bridge_jwt({
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": wake["agent_id"],
        "company_id": wake["company_id"],
        "agent_id": wake["agent_id"],
        "issue_id": wake["issue_id"],
        "run_id": wake["run_id"],
        "jti": "demo-jti",
        "iat": now,
        "exp": now + 300,
    })
    headers = make_headers(wake, token)
    mapping = Mapping(
        paperclip_company_id=wake["company_id"],
        paperclip_agent_id=wake["agent_id"],
        clawith_tenant_id="cw-tenant-1",
        clawith_agent_id="cw-agent-1",
        focus_items=[{"id": "focus-1", "title": "PoC focus", "status": "active"}],
    )

    first_result = bridge_wake(mapping, wake, headers)
    for _ in range(3):
        assert bridge_wake(mapping, wake, headers) is first_result
    assert mapping.executions == 1, "same idempotency key must not execute twice"
    assert first_result["paperclip_run_id"] == wake["run_id"]
    assert first_result["usage"]["model"] == "gpt-5.4-mini"

    state = bridge_state(mapping, headers)
    focus = bridge_focus(mapping, headers)
    reflections = bridge_reflections(mapping, headers)
    assert state["status"] == "active"
    assert state["clawith_session_id"] == "cw-session-demo-issue"
    assert focus["items"][0]["title"] == "PoC focus"
    assert reflections["items"] == []
    assert bridge_run(mapping, wake["run_id"], headers)["paperclip_run_id"] == wake["run_id"]

    bad_headers = dict(headers)
    bad_headers["Authorization"] = f"Bearer {token[:-3]}bad"
    expect_bridge_error(401, "Invalid bridge token", lambda: bridge_wake(mapping, wake, bad_headers))

    wrong_scope = dict(wake)
    wrong_scope["agent_id"] = "other-agent"
    expect_bridge_error(403, "Bridge token scope mismatch", lambda: bridge_wake(mapping, wrong_scope, headers))

    mismatched_idempotency = dict(headers)
    mismatched_idempotency["X-Idempotency-Key"] = "other-key"
    expect_bridge_error(
        400,
        "Idempotency header/body mismatch",
        lambda: bridge_wake(mapping, wake, mismatched_idempotency),
    )

    missing_request_id = dict(headers)
    del missing_request_id["X-Request-Id"]
    expect_bridge_error(400, "Missing X-Request-Id", lambda: bridge_wake(mapping, wake, missing_request_id))

    missing_get_idempotency = dict(headers)
    del missing_get_idempotency["X-Idempotency-Key"]
    expect_bridge_error(
        400,
        "Missing X-Idempotency-Key",
        lambda: bridge_state(mapping, missing_get_idempotency),
    )

    expect_bridge_error(403, "Bridge token run mismatch", lambda: bridge_run(mapping, "other-run", headers))

    print("bridge contract smoke ok")


if __name__ == "__main__":
    main()
