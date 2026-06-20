#!/usr/bin/env python3
"""Smoke test the real OpenAI-compatible model endpoint without storing secrets."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "http://127.0.0.1:8080/v1"
DEFAULT_MODEL = "gpt-5.4-mini"


def main() -> int:
    api_key = os.environ.get("CLAWITH_REAL_MODEL_API_KEY", "").strip()
    if not api_key:
        print("missing CLAWITH_REAL_MODEL_API_KEY", file=sys.stderr)
        return 2

    base_url = os.environ.get("CLAWITH_REAL_MODEL_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    model = os.environ.get("CLAWITH_REAL_MODEL_NAME", DEFAULT_MODEL)
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": "Reply with exactly: paperclip-clawith-ok",
            },
        ],
        "temperature": 0,
        "max_tokens": 16,
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        print(f"model_api_http_error status={exc.code} body={detail}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"model_api_error {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    choices = body.get("choices") or []
    content = ""
    if choices:
        content = ((choices[0].get("message") or {}).get("content") or "").strip()
    if not content:
        print(f"model_api_empty_response keys={sorted(body.keys())}", file=sys.stderr)
        return 1

    print(json.dumps({
        "status": "ok",
        "model": body.get("model", model),
        "content": content,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
