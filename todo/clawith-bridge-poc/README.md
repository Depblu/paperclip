# Clawith Bridge PoC Files

This directory mirrors files intended for `todo/Clawith/backend/app/`.
The live `todo/Clawith` path is writable in this workspace. These files remain
as a repeatable staging source for the Bridge PoC and have also been copied into
`todo/Clawith/backend/app/`.

Apply plan:

```sh
bash todo/clawith-bridge-poc/apply-to-clawith.sh todo/Clawith
```

Then finish the two entry-point edits if they have not already been applied:

1. In Clawith `backend/app/config.py`, add the Bridge settings from `config-snippet.txt`.
2. In Clawith `backend/app/main.py`, import `app.models.bridge_mapping`,
   import `bridge_router`, and include it with `prefix=settings.API_PREFIX`.

The script intentionally does not edit `config.py` or `main.py` because those
entry points vary across Clawith revisions and should be merged once against the
checked-out target.

Required Clawith env for local PoC:

```env
BRIDGE_ENABLED=true
BRIDGE_JWT_ISSUER=paperclip
BRIDGE_JWT_AUDIENCE=clawith-bridge
BRIDGE_SHARED_SECRET=dev-secret
BRIDGE_LLM_PROVIDER=openai
BRIDGE_LLM_MODEL_NAME=gpt-5.4-mini
BRIDGE_LLM_API_KEY=<set in shell>
BRIDGE_LLM_BASE_URL=http://127.0.0.1:8080/v1
BRIDGE_RUNTIME_TIMEOUT_SEC=120
```

The runtime service reuses Clawith's existing `ChatSession`/`ChatMessage`,
session history conversion, and `call_llm_with_failover` path so persona,
memory, workspace, focus, reflection, and native tools stay in Clawith. It does
not modify Paperclip's data model and does not embed Clawith runtime inside
Paperclip.

Local staged verification:

```sh
bash todo/clawith-bridge-poc/verify.sh
```

This checks Python syntax plus the offline Bridge JWT/header/idempotency,
security-error, run-state, focus, and reflections contract without requiring
Clawith's SQLAlchemy runtime dependencies.

Real model smoke when DNS/network is available:

```sh
CLAWITH_REAL_MODEL_API_KEY='<set in shell>' \
python3 todo/clawith-bridge-poc/smoke_real_model.py
```

Optional overrides:

```sh
CLAWITH_REAL_MODEL_NAME=gpt-5.4-mini
CLAWITH_REAL_MODEL_BASE_URL=http://127.0.0.1:8080/v1
```

Do not commit the real API key. The script reads it only from the shell
environment.
