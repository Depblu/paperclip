"""Source-level Bridge verifier using lightweight dependency stubs.

This checks that the staged Clawith Bridge source files keep the expected
control flow even when the full Clawith dependency set is unavailable locally.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import importlib.util
import json
import sys
import time
import types
import uuid
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "Clawith" / "backend" / "app"


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class Status:
    HTTP_400_BAD_REQUEST = 400
    HTTP_401_UNAUTHORIZED = 401
    HTTP_403_FORBIDDEN = 403
    HTTP_404_NOT_FOUND = 404
    HTTP_409_CONFLICT = 409
    HTTP_422_UNPROCESSABLE_ENTITY = 422
    HTTP_503_SERVICE_UNAVAILABLE = 503


class Headers(dict):
    def get(self, key, default=None):
        return super().get(str(key).lower(), default)


class Request:
    def __init__(self, headers: dict[str, str], method: str = "POST"):
        self.headers = Headers({k.lower(): v for k, v in headers.items()})
        self.method = method


class Router:
    def __init__(self, *args, **kwargs):
        self.routes = []

    def get(self, path, **kwargs):
        return self._route("GET", path)

    def post(self, path, **kwargs):
        return self._route("POST", path)

    def _route(self, method: str, path: str):
        def decorator(fn):
            self.routes.append((method, path, fn))
            return fn

        return decorator


def depends(value):
    return value


class Column:
    def __init__(self, name: str | None = None):
        self.name = name

    def __eq__(self, other):
        return ("eq", self.name, other)

    def desc(self):
        return ("desc", self)

    def asc(self):
        return ("asc", self)


class Query:
    def __init__(self, *targets):
        self.target = targets[0]
        self.targets = targets
        self.conditions = []

    def where(self, *args):
        self.conditions.extend(args)
        return self

    def join(self, *args):
        return self

    def order_by(self, *args):
        return self

    def limit(self, *args):
        return self


def select(*targets):
    return Query(*targets)


@dataclass
class Settings:
    BRIDGE_ENABLED: bool = True
    BRIDGE_SHARED_SECRET: str = "dev-secret"
    BRIDGE_JWT_ISSUER: str = "paperclip"
    BRIDGE_JWT_AUDIENCE: str = "clawith-bridge"
    BRIDGE_RUNTIME_TIMEOUT_SEC: float = 0.01
    BRIDGE_TARGET_TENANT_ID: str = ""


settings = Settings()


class ModelBase:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def model_dump(self):
        return dict(self.__dict__)

    @classmethod
    def model_validate(cls, value):
        if isinstance(value, cls):
            return value
        if isinstance(value, dict):
            return cls(**value)
        raise TypeError(value)


class BridgeSyncRequest(ModelBase):
    pass


class BridgeSyncResponse(ModelBase):
    pass


class BridgeLinkCheckRequest(ModelBase):
    pass


class BridgeLinkCheckResponse(ModelBase):
    pass


class BridgeAgentLinkOption(ModelBase):
    pass


class BridgeAgentLinkOptionsResponse(ModelBase):
    pass


class BridgeWakeRequest(ModelBase):
    pass


class BridgeWakeResponse(ModelBase):
    pass


def install_base_stubs() -> None:
    fastapi = types.ModuleType("fastapi")
    fastapi.APIRouter = Router
    fastapi.Depends = depends
    fastapi.HTTPException = HTTPException
    fastapi.Request = Request
    fastapi.status = Status
    sys.modules["fastapi"] = fastapi

    sqlalchemy = types.ModuleType("sqlalchemy")
    sqlalchemy.select = select
    sys.modules["sqlalchemy"] = sqlalchemy
    sys.modules["sqlalchemy.ext"] = types.ModuleType("sqlalchemy.ext")
    sqlalchemy_ext_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
    sqlalchemy_ext_asyncio.AsyncSession = object
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio

    app = types.ModuleType("app")
    app.__path__ = [str(ROOT)]
    sys.modules["app"] = app
    for package, child in (
        ("app.services", "services"),
        ("app.api", "api"),
        ("app.models", "models"),
        ("app.schemas", "schemas"),
    ):
        mod = types.ModuleType(package)
        mod.__path__ = [str(ROOT / child)]
        sys.modules[package] = mod

    config = types.ModuleType("app.config")
    config.get_settings = lambda: settings
    sys.modules["app.config"] = config

    database = types.ModuleType("app.database")
    database.get_db = lambda: None
    sys.modules["app.database"] = database

    schemas_bridge = types.ModuleType("app.schemas.bridge")
    for cls in (
        BridgeLinkCheckRequest,
        BridgeLinkCheckResponse,
        BridgeAgentLinkOption,
        BridgeAgentLinkOptionsResponse,
        BridgeSyncRequest,
        BridgeSyncResponse,
        BridgeWakeRequest,
        BridgeWakeResponse,
    ):
        setattr(schemas_bridge, cls.__name__, cls)
    sys.modules["app.schemas.bridge"] = schemas_bridge


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign(payload: dict) -> str:
    encoded_header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    encoded_payload = b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = hmac.new(settings.BRIDGE_SHARED_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{b64(signature)}"


def make_headers(run_id: str, idempotency_key: str = "idem-1") -> dict[str, str]:
    return make_headers_with_payload({
        "iss": settings.BRIDGE_JWT_ISSUER,
        "aud": settings.BRIDGE_JWT_AUDIENCE,
        "sub": "agent-1",
        "company_id": "company-1",
        "agent_id": "agent-1",
        "issue_id": "issue-1",
        "run_id": run_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }, run_id, idempotency_key)


def make_headers_with_payload(payload: dict, run_id: str, idempotency_key: str = "idem-1") -> dict[str, str]:
    payload = {
        **payload,
    }
    return {
        "Authorization": f"Bearer {sign(payload)}",
        "X-Paperclip-Run-Id": run_id,
        "X-Request-Id": "request-1",
        "X-Idempotency-Key": idempotency_key,
    }


@dataclass
class Mapping:
    paperclip_company_id: str = "company-1"
    paperclip_agent_id: str = "agent-1"
    clawith_tenant_id: str = "tenant-1"
    clawith_agent_id: str = "cw-agent-1"
    clawith_session_id: str | None = None
    paperclip_issue_id: str | None = None
    paperclip_run_id: str | None = "run-1"
    idempotency_key: str | None = None
    status: str = "active"
    result: dict | None = field(default_factory=lambda: {
        "status": "completed",
        "paperclip_run_id": "run-1",
        "clawith_tenant_id": "tenant-1",
        "clawith_agent_id": "cw-agent-1",
        "clawith_session_id": "session-1",
        "message": "done",
    })
    error_message: str | None = None


def install_bridge_service_stubs(mapping: Mapping) -> None:
    class BridgeRouteAgent:
        id = Column()
        tenant_id = Column()
        name = Column()

    class BridgeRouteTenant:
        id = Column()
        name = Column()

    for mod_name, cls_name, cls in (
        ("app.models.agent", "Agent", BridgeRouteAgent),
        ("app.models.tenant", "Tenant", BridgeRouteTenant),
    ):
        mod = types.ModuleType(mod_name)
        setattr(mod, cls_name, cls)
        sys.modules[mod_name] = mod

    mapping_svc = types.ModuleType("app.services.bridge_mapping_service")

    async def get_mapping_by_idempotency_key(db, key):
        return mapping if mapping.idempotency_key == key else None

    async def get_mapping_for_run(db, run_id):
        return mapping if mapping.paperclip_run_id == run_id else None

    async def get_or_create_bridge_mapping(db, payload):
        return mapping

    async def validate_existing_clawith_agent(db, tenant_id, agent_id):
        return types.SimpleNamespace(id=tenant_id), types.SimpleNamespace(id=agent_id)

    mapping_svc.get_mapping_by_idempotency_key = get_mapping_by_idempotency_key
    mapping_svc.get_mapping_for_run = get_mapping_for_run
    mapping_svc.get_or_create_bridge_mapping = get_or_create_bridge_mapping
    mapping_svc.validate_existing_clawith_agent = validate_existing_clawith_agent
    sys.modules["app.services.bridge_mapping_service"] = mapping_svc

    runtime_svc = types.ModuleType("app.services.bridge_runtime_service")

    async def quick_runtime(db, mapping_obj, payload_obj):
        return BridgeWakeResponse(
            status="completed",
            paperclip_run_id=payload_obj.run_id,
            clawith_tenant_id=str(mapping_obj.clawith_tenant_id),
            clawith_agent_id=str(mapping_obj.clawith_agent_id),
            clawith_session_id="session-2",
            message="ok",
            usage={"model": "gpt-5.4-mini"},
            artifacts=[],
        )

    runtime_svc.run_bridge_wake = quick_runtime
    sys.modules["app.services.bridge_runtime_service"] = runtime_svc


def verify_auth_and_bridge_routes() -> None:
    auth = load_module("app.services.bridge_auth_service", ROOT / "services" / "bridge_auth_service.py")
    headers = make_headers("run-1")
    assert auth.verify_bridge_request(Request(headers, method="GET"))["company_id"] == "company-1"
    missing_auth = dict(headers)
    missing_auth.pop("Authorization")
    try:
        auth.verify_bridge_request(Request(missing_auth, method="POST"))
        raise AssertionError("missing token did not fail")
    except HTTPException as exc:
        assert exc.status_code == 401 and exc.detail == "Missing bridge bearer token"
    expired_headers = make_headers_with_payload({
        "iss": settings.BRIDGE_JWT_ISSUER,
        "aud": settings.BRIDGE_JWT_AUDIENCE,
        "sub": "agent-1",
        "company_id": "company-1",
        "agent_id": "agent-1",
        "issue_id": "issue-1",
        "run_id": "run-1",
        "iat": int(time.time()) - 600,
        "exp": int(time.time()) - 1,
    }, "run-1")
    try:
        auth.verify_bridge_request(Request(expired_headers, method="POST"))
        raise AssertionError("expired token did not fail")
    except HTTPException as exc:
        assert exc.status_code == 401 and exc.detail == "Bridge token expired"
    try:
        bad = dict(headers)
        bad.pop("X-Idempotency-Key")
        auth.verify_bridge_request(Request(bad, method="GET"))
        raise AssertionError("missing GET idempotency did not fail")
    except HTTPException as exc:
        assert exc.status_code == 400 and exc.detail == "Missing X-Idempotency-Key"

    mapping = Mapping()
    install_bridge_service_stubs(mapping)
    bridge = load_module("app.api.bridge", ROOT / "api" / "bridge.py")
    assert len(bridge.router.routes) == 9
    health = asyncio.run(bridge.bridge_health())
    assert health["bridge_enabled"] is True
    assert health["secret_configured"] is True

    run_result = asyncio.run(bridge.get_run("run-1", Request(headers, method="GET"), db=None))
    assert run_result.paperclip_run_id == "run-1"
    link_headers = make_headers_with_payload({
        "iss": settings.BRIDGE_JWT_ISSUER,
        "aud": settings.BRIDGE_JWT_AUDIENCE,
        "sub": "environment-test",
        "company_id": "company-1",
        "agent_id": "environment-test",
        "issue_id": None,
        "run_id": "environment-test",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }, "environment-test", "company-1:environment-test:link-check")
    link_result = asyncio.run(bridge.check_agent_link(
        BridgeLinkCheckRequest(
            company_id="company-1",
            agent_id="environment-test",
            link_mode="link_existing",
            clawith_tenant_id="tenant-1",
            clawith_agent_id="cw-agent-1",
        ),
        Request(link_headers),
        db=None,
    ))
    assert link_result.status == "valid"

    class LinkOptionsResult:
        def all(self):
            return [
                (
                    types.SimpleNamespace(id="cw-agent-1", name="Clawith Agent", status="idle"),
                    types.SimpleNamespace(id="tenant-1", name="Tenant One"),
                ),
            ]

    class LinkOptionsDB:
        async def execute(self, query):
            return LinkOptionsResult()

    options_result = asyncio.run(bridge.list_agent_link_options(
        Request(make_headers("run-1", "company-1:agent-1:link-options"), method="GET"),
        db=LinkOptionsDB(),
    ))
    assert options_result.agents[0].agent_id == "cw-agent-1"
    try:
        asyncio.run(bridge.get_run("other-run", Request(headers, method="GET"), db=None))
        raise AssertionError("run token/path mismatch did not fail")
    except HTTPException as exc:
        assert exc.status_code == 403 and exc.detail == "Bridge token run mismatch"

    async def slow_runtime(db, mapping_obj, payload_obj):
        await asyncio.sleep(0.05)

    bridge.run_bridge_wake = slow_runtime
    wake_key = "company-1:agent-1:issue-1:run-1"
    wake_payload = BridgeWakeRequest(
        company_id="company-1",
        agent_id="agent-1",
        issue_id="issue-1",
        run_id="run-1",
        idempotency_key=wake_key,
        message="work",
        issue=types.SimpleNamespace(title="Issue", identifier="PC-1"),
        goal=None,
    )
    mapping.result = None
    mapping.idempotency_key = None
    timeout_response = asyncio.run(
        bridge.wake_agent("agent-1", wake_payload, Request(make_headers("run-1", wake_key)), db=None)
    )
    assert timeout_response.error_code == "CLAWITH_RUNTIME_TIMEOUT"
    assert timeout_response.retryable is True

    runtime_calls = {"count": 0}

    async def counted_runtime(db, mapping_obj, payload_obj):
        runtime_calls["count"] += 1
        return BridgeWakeResponse(
            status="completed",
            paperclip_run_id=payload_obj.run_id,
            clawith_tenant_id=str(mapping_obj.clawith_tenant_id),
            clawith_agent_id=str(mapping_obj.clawith_agent_id),
            clawith_session_id="session-3",
            message="counted",
            artifacts=[],
            usage={"model": "gpt-5.4-mini"},
        )

    bridge.run_bridge_wake = counted_runtime
    mapping.result = None
    mapping.idempotency_key = None
    first = asyncio.run(bridge.wake_agent("agent-1", wake_payload, Request(make_headers("run-1", wake_key)), db=None))
    second = asyncio.run(bridge.wake_agent("agent-1", wake_payload, Request(make_headers("run-1", wake_key)), db=None))
    assert first.message == "counted"
    assert second.message == "counted"
    assert runtime_calls["count"] == 1

    try:
        asyncio.run(bridge.wake_agent("other-agent", wake_payload, Request(make_headers("run-1", wake_key)), db=None))
        raise AssertionError("route/body agent mismatch did not fail")
    except HTTPException as exc:
        assert exc.status_code == 403 and exc.detail == "Agent route/body mismatch"

    mapping.result = None
    mapping.paperclip_company_id = "other-company"
    mapping.idempotency_key = wake_key
    try:
        asyncio.run(bridge.wake_agent("agent-1", wake_payload, Request(make_headers("run-1", wake_key)), db=None))
        raise AssertionError("mapping scope mismatch did not fail")
    except HTTPException as exc:
        assert exc.status_code == 403 and exc.detail == "Mapping does not match request"


class Agent:
    id = Column()

    def __init__(self):
        self.id = uuid.uuid4()
        self.creator_id = uuid.uuid4()
        self.name = "Bridge Agent"
        self.role_description = "Role"
        self.primary_model_id = uuid.uuid4()
        self.fallback_model_id = None
        self.context_window_size = 10


class ChatMessage:
    agent_id = Column()
    conversation_id = Column()
    created_at = Column()

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class RuntimeMapping:
    clawith_agent_id = uuid.uuid4()
    clawith_tenant_id = uuid.uuid4()
    clawith_session_id = None


class ChatSession:
    id = Column()
    agent_id = Column()
    external_conv_id = Column()

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class LLMModel:
    id = Column()

    def __init__(self):
        self.id = uuid.uuid4()
        self.model = "gpt-5.4-mini"
        self.supports_vision = False


class Result:
    def __init__(self, one=None, one_or_none=None, all_items=None):
        self._one = one
        self._one_or_none = one_or_none
        self._all = all_items or []

    def scalar_one(self):
        return self._one

    def scalar_one_or_none(self):
        return self._one_or_none

    def scalars(self):
        return self

    def all(self):
        return self._all

    def first(self):
        return self._all[0] if self._all else None


class MappingServiceBridgeMapping:
    paperclip_company_id = Column("paperclip_company_id")
    paperclip_agent_id = Column("paperclip_agent_id")
    paperclip_run_id = Column("paperclip_run_id")
    idempotency_key = Column("idempotency_key")

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class MappingServiceTenant:
    id = Column("id")
    slug = Column("slug")
    default_model_id = Column("default_model_id")
    created_at = Column("created_at")

    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", uuid.uuid4())
        self.__dict__.update(kwargs)


class MappingServiceAgent:
    id = Column("id")

    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", uuid.uuid4())
        self.tenant_id = kwargs.pop("tenant_id", uuid.uuid4())
        self.__dict__.update(kwargs)


class MappingServiceIdentity:
    id = Column("id")
    username = Column("username")

    def __init__(self, **kwargs):
        self.id = uuid.uuid4()
        self.__dict__.update(kwargs)


class MappingServiceUser:
    id = Column("id")
    identity_id = Column("identity_id")
    tenant_id = Column("tenant_id")

    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", uuid.uuid4())
        self.__dict__.update(kwargs)


class MappingServiceLLMModel:
    id = Column("id")
    tenant_id = Column("tenant_id")
    provider = Column("provider")
    model = Column("model")
    enabled = Column("enabled")
    created_at = Column("created_at")

    def __init__(self, **kwargs):
        self.id = uuid.uuid4()
        self.__dict__.update(kwargs)


class MappingFakeDB:
    def __init__(self, tenant, agent, mapping=None, model=None, paperclip_tenant=None, model_rows=None):
        self.tenant = tenant
        self.agent = agent
        self.mapping = mapping
        self.model = model
        self.paperclip_tenant = paperclip_tenant
        self.model_rows = model_rows
        self.added = []

    async def execute(self, query):
        if query.target is MappingServiceBridgeMapping:
            return Result(one_or_none=self.mapping)
        if query.targets == (MappingServiceTenant, MappingServiceLLMModel):
            if self.model_rows is not None:
                return Result(all_items=self.model_rows)
            return Result(all_items=[(self.tenant, self.model)] if self.tenant and self.model else [])
        if query.target is MappingServiceTenant:
            if _query_has_condition(query, "slug"):
                return Result(one_or_none=self.paperclip_tenant)
            if _query_has_condition(query, "id"):
                condition_id = _query_condition_value(query, "id")
                for tenant in (self.tenant, self.paperclip_tenant):
                    if tenant and str(tenant.id) == str(condition_id):
                        return Result(one_or_none=tenant)
                return Result(one_or_none=None)
            return Result(one_or_none=self.tenant)
        if query.target is MappingServiceAgent:
            return Result(one_or_none=self.agent)
        if query.target is MappingServiceUser:
            return Result(one_or_none=None)
        if query.target is MappingServiceLLMModel:
            if not self.model:
                return Result(one_or_none=None, all_items=[])
            if _query_has_condition(query, "id") and str(self.model.id) != str(_query_condition_value(query, "id")):
                return Result(one_or_none=None, all_items=[])
            if _query_has_condition(query, "tenant_id") and str(self.model.tenant_id) != str(_query_condition_value(query, "tenant_id")):
                return Result(one_or_none=None, all_items=[])
            return Result(one_or_none=self.model, all_items=[self.model])
        raise AssertionError(query.target)

    def add(self, value):
        self.added.append(value)
        if isinstance(value, MappingServiceBridgeMapping):
            self.mapping = value

    async def flush(self):
        pass


def _query_has_condition(query, name: str) -> bool:
    return any(isinstance(item, tuple) and len(item) >= 3 and item[0] == "eq" and item[1] == name for item in query.conditions)


def _query_condition_value(query, name: str):
    for item in query.conditions:
        if isinstance(item, tuple) and len(item) >= 3 and item[0] == "eq" and item[1] == name:
            return item[2]
    return None


def install_mapping_service_model_stubs() -> None:
    for mod_name, items in (
        ("app.models.agent", {"Agent": MappingServiceAgent}),
        ("app.models.bridge_mapping", {"BridgeMapping": MappingServiceBridgeMapping}),
        ("app.models.llm", {"LLMModel": MappingServiceLLMModel}),
        ("app.models.tenant", {"Tenant": MappingServiceTenant}),
        ("app.models.user", {"Identity": MappingServiceIdentity, "User": MappingServiceUser}),
    ):
        mod = types.ModuleType(mod_name)
        for name, value in items.items():
            setattr(mod, name, value)
        sys.modules[mod_name] = mod


def verify_mapping_service_link_existing() -> None:
    install_mapping_service_model_stubs()
    service = load_module(
        "app.services.bridge_mapping_service_real",
        ROOT / "services" / "bridge_mapping_service.py",
    )
    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    tenant = MappingServiceTenant(id=tenant_id, slug="tenant")
    agent = MappingServiceAgent(id=agent_id, tenant_id=tenant_id)
    payload = BridgeSyncRequest(
        company_id="company-1",
        agent_id="agent-1",
        link_mode="link_existing",
        clawith_tenant_id=str(tenant_id),
        clawith_agent_id=str(agent_id),
    )
    db = MappingFakeDB(tenant, agent)
    mapping = asyncio.run(service.get_or_create_bridge_mapping(db, payload))
    assert mapping.clawith_tenant_id == tenant_id
    assert mapping.clawith_agent_id == agent_id
    assert mapping.metadata_json["link_mode"] == "link_existing"
    assert db.added == [mapping]

    same = asyncio.run(service.get_or_create_bridge_mapping(db, payload))
    assert same is mapping

    other_payload = BridgeSyncRequest(
        company_id="company-1",
        agent_id="agent-1",
        link_mode="link_existing",
        clawith_tenant_id=str(tenant_id),
        clawith_agent_id=str(uuid.uuid4()),
    )
    other_agent = MappingServiceAgent(id=uuid.uuid4(), tenant_id=tenant_id)
    db.agent = other_agent
    try:
        asyncio.run(service.get_or_create_bridge_mapping(db, other_payload))
        raise AssertionError("different link did not conflict")
    except HTTPException as exc:
        assert exc.status_code == 409

    bad_tenant_agent = MappingServiceAgent(id=agent_id, tenant_id=uuid.uuid4())
    try:
        asyncio.run(service.validate_existing_clawith_agent(
            MappingFakeDB(tenant, bad_tenant_agent),
            str(tenant_id),
            str(agent_id),
        ))
        raise AssertionError("agent tenant mismatch did not fail")
    except HTTPException as exc:
        assert exc.status_code == 403


def verify_mapping_service_auto_create_model_resolution() -> None:
    install_mapping_service_model_stubs()
    service = load_module(
        "app.services.bridge_mapping_service_auto",
        ROOT / "services" / "bridge_mapping_service.py",
    )
    tenant_id = uuid.uuid4()
    model_id = uuid.uuid4()
    tenant = MappingServiceTenant(id=tenant_id, slug="tenant", default_model_id=model_id)
    model = MappingServiceLLMModel(id=model_id, tenant_id=tenant_id, enabled=True)
    payload = BridgeSyncRequest(
        company_id="company-2",
        agent_id="agent-2",
        link_mode="auto_create",
        agent_name="QA Agent",
    )
    db = MappingFakeDB(tenant, None, model=model)
    mapping = asyncio.run(service.get_or_create_bridge_mapping(db, payload))
    created_agents = [item for item in db.added if isinstance(item, MappingServiceAgent)]
    assert created_agents[0].primary_model_id == model_id
    assert mapping.clawith_agent_id == created_agents[0].id

    existing_agent = MappingServiceAgent(id=uuid.uuid4(), tenant_id=tenant_id, primary_model_id=None, fallback_model_id=None)
    existing_mapping = MappingServiceBridgeMapping(
        paperclip_company_id="company-2",
        paperclip_agent_id="agent-2",
        clawith_tenant_id=tenant_id,
        clawith_agent_id=existing_agent.id,
    )
    db = MappingFakeDB(tenant, existing_agent, mapping=existing_mapping, model=model)
    same = asyncio.run(service.get_or_create_bridge_mapping(db, payload))
    assert same is existing_mapping
    assert existing_agent.primary_model_id == model_id

    paperclip_tenant = MappingServiceTenant(id=uuid.uuid4(), slug="paperclip-company-2")
    migrated_agent = MappingServiceAgent(
        id=uuid.uuid4(),
        tenant_id=paperclip_tenant.id,
        primary_model_id=None,
        fallback_model_id=None,
    )
    migrated_mapping = MappingServiceBridgeMapping(
        paperclip_company_id="company-2",
        paperclip_agent_id="agent-2",
        clawith_tenant_id=paperclip_tenant.id,
        clawith_agent_id=migrated_agent.id,
    )
    db = MappingFakeDB(
        tenant,
        migrated_agent,
        mapping=migrated_mapping,
        model=model,
        paperclip_tenant=paperclip_tenant,
        model_rows=[(tenant, model)],
    )
    same = asyncio.run(service.get_or_create_bridge_mapping(db, payload))
    assert same is migrated_mapping
    assert migrated_agent.tenant_id == tenant_id
    assert migrated_agent.primary_model_id == model_id
    assert migrated_mapping.clawith_tenant_id == tenant_id

    empty_db = MappingFakeDB(MappingServiceTenant(id=uuid.uuid4(), slug="empty"), None)
    try:
        asyncio.run(service.get_or_create_bridge_mapping(empty_db, payload))
        raise AssertionError("auto-create without a model did not fail")
    except HTTPException as exc:
        assert exc.status_code == 422


class FakeDB:
    def __init__(self):
        self.agent = Agent()
        self.session = ChatSession(id=uuid.uuid4(), last_message_at=None)
        self.model = LLMModel()
        self.added = []

    async def execute(self, query):
        if query.target is Agent:
            return Result(one=self.agent)
        if query.target is ChatSession:
            return Result(one_or_none=self.session)
        if query.target is LLMModel:
            return Result(one=self.model)
        if query.target is ChatMessage:
            return Result(all_items=[ChatMessage(role="user", content="old context")])
        raise AssertionError(query.target)

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        pass


def install_runtime_stubs(captured: dict) -> None:
    for mod_name, cls_name, cls in (
        ("app.models.agent", "Agent", Agent),
        ("app.models.audit", "ChatMessage", ChatMessage),
        ("app.models.bridge_mapping", "BridgeMapping", RuntimeMapping),
        ("app.models.chat_session", "ChatSession", ChatSession),
        ("app.models.llm", "LLMModel", LLMModel),
    ):
        mod = types.ModuleType(mod_name)
        setattr(mod, cls_name, cls)
        sys.modules[mod_name] = mod

    llm = types.ModuleType("app.services.llm")

    async def call_llm_with_failover(**kwargs):
        captured.update(kwargs)
        return "runtime ok"

    llm.call_llm_with_failover = call_llm_with_failover
    sys.modules["app.services.llm"] = llm

    llm_utils = types.ModuleType("app.services.llm.utils")
    llm_utils.convert_chat_messages_to_llm_format = lambda messages: [
        {"role": item.role, "content": item.content} for item in messages
    ]
    llm_utils.truncate_messages_with_pair_integrity = lambda messages, ctx_size: messages[-ctx_size:]
    sys.modules["app.services.llm.utils"] = llm_utils

    tracker = types.ModuleType("app.services.token_tracker")

    @dataclass
    class Usage:
        input_tokens: int = 1
        output_tokens: int = 1
        cache_read_tokens: int = 0

    tracker.estimate_token_usage_from_chars = lambda chars: Usage(
        input_tokens=max(chars // 6, 1),
        output_tokens=1,
    )
    sys.modules["app.services.token_tracker"] = tracker


def verify_runtime_source_flow() -> None:
    captured: dict = {}
    install_runtime_stubs(captured)
    runtime = load_module(
        "app.services.bridge_runtime_service_real",
        ROOT / "services" / "bridge_runtime_service.py",
    )
    request = BridgeWakeRequest(
        company_id="company-1",
        agent_id="agent-1",
        issue_id="issue-1",
        run_id="run-1",
        idempotency_key="idem",
        message="new work",
        issue=types.SimpleNamespace(
            title="Issue",
            identifier="PC-1",
            id="issue-1",
            description="desc",
            comments=[],
        ),
        goal=types.SimpleNamespace(title="Goal"),
    )
    db = FakeDB()
    mapping = RuntimeMapping()
    response = asyncio.run(runtime.run_bridge_wake(db, mapping, request))
    assert response.status == "completed"
    assert response.usage["model"] == "gpt-5.4-mini"
    assert captured["primary_model"] is db.model
    assert captured["session_id"] == str(db.session.id)
    assert captured["messages"][0]["content"] == "old context"
    assert captured["messages"][-1]["content"].endswith("new work")
    assert mapping.clawith_session_id == str(db.session.id)
    assert any(getattr(item, "role", None) == "user" for item in db.added)
    assert any(getattr(item, "role", None) == "assistant" for item in db.added)


def main() -> None:
    install_base_stubs()
    verify_auth_and_bridge_routes()
    verify_mapping_service_link_existing()
    verify_mapping_service_auto_create_model_resolution()
    verify_runtime_source_flow()
    print("bridge source contract ok")


if __name__ == "__main__":
    main()
