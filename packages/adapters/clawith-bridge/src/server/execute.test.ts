import { afterEach, describe, expect, it, vi } from "vitest";
import { readClawithBridgeConfig } from "./config.js";
import { buildIdempotencyKey, buildWakeRequest, execute, mapBridgeResponseToResult } from "./execute.js";
import { signBridgeJwt } from "./jwt.js";
import crypto from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";

function baseContext(overrides: Partial<AdapterExecutionContext> = {}): AdapterExecutionContext {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Clawith Agent",
      adapterType: "clawith_bridge",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {},
    context: {
      issueId: "issue-1",
      wakeReason: "issue_assigned",
      paperclipIssue: {
        id: "issue-1",
        title: "PoC issue",
        description: "Validate Clawith bridge.",
      },
      paperclipWake: {
        reason: "issue_assigned",
        issue: {
          id: "issue-1",
          identifier: "PC-1",
          title: "PoC issue",
          status: "todo",
        },
        comments: [
          {
            id: "comment-1",
            body: "Please execute this.",
            createdAt: "2026-06-19T00:00:00.000Z",
            author: { type: "user", id: "user-1" },
          },
        ],
      },
    },
    onLog: async () => {},
    ...overrides,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function verifyBridgeJwt(token: string, secret: string): Record<string, unknown> {
  const [header, payload, signature] = token.split(".");
  expect(header).toBeTruthy();
  expect(payload).toBeTruthy();
  expect(signature).toBeTruthy();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  expect(signature).toBe(expected);
  const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  expect(decodedHeader).toMatchObject({ alg: "HS256", typ: "JWT" });
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function assertBridgeHeaders(
  request: { init: RequestInit },
  expected: {
    idempotencyKey: string;
    runId: string;
    companyId: string;
    agentId: string;
    issueId: string | null;
  },
): void {
  const headers = new Headers(request.init.headers);
  expect(headers.get("x-paperclip-run-id")).toBe(expected.runId);
  expect(headers.get("x-idempotency-key")).toBe(expected.idempotencyKey);
  expect(headers.get("x-request-id")).toBeTruthy();
  const authorization = headers.get("authorization");
  expect(authorization).toMatch(/^Bearer /);
  expect(verifyBridgeJwt(authorization!.replace(/^Bearer /, ""), "dev-secret")).toMatchObject({
    iss: "paperclip",
    aud: "clawith-bridge",
    company_id: expected.companyId,
    agent_id: expected.agentId,
    issue_id: expected.issueId,
    run_id: expected.runId,
  });
}

function responseJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function httpHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function readHttpJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  const parsed = JSON.parse(text);
  expect(parsed).toBeTypeOf("object");
  expect(Array.isArray(parsed)).toBe(false);
  return parsed as Record<string, unknown>;
}

function sendHttpJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function assertHttpBridgeHeaders(
  req: IncomingMessage,
  expected: {
    idempotencyKey: string;
    runId: string;
    companyId: string;
    agentId: string;
    issueId: string | null;
  },
): void {
  expect(httpHeader(req, "x-paperclip-run-id")).toBe(expected.runId);
  expect(httpHeader(req, "x-idempotency-key")).toBe(expected.idempotencyKey);
  expect(httpHeader(req, "x-request-id")).toBeTruthy();
  const authorization = httpHeader(req, "authorization");
  expect(authorization).toMatch(/^Bearer /);
  expect(verifyBridgeJwt(authorization.replace(/^Bearer /, ""), "dev-secret")).toMatchObject({
    iss: "paperclip",
    aud: "clawith-bridge",
    company_id: expected.companyId,
    agent_id: expected.agentId,
    issue_id: expected.issueId,
    run_id: expected.runId,
  });
}

async function closeLocalHttpServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function listenLocalHttpServer(
  server: ReturnType<typeof createServer>,
): Promise<{ ok: true; port: number } | { ok: false; reason: string }> {
  const firstPort = 42000 + (process.pid % 1000);
  let lastError = "unknown error";
  for (let offset = 0; offset < 50; offset += 1) {
    const port = firstPort + offset;
    const attempt = await new Promise<{ ok: true } | { ok: false; error: unknown }>((resolve) => {
      const onError = (err: unknown): void => {
        server.off("listening", onListening);
        resolve({ ok: false, error: err });
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve({ ok: true });
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });
    if (attempt.ok) return { ok: true, port };
    const error = attempt.error;
    lastError = error instanceof Error ? error.message : String(error);
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "EPERM" || code === "EACCES") {
      return { ok: false, reason: lastError };
    }
  }
  return {
    ok: false,
    reason: `No local port available for Clawith Bridge contract test: ${lastError}`,
  };
}

describe("clawith bridge adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the documented idempotency key", () => {
    expect(
      buildIdempotencyKey({
        companyId: "company-1",
        agentId: "agent-1",
        issueId: "issue-1",
        runId: "run-1",
      }),
    ).toBe("company-1:agent-1:issue-1:run-1");
  });

  it("builds wake requests from Paperclip context", () => {
    const request = buildWakeRequest(baseContext());

    expect(request).toMatchObject({
      company_id: "company-1",
      agent_id: "agent-1",
      issue_id: "issue-1",
      run_id: "run-1",
      idempotency_key: "company-1:agent-1:issue-1:run-1",
      issue: {
        id: "issue-1",
        identifier: "PC-1",
        title: "PoC issue",
        description: "Validate Clawith bridge.",
      },
    });
    expect(request.issue.comments[0]).toMatchObject({
      id: "comment-1",
      body: "Please execute this.",
      author_type: "user",
      author_id: "user-1",
    });
    expect(request.message).toContain("PoC issue");
  });

  it("signs HS256 JWT claims for the bridge", () => {
    const token = signBridgeJwt({
      secret: "dev-secret",
      issuer: "paperclip",
      audience: "clawith-bridge",
      subject: "agent-1",
      companyId: "company-1",
      agentId: "agent-1",
      issueId: "issue-1",
      runId: "run-1",
      nowSec: 100,
      jwtId: "jwt-1",
    });

    expect(token.split(".")).toHaveLength(3);
    expect(decodeJwtPayload(token)).toMatchObject({
      iss: "paperclip",
      aud: "clawith-bridge",
      sub: "agent-1",
      company_id: "company-1",
      agent_id: "agent-1",
      issue_id: "issue-1",
      run_id: "run-1",
      jti: "jwt-1",
      iat: 100,
      exp: 400,
    });
  });

  it("maps completed bridge responses to Paperclip run results", () => {
    const result = mapBridgeResponseToResult(
      {
        status: "completed",
        paperclip_run_id: "run-1",
        clawith_agent_id: "cw-agent-1",
        clawith_session_id: "cw-session-1",
        summary: "done",
        message: "Detailed result",
        usage: {
          model: "gpt-5.4-mini",
          input_tokens: 10,
          output_tokens: 20,
        },
      },
      { writeBack: "issue_comment" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Detailed result");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(result.model).toBe("gpt-5.4-mini");
    expect(result.sessionDisplayId).toBe("cw-session-1");
    expect(result.resultJson).toMatchObject({
      summary: "Detailed result",
      message: "Detailed result",
      clawithAgentId: "cw-agent-1",
      clawithSessionId: "cw-session-1",
    });
  });

  it("keeps issue comments quiet when writeBack is run_log", () => {
    const result = mapBridgeResponseToResult(
      {
        status: "completed",
        paperclip_run_id: "run-1",
        message: "Log-only result",
      },
      { writeBack: "run_log" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBeNull();
    expect(result.resultJson).toMatchObject({
      message: "Log-only result",
    });
  });

  it("uses env fallback config without forcing secrets into files", () => {
    const config = readClawithBridgeConfig(
      {},
      {
        CLAWITH_BRIDGE_BASE_URL: "http://localhost:8008",
        CLAWITH_BRIDGE_SECRET: "dev-secret",
        CLAWITH_BRIDGE_TIMEOUT_SEC: "5",
        CLAWITH_BRIDGE_ENABLED: "true",
      } as NodeJS.ProcessEnv,
    );

    expect(config).toMatchObject({
      enabled: true,
      baseUrl: "http://localhost:8008",
      bridgeSecret: "dev-secret",
      timeoutSec: 5,
      mode: "sync",
      linkMode: "auto_create",
      clawithTenantId: null,
      clawithAgentId: null,
      writeBack: "issue_comment",
    });
  });

  it("executes sync and wake calls with Bridge auth headers", async () => {
    const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestInit = init ?? {};
      requests.push({
        url: String(url),
        init: requestInit,
        body: JSON.parse(String(requestInit.body ?? "{}")),
      });
      if (String(url).endsWith("/api/bridge/agents/sync")) {
        return responseJson({
          paperclip_company_id: "company-1",
          paperclip_agent_id: "agent-1",
          clawith_tenant_id: "cw-tenant-1",
          clawith_agent_id: "cw-agent-1",
          status: "active",
        });
      }
      if (String(url).endsWith("/api/bridge/agents/agent-1/state")) {
        return responseJson({
          paperclip_company_id: "company-1",
          paperclip_agent_id: "agent-1",
          clawith_tenant_id: "cw-tenant-1",
          clawith_agent_id: "cw-agent-1",
          clawith_session_id: "cw-session-1",
          status: "active",
        });
      }
      if (String(url).endsWith("/api/bridge/agents/agent-1/focus")) {
        return responseJson({
          paperclip_agent_id: "agent-1",
          clawith_agent_id: "cw-agent-1",
          items: [{ id: "focus-1", title: "PoC focus", status: "active" }],
        });
      }
      if (String(url).endsWith("/api/bridge/agents/agent-1/reflections")) {
        return responseJson({
          paperclip_agent_id: "agent-1",
          clawith_agent_id: "cw-agent-1",
          items: [],
        });
      }
      return responseJson({
        status: "completed",
        paperclip_run_id: "run-1",
        clawith_tenant_id: "cw-tenant-1",
        clawith_agent_id: "cw-agent-1",
        clawith_session_id: "cw-session-1",
        message: "Bridge completed work",
        usage: {
          model: "gpt-5.4-mini",
          input_tokens: 11,
          output_tokens: 7,
        },
      });
    });
    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    const meta: unknown[] = [];

    const result = await execute(baseContext({
      config: {
        baseUrl: "http://clawith.local",
        bridgeSecret: "dev-secret",
        timeoutSec: 5,
        writeBack: "issue_comment",
      },
      onLog: async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      onMeta: async (entry) => {
        meta.push(entry);
      },
    }));

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(requests[0]).toMatchObject({
      url: "http://clawith.local/api/bridge/agents/sync",
      body: {
        company_id: "company-1",
        agent_id: "agent-1",
        agent_name: "Clawith Agent",
        link_mode: "auto_create",
      },
    });
    expect(requests[1]).toMatchObject({
      url: "http://clawith.local/api/bridge/agents/agent-1/wake",
      body: {
        company_id: "company-1",
        agent_id: "agent-1",
        issue_id: "issue-1",
        run_id: "run-1",
        idempotency_key: "company-1:agent-1:issue-1:run-1",
      },
    });
    assertBridgeHeaders(requests[0], {
      idempotencyKey: "company-1:agent-1:sync:run-1",
      runId: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      issueId: "issue-1",
    });
    assertBridgeHeaders(requests[1], {
      idempotencyKey: "company-1:agent-1:issue-1:run-1",
      runId: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      issueId: "issue-1",
    });
    assertBridgeHeaders(requests[2], {
      idempotencyKey: "company-1:agent-1:state:run-1",
      runId: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      issueId: "issue-1",
    });
    assertBridgeHeaders(requests[3], {
      idempotencyKey: "company-1:agent-1:focus:run-1",
      runId: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      issueId: "issue-1",
    });
    assertBridgeHeaders(requests[4], {
      idempotencyKey: "company-1:agent-1:reflections:run-1",
      runId: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      issueId: "issue-1",
    });
    expect(result).toMatchObject({
      exitCode: 0,
      summary: "Bridge completed work",
      provider: "clawith",
      model: "gpt-5.4-mini",
      usage: { inputTokens: 11, outputTokens: 7 },
      sessionParams: { clawithSessionId: "cw-session-1" },
      sessionDisplayId: "cw-session-1",
    });
    expect(result.resultJson).toMatchObject({
      state: {
        status: "active",
        clawith_session_id: "cw-session-1",
      },
      focus: {
        items: [{ id: "focus-1", title: "PoC focus", status: "active" }],
      },
      reflections: {
        items: [],
      },
    });
    expect(logs.some((entry) => entry.chunk.includes("Bridge completed work"))).toBe(true);
    expect(logs.some((entry) => entry.chunk.includes("state=active"))).toBe(true);
    expect(logs.some((entry) => entry.chunk.includes("focus items=1"))).toBe(true);
    expect(meta).toHaveLength(1);
  });

  it("sends explicit Clawith IDs for existing-agent links", async () => {
    const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestInit = init ?? {};
      requests.push({
        url: String(url),
        init: requestInit,
        body: JSON.parse(String(requestInit.body ?? "{}")),
      });
      if (String(url).endsWith("/api/bridge/agents/sync")) {
        return responseJson({
          paperclip_company_id: "company-1",
          paperclip_agent_id: "agent-1",
          clawith_tenant_id: "cw-tenant-1",
          clawith_agent_id: "cw-agent-1",
          status: "active",
        });
      }
      return responseJson({
        status: "completed",
        paperclip_run_id: "run-1",
        clawith_tenant_id: "cw-tenant-1",
        clawith_agent_id: "cw-agent-1",
        clawith_session_id: "cw-session-1",
        message: "Bridge completed work",
      });
    });

    const result = await execute(baseContext({
      config: {
        baseUrl: "http://clawith.local",
        bridgeSecret: "dev-secret",
        linkMode: "link_existing",
        clawithTenantId: "cw-tenant-1",
        clawithAgentId: "cw-agent-1",
      },
    }));

    expect(requests[0]).toMatchObject({
      url: "http://clawith.local/api/bridge/agents/sync",
      body: {
        company_id: "company-1",
        agent_id: "agent-1",
        agent_name: "Clawith Agent",
        link_mode: "link_existing",
        clawith_tenant_id: "cw-tenant-1",
        clawith_agent_id: "cw-agent-1",
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("fails link_existing config before network calls when target IDs are missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await execute(baseContext({
      config: {
        baseUrl: "http://clawith.local",
        bridgeSecret: "dev-secret",
        linkMode: "link_existing",
        clawithTenantId: "cw-tenant-1",
      },
    }));

    expect(result).toMatchObject({
      exitCode: 1,
      errorCode: "clawith_bridge_agent_id_missing",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("executes against a local HTTP Bridge contract server", async () => {
    const seenRoutes: string[] = [];
    let serverError: unknown = null;
    const server = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const route = `${req.method ?? "GET"} ${url.pathname}`;
        seenRoutes.push(route);
        if (req.method === "POST") {
          expect(httpHeader(req, "content-type")).toContain("application/json");
        }
        const body = req.method === "POST" ? await readHttpJson(req) : {};

        if (route === "POST /api/bridge/agents/sync") {
          assertHttpBridgeHeaders(req, {
            idempotencyKey: "company-1:agent-1:sync:run-1",
            runId: "run-1",
            companyId: "company-1",
            agentId: "agent-1",
            issueId: "issue-1",
          });
          expect(body).toMatchObject({
            company_id: "company-1",
            agent_id: "agent-1",
            agent_name: "Clawith Agent",
            link_mode: "auto_create",
          });
          sendHttpJson(res, 200, {
            paperclip_company_id: "company-1",
            paperclip_agent_id: "agent-1",
            clawith_tenant_id: "cw-tenant-1",
            clawith_agent_id: "cw-agent-1",
            status: "active",
          });
          return;
        }

        if (route === "POST /api/bridge/agents/agent-1/wake") {
          assertHttpBridgeHeaders(req, {
            idempotencyKey: "company-1:agent-1:issue-1:run-1",
            runId: "run-1",
            companyId: "company-1",
            agentId: "agent-1",
            issueId: "issue-1",
          });
          expect(body).toMatchObject({
            company_id: "company-1",
            agent_id: "agent-1",
            issue_id: "issue-1",
            run_id: "run-1",
            idempotency_key: "company-1:agent-1:issue-1:run-1",
            issue: {
              id: "issue-1",
              identifier: "PC-1",
              title: "PoC issue",
            },
          });
          expect(httpHeader(req, "x-idempotency-key")).toBe(body.idempotency_key);
          expect(String(body.message)).toContain("PoC issue");
          sendHttpJson(res, 200, {
            status: "completed",
            paperclip_run_id: "run-1",
            clawith_tenant_id: "cw-tenant-1",
            clawith_agent_id: "cw-agent-1",
            clawith_session_id: "cw-session-1",
            message: "Bridge completed work",
            usage: {
              model: "gpt-5.4-mini",
              input_tokens: 13,
              output_tokens: 8,
            },
          });
          return;
        }

        if (route === "GET /api/bridge/agents/agent-1/state") {
          assertHttpBridgeHeaders(req, {
            idempotencyKey: "company-1:agent-1:state:run-1",
            runId: "run-1",
            companyId: "company-1",
            agentId: "agent-1",
            issueId: "issue-1",
          });
          sendHttpJson(res, 200, {
            paperclip_company_id: "company-1",
            paperclip_agent_id: "agent-1",
            clawith_tenant_id: "cw-tenant-1",
            clawith_agent_id: "cw-agent-1",
            clawith_session_id: "cw-session-1",
            status: "active",
          });
          return;
        }

        if (route === "GET /api/bridge/agents/agent-1/focus") {
          assertHttpBridgeHeaders(req, {
            idempotencyKey: "company-1:agent-1:focus:run-1",
            runId: "run-1",
            companyId: "company-1",
            agentId: "agent-1",
            issueId: "issue-1",
          });
          sendHttpJson(res, 200, {
            paperclip_agent_id: "agent-1",
            clawith_agent_id: "cw-agent-1",
            items: [{ id: "focus-1", title: "PoC focus", status: "active" }],
          });
          return;
        }

        if (route === "GET /api/bridge/agents/agent-1/reflections") {
          assertHttpBridgeHeaders(req, {
            idempotencyKey: "company-1:agent-1:reflections:run-1",
            runId: "run-1",
            companyId: "company-1",
            agentId: "agent-1",
            issueId: "issue-1",
          });
          sendHttpJson(res, 200, {
            paperclip_agent_id: "agent-1",
            clawith_agent_id: "cw-agent-1",
            items: [],
          });
          return;
        }

        sendHttpJson(res, 404, { message: `Unhandled route ${route}` });
      })().catch((err) => {
        serverError = err;
        sendHttpJson(res, 500, { message: err instanceof Error ? err.message : String(err) });
      });
    });

    const listenResult = await listenLocalHttpServer(server);
    if (!listenResult.ok) {
      console.warn(`[clawith-bridge] skipped local HTTP contract server: ${listenResult.reason}`);
      await closeLocalHttpServer(server);
      return;
    }
    try {
      const result = await execute(baseContext({
        config: {
          baseUrl: `http://127.0.0.1:${listenResult.port}`,
          bridgeSecret: "dev-secret",
          timeoutSec: 5,
          writeBack: "issue_comment",
        },
      }));

      if (serverError) throw serverError;
      expect(seenRoutes).toEqual([
        "POST /api/bridge/agents/sync",
        "POST /api/bridge/agents/agent-1/wake",
        "GET /api/bridge/agents/agent-1/state",
        "GET /api/bridge/agents/agent-1/focus",
        "GET /api/bridge/agents/agent-1/reflections",
      ]);
      expect(result).toMatchObject({
        exitCode: 0,
        provider: "clawith",
        model: "gpt-5.4-mini",
        usage: { inputTokens: 13, outputTokens: 8 },
        sessionParams: { clawithSessionId: "cw-session-1" },
      });
      expect(result.resultJson).toMatchObject({
        state: { status: "active" },
        focus: { items: [{ id: "focus-1", title: "PoC focus", status: "active" }] },
        reflections: { items: [] },
      });
    } finally {
      await closeLocalHttpServer(server);
    }
  });

  it("returns a failed result for Bridge auth errors without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/api/bridge/agents/sync")) {
        return responseJson({
          paperclip_company_id: "company-1",
          paperclip_agent_id: "agent-1",
          clawith_tenant_id: "cw-tenant-1",
          clawith_agent_id: "cw-agent-1",
          status: "active",
        });
      }
      return responseJson({
        status: "failed",
        error_code: "UNAUTHORIZED",
        message: "token expired",
        retryable: false,
      }, { status: 401 });
    });

    const result = await execute(baseContext({
      config: {
        baseUrl: "http://clawith.local",
        bridgeSecret: "dev-secret",
      },
    }));

    expect(result).toMatchObject({
      exitCode: 1,
      timedOut: false,
      errorMessage: "token expired",
      errorCode: "UNAUTHORIZED",
      resultJson: {
        status: "failed",
        httpStatus: 401,
        retryable: false,
      },
    });
  });

  it("marks upstream request failures as transient without crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await execute(baseContext({
      config: {
        baseUrl: "http://clawith.local",
        bridgeSecret: "dev-secret",
      },
    }));

    expect(result).toMatchObject({
      exitCode: 1,
      timedOut: false,
      errorMessage: "connect ECONNREFUSED",
      errorCode: "clawith_bridge_request_failed",
      errorFamily: "transient_upstream",
    });
  });
});
