"""Paperclip Bridge authentication helpers."""

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, Request, status

from app.config import get_settings


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def verify_bridge_request(request: Request) -> dict[str, Any]:
    settings = get_settings()
    if not settings.BRIDGE_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bridge API disabled")
    if not settings.BRIDGE_SHARED_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bridge secret not configured")
    if not request.headers.get("x-request-id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing X-Request-Id")
    if not request.headers.get("x-idempotency-key"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing X-Idempotency-Key")

    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bridge bearer token")
    token = header[7:].strip()

    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
        expected = hmac.new(settings.BRIDGE_SHARED_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual = _b64decode(encoded_signature)
        if not hmac.compare_digest(expected, actual):
            raise ValueError("bad signature")
        payload = json.loads(_b64decode(encoded_payload))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bridge token") from exc

    now = int(time.time())
    if int(payload.get("exp") or 0) < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bridge token expired")
    if payload.get("iss") != settings.BRIDGE_JWT_ISSUER:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bridge issuer")
    if payload.get("aud") != settings.BRIDGE_JWT_AUDIENCE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bridge audience")
    run_id = payload.get("run_id")
    if run_id and request.headers.get("x-paperclip-run-id") != run_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paperclip run header mismatch")
    return payload
