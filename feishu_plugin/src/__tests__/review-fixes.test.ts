import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeishuClientRegistry } from "../feishu/client-registry.js";
import { ConfigStore } from "../config/store.js";
import { AdminServer } from "../admin/server.js";
import { registerAdminRoutes } from "../admin/routes.js";
import { PaperclipAuthService } from "../paperclip/auth-service.js";
import type { PaperclipClient } from "../paperclip/client.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "feishu-test-"));
}

function mockPaperclip(companies: { id: string; name: string }[] | Error): PaperclipClient {
  return {
    listCompanies: vi.fn().mockImplementation(async () => {
      if (companies instanceof Error) throw companies;
      return companies;
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as PaperclipClient;
}

describe("P0-2: FeishuClientRegistry no cross-company fallback", () => {
  it("store mode: getForCompany returns null for unconfigured company", () => {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    store.saveSecrets({
      paperclipApiKey: "test",
      defaultFeishuAppId: "cli_default",
      defaultFeishuAppSecret: "secret_default",
      companySecrets: {
        "company-a": { appId: "cli_a", appSecret: "secret_a" },
      },
    });
    store.saveCompanies([
      { companyId: "company-a", defaultApprovers: [], routing: {} },
      { companyId: "company-b", defaultApprovers: [], routing: {} },
    ]);

    const registry = new FeishuClientRegistry(store);
    registry.initFromStore();

    expect(registry.getForCompany("company-a")).not.toBeNull();
    expect(registry.getForCompany("company-b")).toBeNull();
    expect(registry.getDefault()).not.toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("env mode: default client registered explicitly per company", () => {
    const registry = new FeishuClientRegistry(null);
    registry.initFromConfig({
      paperclipBaseUrl: "http://localhost:3100",
      paperclipApiKey: "test",
      paperclipPublicUrl: "http://localhost:3100",
      feishuAppId: "cli_env",
      feishuAppSecret: "secret_env",
      pollIntervalMs: 5000,
      reconciliationIntervalMs: 60000,
      scanConcurrency: 4,
      requestTimeoutMs: 10000,
      sqlitePath: "./data/bridge.db",
      actionTokenTtlMs: 86400000,
      adminPort: 9090,
      companies: [
        { companyId: "company-a", defaultApprovers: [], routing: {} },
        { companyId: "company-b", defaultApprovers: [], routing: {} },
      ],
    });

    expect(registry.getForCompany("company-a")).not.toBeNull();
    expect(registry.getForCompany("company-b")).not.toBeNull();
    expect(registry.getForCompany("company-a")).toBe(registry.getForCompany("company-b"));
  });

  it("env mode: company-specific feishu overrides default", () => {
    const registry = new FeishuClientRegistry(null);
    registry.initFromConfig({
      paperclipBaseUrl: "http://localhost:3100",
      paperclipApiKey: "test",
      paperclipPublicUrl: "http://localhost:3100",
      feishuAppId: "cli_env",
      feishuAppSecret: "secret_env",
      pollIntervalMs: 5000,
      reconciliationIntervalMs: 60000,
      scanConcurrency: 4,
      requestTimeoutMs: 10000,
      sqlitePath: "./data/bridge.db",
      actionTokenTtlMs: 86400000,
      adminPort: 9090,
      companies: [
        { companyId: "company-a", defaultApprovers: [], routing: {}, feishu: { appId: "cli_a", appSecret: "s_a" } },
        { companyId: "company-b", defaultApprovers: [], routing: {} },
      ],
    });

    expect(registry.getForCompany("company-a")).not.toBe(registry.getForCompany("company-b"));
    expect(registry.getForCompany("company-b")).toBe(registry.getDefault());
  });
});

describe("P0-2: ConfigStore.getFeishuForCompany no default fallback", () => {
  it("returns null when company has no explicit feishu config", () => {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    store.saveSecrets({
      paperclipApiKey: "test",
      defaultFeishuAppId: "cli_default",
      defaultFeishuAppSecret: "secret_default",
    });

    expect(store.getFeishuForCompany("unknown-company")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns company-specific config when present", () => {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    store.saveSecrets({
      paperclipApiKey: "test",
      companySecrets: {
        "company-a": { appId: "cli_a", appSecret: "secret_a" },
      },
    });

    const result = store.getFeishuForCompany("company-a");
    expect(result).toEqual({ appId: "cli_a", appSecret: "secret_a" });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("P0-1: Company add validates against Paperclip API", () => {
  let server: AdminServer;
  let port: number;

  afterEach(() => {
    server?.stop();
  });

  async function setup(companies: { id: string; name: string }[] | Error) {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    const paperclip = mockPaperclip(companies);
    const feishuRegistry = new FeishuClientRegistry(store);
    const authService = new PaperclipAuthService(store, false);
    port = 19090 + Math.floor(Math.random() * 1000);
    server = new AdminServer(port, join(dir, "ui-nonexist"));
    registerAdminRoutes(server, {
      store,
      paperclip,
      authService,
      feishuRegistry,
      storeMode: false,
      onConfigChanged: () => {},
    });
    server.start();
    await new Promise((r) => setTimeout(r, 100));
    return { dir, paperclip };
  }

  it("accepts valid companyId from Paperclip", async () => {
    const { dir } = await setup([{ id: "real-id", name: "Real Co" }]);
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "real-id", name: "Ignored Name" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.restartRequired).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects fake companyId not in Paperclip", async () => {
    const { dir } = await setup([{ id: "real-id", name: "Real Co" }]);
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "fake-id" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not found");
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 502 when Paperclip query fails", async () => {
    const { dir } = await setup(new Error("connection refused"));
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "any-id" }),
    });
    expect(res.status).toBe(502);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses Paperclip name as trusted name", async () => {
    const { dir } = await setup([{ id: "real-id", name: "Trusted Name" }]);
    const store = new ConfigStore(dir);
    await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "real-id", name: "Spoofed Name" }),
    });
    const companies = store.getCompanies();
    expect(companies[0].name).toBe("Trusted Name");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PUT rejects companyId change", async () => {
    const { dir } = await setup([{ id: "real-id", name: "Real Co" }]);
    const store = new ConfigStore(dir);
    store.addCompany({ companyId: "real-id", name: "Real Co", defaultApprovers: [], routing: {} });
    const res = await fetch(`http://localhost:${port}/api/config/companies/real-id`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "other-id", name: "New Name" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("cannot be changed");
    rmSync(dir, { recursive: true, force: true });
  });
});
