import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("P0-4: FeishuClientRegistry explicit binding model", () => {
  it("store mode: getForCompany returns null for unbound company", () => {
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
      { companyId: "company-a", feishuBinding: { mode: "company" }, defaultApprovers: [], routing: {} },
      { companyId: "company-b", defaultApprovers: [], routing: {} },
    ]);

    const registry = new FeishuClientRegistry(store);
    registry.initFromStore();

    expect(registry.getForCompany("company-a")).not.toBeNull();
    expect(registry.getForCompany("company-b")).toBeNull();
    expect(registry.getDefault()).not.toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("store mode: explicit global binding uses default client", () => {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    store.saveSecrets({
      paperclipApiKey: "test",
      defaultFeishuAppId: "cli_default",
      defaultFeishuAppSecret: "secret_default",
    });
    store.saveCompanies([
      { companyId: "company-g", feishuBinding: { mode: "global" }, defaultApprovers: [], routing: {} },
      { companyId: "company-none", defaultApprovers: [], routing: {} },
    ]);

    const registry = new FeishuClientRegistry(store);
    registry.initFromStore();

    expect(registry.getForCompany("company-g")).toBe(registry.getDefault());
    expect(registry.getForCompany("company-none")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("store mode: company binding does not fallback to global", () => {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    store.saveSecrets({
      paperclipApiKey: "test",
      defaultFeishuAppId: "cli_default",
      defaultFeishuAppSecret: "secret_default",
    });
    store.saveCompanies([
      { companyId: "company-c", feishuBinding: { mode: "company" }, defaultApprovers: [], routing: {} },
    ]);

    const registry = new FeishuClientRegistry(store);
    registry.initFromStore();

    expect(registry.getForCompany("company-c")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("store mode: legacy company with feishu secrets but no binding still works", () => {
    const dir = makeTmpDir();
    const store = new ConfigStore(dir);
    store.saveSecrets({
      paperclipApiKey: "test",
      companySecrets: {
        "company-legacy": { appId: "cli_legacy", appSecret: "secret_legacy" },
      },
    });
    store.saveCompanies([
      { companyId: "company-legacy", defaultApprovers: [], routing: {} },
    ]);

    const registry = new FeishuClientRegistry(store);
    registry.initFromStore();

    expect(registry.getForCompany("company-legacy")).not.toBeNull();
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
      documentTunnelAutoStart: false,
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
      documentTunnelAutoStart: false,
      companies: [
        { companyId: "company-a", defaultApprovers: [], routing: {}, feishu: { appId: "cli_a", appSecret: "s_a" } },
        { companyId: "company-b", defaultApprovers: [], routing: {} },
      ],
    });

    expect(registry.getForCompany("company-a")).not.toBe(registry.getForCompany("company-b"));
    expect(registry.getForCompany("company-b")).toBe(registry.getDefault());
  });
});

describe("P0-4: ConfigStore.getFeishuForCompany no default fallback", () => {
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
  let dir: string;

  afterEach(() => {
    server?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function setup(companies: { id: string; name: string }[] | Error) {
    dir = makeTmpDir();
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
    await setup([{ id: "real-id", name: "Real Co" }]);
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "real-id", name: "Ignored Name" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.restartRequired).toBe(true);
  });

  it("rejects fake companyId not in Paperclip", async () => {
    await setup([{ id: "real-id", name: "Real Co" }]);
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "fake-id" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("returns 502 when Paperclip query fails", async () => {
    await setup(new Error("connection refused"));
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "any-id" }),
    });
    expect(res.status).toBe(502);
  });

  it("uses Paperclip name as trusted name", async () => {
    const { dir: d } = await setup([{ id: "real-id", name: "Trusted Name" }]);
    const store = new ConfigStore(d);
    await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "real-id", name: "Spoofed Name" }),
    });
    const companies = store.getCompanies();
    expect(companies[0].name).toBe("Trusted Name");
  });

  it("PUT rejects companyId change", async () => {
    const { dir: d } = await setup([{ id: "real-id", name: "Real Co" }]);
    const store = new ConfigStore(d);
    store.addCompany({ companyId: "real-id", name: "Real Co", defaultApprovers: [], routing: {} });
    const res = await fetch(`http://localhost:${port}/api/config/companies/real-id`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "other-id", name: "New Name" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("cannot be changed");
  });

  it("saves feishuBinding in company config", async () => {
    const { dir: d } = await setup([{ id: "real-id", name: "Real Co" }]);
    const store = new ConfigStore(d);
    store.saveSecrets({
      paperclipApiKey: "test",
      defaultFeishuAppId: "cli_global",
      defaultFeishuAppSecret: "secret_global",
    });
    const res = await fetch(`http://localhost:${port}/api/config/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "real-id", feishuBinding: { mode: "global" } }),
    });
    expect(res.status).toBe(201);
    const companies = store.getCompanies();
    expect(companies[0].feishuBinding).toEqual({ mode: "global" });
  });
});

describe("P1-6: Feishu user directory recursive traversal", () => {
  it("listUsers traverses child departments and deduplicates", async () => {
    const { FeishuClient } = await import("../feishu/client.js");
    const client = new FeishuClient("cli_test", "secret_test");
    const rawClient = client.getRawClient();

    let userCallCount = 0;
    vi.spyOn(rawClient.contact.user, "list").mockImplementation(async (params: Record<string, unknown>) => {
      userCallCount++;
      const deptId = (params as { params?: { department_id?: string } }).params?.department_id;
      if (deptId === "0") {
        return { data: { items: [{ open_id: "ou_root", name: "Root User" }], page_token: undefined } } as never;
      }
      if (deptId === "dept-child") {
        return { data: { items: [{ open_id: "ou_child", name: "Child User" }, { open_id: "ou_root", name: "Root User" }], page_token: undefined } } as never;
      }
      return { data: { items: [], page_token: undefined } } as never;
    });

    vi.spyOn(rawClient.contact.department, "children").mockImplementation(async (input: Record<string, unknown>) => {
      const deptId = (input as { path?: { department_id?: string } }).path?.department_id;
      if (deptId === "0") {
        return { data: { items: [{ open_department_id: "dept-child" }] } } as never;
      }
      return { data: { items: [] } } as never;
    });

    const users = await client.listUsers();
    expect(users).toHaveLength(2);
    expect(users.find(u => u.openId === "ou_root")).toBeDefined();
    expect(users.find(u => u.openId === "ou_child")).toBeDefined();
    expect(userCallCount).toBeGreaterThanOrEqual(2);
    vi.restoreAllMocks();
  });
});

describe("P1-8: No inline onclick with external values in UI", () => {
  it("app.js does not contain onclick with template literal interpolation of external data", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const appJs = readFileSync(resolve(import.meta.dirname, "../../ui/app.js"), "utf-8");
    const inlineOnclickPattern = /onclick="[^"]*\$\{/g;
    const matches = appJs.match(inlineOnclickPattern);
    expect(matches).toBeNull();
  });

  it("app.js does not use onclick with esc() for dynamic values", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const appJs = readFileSync(resolve(import.meta.dirname, "../../ui/app.js"), "utf-8");
    const unsafePattern = /onclick="[^"]*esc\(/g;
    const matches = appJs.match(unsafePattern);
    expect(matches).toBeNull();
  });
});
