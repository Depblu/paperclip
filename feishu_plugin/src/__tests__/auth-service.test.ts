import { describe, it, expect, vi, afterEach } from "vitest";
import { ConfigStore } from "../config/store.js";
import { AdminServer } from "../admin/server.js";
import { registerAdminRoutes } from "../admin/routes.js";
import { PaperclipAuthService } from "../paperclip/auth-service.js";
import { FeishuClientRegistry } from "../feishu/client-registry.js";
import type { PaperclipClient } from "../paperclip/client.js";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const realFetch = globalThis.fetch;

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "feishu-auth-test-"));
}

function mockPaperclip(): PaperclipClient {
  return {
    listCompanies: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as PaperclipClient;
}

function stubFetchForPaperclip(handler: (url: string) => { ok: boolean; status?: number; json: () => Promise<unknown> } | Error) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("127.0.0.1")) {
      return realFetch(input as RequestInfo, init);
    }
    const result = handler(url);
    if (result instanceof Error) throw result;
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500), json: result.json, text: async () => JSON.stringify(await result.json()) } as Response;
  });
}

let server: AdminServer | null = null;
let authService: PaperclipAuthService | null = null;

afterEach(() => {
  server?.stop();
  server = null;
  authService?.destroy();
  authService = null;
  vi.unstubAllGlobals();
});

async function setupServer(storeMode: boolean) {
  const dir = makeTmpDir();
  const store = new ConfigStore(dir);
  const paperclip = mockPaperclip();
  const feishuRegistry = new FeishuClientRegistry(store);
  authService = new PaperclipAuthService(store, storeMode);
  const port = 19200 + Math.floor(Math.random() * 700);
  server = new AdminServer(port, join(dir, "ui-nonexist"), "127.0.0.1");
  registerAdminRoutes(server, {
    store,
    paperclip,
    authService,
    feishuRegistry,
    storeMode,
    onConfigChanged: () => {},
  });
  server.start();
  await new Promise((r) => setTimeout(r, 80));
  return { dir, store, port };
}

describe("auth-service: start flow", () => {
  it("start response does not contain boardApiToken or challenge token", async () => {
    const { dir, port } = await setupServer(true);
    stubFetchForPaperclip(() => ({
      ok: true,
      json: async () => ({
        id: "ch-1",
        token: "pcp_cli_auth_secret",
        boardApiToken: "pcp_board_secret",
        approvalPath: "/cli-auth/ch-1?token=x",
        approvalUrl: "http://localhost:3100/cli-auth/ch-1?token=x",
        pollPath: "/cli-auth/challenges/ch-1",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        suggestedPollIntervalMs: 1000,
      }),
    }));

    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperclipBaseUrl: "http://localhost:3100" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("pcp_board_secret");
    expect(raw).not.toContain("pcp_cli_auth_secret");
    expect(data.flowId).toBeTruthy();
    expect(data.approvalUrl).toBeTruthy();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects invalid URL protocol", async () => {
    const { dir, port } = await setupServer(true);
    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperclipBaseUrl: "ftp://evil.com" }),
    });
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("http");
    rmSync(dir, { recursive: true, force: true });
  });

  it("env mode rejects auth start", async () => {
    const { dir, port } = await setupServer(false);
    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("auth-service: status and security", () => {
  it("status response never contains full or partial board API key", async () => {
    const { dir, store, port } = await setupServer(true);
    store.saveSecrets({ paperclipApiKey: "pcp_board_very_secret_key_12345" });

    stubFetchForPaperclip((url) => {
      if (url.includes("/api/cli-auth/me")) {
        return { ok: true, json: async () => ({ userId: "u1", user: { id: "u1", name: "Test", email: "t@t.com" }, source: "board_key", keyId: "k1", companyIds: ["c1"] }) };
      }
      if (url.includes("/api/board-api-keys")) {
        return { ok: true, json: async () => ([{ id: "k1", name: "key", createdAt: "", lastUsedAt: null, revokedAt: null, expiresAt: null }]) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/status`);
    const raw = await res.text();
    expect(raw).not.toContain("pcp_board_very_secret_key_12345");
    expect(raw).not.toContain("pcp_board_very");
    rmSync(dir, { recursive: true, force: true });
  });

  it("secrets.json has 0600 permissions on POSIX", async () => {
    const { dir, store } = await setupServer(true);
    store.saveSecrets({ paperclipApiKey: "test-key" });
    const secretsPath = join(dir, "secrets.json");
    const stat = statSync(secretsPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
    rmSync(dir, { recursive: true, force: true });
  });

  it("generic secrets PUT cannot write paperclipApiKey", async () => {
    const { dir, store, port } = await setupServer(true);
    store.saveSecrets({ paperclipApiKey: "original-key" });

    const res = await realFetch(`http://127.0.0.1:${port}/api/config/secrets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperclipApiKey: "hacked-key" }),
    });
    expect(res.status).toBe(403);
    const secrets = store.getSecrets();
    expect(secrets.paperclipApiKey).toBe("original-key");
    rmSync(dir, { recursive: true, force: true });
  });

  it("maskSecrets returns *** for paperclipApiKey", async () => {
    const { dir, store } = await setupServer(true);
    store.saveSecrets({ paperclipApiKey: "pcp_board_secret123" });
    const masked = store.maskSecrets();
    expect(masked.paperclipApiKey).toBe("***");
    expect(masked.paperclipApiKey).not.toContain("pcp_");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("auth-service: company gating", () => {
  it("company query rejected when not authorized (store mode)", async () => {
    const { dir, port } = await setupServer(true);
    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/companies`);
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });

  it("company add rejected when not authorized (store mode)", async () => {
    const { dir, port } = await setupServer(true);
    const res = await realFetch(`http://127.0.0.1:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "any" }),
    });
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("auth-service: revoke", () => {
  it("env mode rejects revoke", async () => {
    const { dir, port } = await setupServer(false);
    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    rmSync(dir, { recursive: true, force: true });
  });

  it("successful revoke clears local credentials", async () => {
    const { dir, store, port } = await setupServer(true);
    store.saveSecrets({ paperclipApiKey: "pcp_board_key_to_revoke" });
    store.saveAuthMetadata({
      userId: "u1", userName: "T", userEmail: null,
      keyId: "k1", keyExpiresAt: null, connectedAt: new Date().toISOString(), companyCount: 1,
    });

    stubFetchForPaperclip(() => ({ ok: true, json: async () => ({ revoked: true, keyId: "k1" }) }));

    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const secrets = store.getSecrets();
    expect(secrets.paperclipApiKey).toBe("");
    expect(store.getAuthMetadata()).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("network failure preserves local token", async () => {
    const { dir, store, port } = await setupServer(true);
    store.saveSecrets({ paperclipApiKey: "pcp_board_keep_me" });

    stubFetchForPaperclip(() => new Error("ECONNREFUSED"));

    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(502);
    const secrets = store.getSecrets();
    expect(secrets.paperclipApiKey).toBe("pcp_board_keep_me");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("admin server: listen address", () => {
  it("binds to 127.0.0.1 by default", async () => {
    const dir = makeTmpDir();
    const port = 19200 + Math.floor(Math.random() * 700);
    const srv = new AdminServer(port, join(dir, "ui-nonexist"));
    srv.addRoute("GET", "/api/health", (_req, res) => { srv.json(res, 200, { ok: true }); });
    srv.start();
    await new Promise((r) => setTimeout(r, 80));

    const res = await realFetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    srv.stop();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("auth-service: flow lifecycle", () => {
  it("poll non-existent flow returns failed", async () => {
    const { dir, port } = await setupServer(true);
    const res = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/flows/nonexistent`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("failed");
    rmSync(dir, { recursive: true, force: true });
  });

  it("cancel flow returns cancelled", async () => {
    const { dir, port } = await setupServer(true);
    stubFetchForPaperclip(() => ({
      ok: true,
      json: async () => ({
        id: "ch-2", token: "t", boardApiToken: "b",
        approvalPath: "/x", approvalUrl: "http://x", pollPath: "/y",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        suggestedPollIntervalMs: 1000,
      }),
    }));

    const startRes = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperclipBaseUrl: "http://localhost:3100" }),
    });
    const { flowId } = await startRes.json();

    const cancelRes = await realFetch(`http://127.0.0.1:${port}/api/paperclip/auth/flows/${flowId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const cancelData = await cancelRes.json();
    expect(cancelData.status).toBe("cancelled");
    rmSync(dir, { recursive: true, force: true });
  });
});
