import { describe, it, expect, vi, afterEach } from "vitest";
import { ConfigStore } from "../config/store.js";
import { AdminServer } from "../admin/server.js";
import { registerAdminRoutes } from "../admin/routes.js";
import { PaperclipAuthService } from "../paperclip/auth-service.js";
import { FeishuClientRegistry } from "../feishu/client-registry.js";
import { FeishuVerificationSessions } from "../feishu/verification-sessions.js";
import { FeishuClient } from "../feishu/client.js";
import { PaperclipClientError } from "../paperclip/client.js";
import type { PaperclipClient } from "../paperclip/client.js";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "feishu-plan-"));
}

function mockPaperclip(overrides: Partial<PaperclipClient> = {}): PaperclipClient {
  return {
    listCompanies: vi.fn().mockResolvedValue([{ id: "co-1", name: "Test Co", issuePrefix: "TC" }]),
    getCompany: vi.fn().mockResolvedValue({
      id: "co-1", name: "Test Co", budgetMonthlyCents: 10000, spentMonthlyCents: 2000,
    }),
    listCompanyUsers: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as PaperclipClient;
}

let servers: AdminServer[] = [];
let authServices: PaperclipAuthService[] = [];
let sessionManagers: FeishuVerificationSessions[] = [];
let tmpDirs: string[] = [];

afterEach(() => {
  for (const s of servers) s.stop();
  for (const a of authServices) a.destroy();
  for (const m of sessionManagers) m.destroy();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  servers = [];
  authServices = [];
  sessionManagers = [];
  tmpDirs = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startServer(opts: {
  paperclip?: PaperclipClient;
  storeMode?: boolean;
  sessions?: FeishuVerificationSessions;
} = {}) {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  const store = new ConfigStore(dir);
  const feishuRegistry = new FeishuClientRegistry(store);
  feishuRegistry.initFromStore();
  const storeMode = opts.storeMode ?? false;
  const authService = new PaperclipAuthService(store, storeMode);
  authServices.push(authService);
  const sessions = opts.sessions ?? new FeishuVerificationSessions();
  sessionManagers.push(sessions);
  const server = new AdminServer(0, join(dir, "ui-nonexist"), "127.0.0.1");
  servers.push(server);
  registerAdminRoutes(server, {
    store,
    paperclip: opts.paperclip ?? mockPaperclip(),
    authService,
    feishuRegistry,
    storeMode,
    onConfigChanged: () => {},
    verificationSessions: sessions,
  });
  server.start();
  await new Promise((r) => setTimeout(r, 60));
  return { store, sessions, dir, baseUrl: `http://127.0.0.1:${server.getPort()}` };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

describe("P0-1: verificationId drives company save and secrets stay isolated", () => {
  it("consumes verificationId on save and rejects reuse", async () => {
    const { store, sessions, baseUrl } = await startServer();
    const verificationId = sessions.create("cli_a", "secret_a");
    const res = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "company" }, feishuVerificationId: verificationId }),
    });
    expect(res.status).toBe(201);
    expect(sessions.get(verificationId)).toBeNull();
    expect(store.getFeishuForCompany("co-1")).toEqual({ appId: "cli_a", appSecret: "secret_a" });

    const reuse = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "company" }, feishuVerificationId: verificationId }),
    });
    expect(reuse.status).toBe(400);
  });

  it("keeps appSecret out of companies.json and stores it 0600 in secrets.json", async () => {
    const { store, sessions, dir, baseUrl } = await startServer();
    const verificationId = sessions.create("cli_a", "secret_a");
    await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "company" }, feishuVerificationId: verificationId }),
    });
    const companiesRaw = readFileSync(join(dir, "companies.json"), "utf-8");
    expect(companiesRaw).not.toContain("secret_a");
    expect(companiesRaw).not.toContain("appSecret");
    const secretsRaw = JSON.parse(readFileSync(join(dir, "secrets.json"), "utf-8"));
    expect(secretsRaw.companySecrets["co-1"]).toEqual({ appId: "cli_a", appSecret: "secret_a" });
    expect(statSync(join(dir, "secrets.json")).mode & 0o777).toBe(0o600);
    expect(store.getCompanies()[0].feishu).toBeUndefined();
  });

  it("saves verified credentials even if browser body carries different feishu fields", async () => {
    const { store, sessions, dir, baseUrl } = await startServer();
    const verificationId = sessions.create("cli_verified", "secret_verified");
    const res = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({
        companyId: "co-1", feishuBinding: { mode: "company" }, feishuVerificationId: verificationId,
        feishu: { appId: "cli_spoofed", appSecret: "secret_spoofed" },
      }),
    });
    expect(res.status).toBe(201);
    expect(store.getFeishuForCompany("co-1")).toEqual({ appId: "cli_verified", appSecret: "secret_verified" });
    expect(readFileSync(join(dir, "companies.json"), "utf-8")).not.toContain("secret_spoofed");
  });

  it("company mode without verificationId and without existing secret returns 400", async () => {
    const { baseUrl } = await startServer();
    const res = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "company" } }),
    });
    expect(res.status).toBe(400);
  });

  it("editing existing company binding without verificationId keeps existing secret", async () => {
    const { store, baseUrl } = await startServer();
    store.setCompanyFeishuCredentials("co-1", { appId: "cli_a", appSecret: "secret_a" });
    store.addCompany({ companyId: "co-1", feishuBinding: { mode: "company" }, defaultApprovers: [], routing: {} });
    const res = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "company" } }),
    });
    expect(res.status).toBe(201);
    expect(store.getFeishuForCompany("co-1")).toEqual({ appId: "cli_a", appSecret: "secret_a" });
  });

  it("switching to global or none clears stale company secret", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_g", defaultFeishuAppSecret: "secret_g" });
    store.setCompanyFeishuCredentials("co-1", { appId: "cli_a", appSecret: "secret_a" });
    store.addCompany({ companyId: "co-1", feishuBinding: { mode: "company" }, defaultApprovers: [], routing: {} });
    expect(store.hasCompanyFeishuCredentials("co-1")).toBe(true);

    const toGlobal = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "global" } }),
    });
    expect(toGlobal.status).toBe(201);
    expect(store.hasCompanyFeishuCredentials("co-1")).toBe(false);

    store.setCompanyFeishuCredentials("co-1", { appId: "cli_a", appSecret: "secret_a" });
    const toNone = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1" }),
    });
    expect(toNone.status).toBe(201);
    expect(store.hasCompanyFeishuCredentials("co-1")).toBe(false);
  });

  it("migrates legacy inline feishu secret from companies.json to secrets.json on load", () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    writeFileSync(join(dir, "companies.json"), JSON.stringify({
      companies: [
        { companyId: "co-legacy", name: "L", feishu: { appId: "cli_legacy", appSecret: "secret_legacy" }, defaultApprovers: [], routing: {} },
      ],
    }));
    const store = new ConfigStore(dir);
    const raw = readFileSync(join(dir, "companies.json"), "utf-8");
    expect(raw).not.toContain("secret_legacy");
    expect(raw).not.toContain("appSecret");
    expect(store.getFeishuForCompany("co-legacy")).toEqual({ appId: "cli_legacy", appSecret: "secret_legacy" });
    expect(store.getCompanies()[0].feishu).toBeUndefined();
  });
});

describe("P0-2: server enforces binding availability", () => {
  it("global binding without global credentials returns 400", async () => {
    const { baseUrl } = await startServer();
    const res = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "global" } }),
    });
    expect(res.status).toBe(400);
  });

  it("global binding with global credentials succeeds", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_g", defaultFeishuAppSecret: "secret_g" });
    const res = await fetch(`${baseUrl}/api/config/companies`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ companyId: "co-1", feishuBinding: { mode: "global" } }),
    });
    expect(res.status).toBe(201);
  });

  it("public company list reports feishuBindingValid=false for invalid global binding", async () => {
    const { store, baseUrl } = await startServer();
    store.addCompany({ companyId: "co-1", feishuBinding: { mode: "global" }, defaultApprovers: [], routing: {} });
    const res = await fetch(`${baseUrl}/api/config/companies`);
    const data = await res.json();
    expect(data[0].feishuBindingValid).toBe(false);
    expect(data[0].hasFeishu).toBe(false);
  });

  it("global-status endpoint exposes only a boolean", async () => {
    const { store, baseUrl } = await startServer();
    const before = await (await fetch(`${baseUrl}/api/feishu/global-status`)).json();
    expect(before).toEqual({ hasDefaultFeishuApp: false });
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_g", defaultFeishuAppSecret: "secret_g" });
    const after = await (await fetch(`${baseUrl}/api/feishu/global-status`)).json();
    expect(after).toEqual({ hasDefaultFeishuApp: true });
  });
});

describe("P0-3: admin flows read current credentials dynamically", () => {
  it("resolves global binding from current store without restart", async () => {
    const { store, baseUrl } = await startServer();
    store.addCompany({ companyId: "co-g", feishuBinding: { mode: "global" }, defaultApprovers: [], routing: {} });
    const listSpy = vi.spyOn(FeishuClient.prototype, "listUsers").mockResolvedValue([{ openId: "ou_1", name: "U1" }]);

    const beforeRes = await fetch(`${baseUrl}/api/feishu/users?companyId=co-g`);
    expect(beforeRes.status).toBe(400);

    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_g", defaultFeishuAppSecret: "secret_g" });
    const afterRes = await fetch(`${baseUrl}/api/feishu/users?companyId=co-g`);
    expect(afterRes.status).toBe(200);
    expect(await afterRes.json()).toEqual([{ openId: "ou_1", name: "U1" }]);
    listSpy.mockRestore();
  });

  it("verificationId queries use the verified app, not stored config", async () => {
    const { store, sessions, baseUrl } = await startServer();
    store.setCompanyFeishuCredentials("co-1", { appId: "cli_old", appSecret: "secret_old" });
    store.addCompany({ companyId: "co-1", feishuBinding: { mode: "company" }, defaultApprovers: [], routing: {} });
    const verificationId = sessions.create("cli_new", "secret_new");
    const listSpy = vi.spyOn(FeishuClient.prototype, "listUsersWithStatus").mockResolvedValue({
      users: [{ openId: "ou_new", name: "New" }], complete: true, warnings: [],
    });
    const res = await fetch(`${baseUrl}/api/approver-suggestions?companyId=co-1&verificationId=${verificationId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].openId).toBe("ou_new");
    listSpy.mockRestore();
  });

  it("unbound company does not fall back to the default app", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_g", defaultFeishuAppSecret: "secret_g" });
    store.addCompany({ companyId: "co-none", defaultApprovers: [], routing: {} });
    const res = await fetch(`${baseUrl}/api/feishu/users?companyId=co-none`);
    expect(res.status).toBe(400);
  });

  it("explicit mode=global resolves default app for unbound company", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_g", defaultFeishuAppSecret: "secret_g" });
    const listStatusSpy = vi.spyOn(FeishuClient.prototype, "listUsersWithStatus").mockResolvedValue({
      users: [{ openId: "ou_g", name: "G" }], complete: true, warnings: [],
    });
    const listSpy = vi.spyOn(FeishuClient.prototype, "listUsers").mockResolvedValue([{ openId: "ou_g", name: "G" }]);

    const noMode = await fetch(`${baseUrl}/api/approver-suggestions?companyId=co-none`);
    expect(noMode.status).toBe(400);

    const withMode = await fetch(`${baseUrl}/api/approver-suggestions?companyId=co-none&mode=global`);
    expect(withMode.status).toBe(200);
    const data = await withMode.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].openId).toBe("ou_g");

    const usersWithMode = await fetch(`${baseUrl}/api/feishu/users?companyId=co-none&mode=global`);
    expect(usersWithMode.status).toBe(200);

    listStatusSpy.mockRestore();
    listSpy.mockRestore();
  });
});

describe("P0-4: verification session lifecycle", () => {
  it("session expires after TTL using an injectable clock", () => {
    let now = 1000;
    const sessions = new FeishuVerificationSessions({ ttlMs: 500, now: () => now });
    sessionManagers.push(sessions);
    const id = sessions.create("cli", "secret");
    expect(sessions.get(id)).not.toBeNull();
    now += 600;
    expect(sessions.get(id)).toBeNull();
  });

  it("DELETE verification endpoint cancels the session", async () => {
    const { sessions, baseUrl } = await startServer();
    const id = sessions.create("cli", "secret");
    const res = await fetch(`${baseUrl}/api/feishu/verifications/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(sessions.get(id)).toBeNull();
  });

  it("destroy clears sessions", () => {
    const sessions = new FeishuVerificationSessions();
    const id = sessions.create("cli", "secret");
    sessions.destroy();
    expect(sessions.get(id)).toBeNull();
  });

  it("server stop destroys registered verification sessions", async () => {
    const sessions = new FeishuVerificationSessions();
    await startServer({ sessions });
    const id = sessions.create("cli", "secret");
    servers[servers.length - 1].stop();
    expect(sessions.get(id)).toBeNull();
  });
});

describe("P1-1: paperclip error mapping", () => {
  async function withCompanyError(err: unknown) {
    const paperclip = mockPaperclip({ getCompany: vi.fn().mockRejectedValue(err) });
    return startServer({ paperclip });
  }

  it("maps 401", async () => {
    const { baseUrl } = await withCompanyError(new PaperclipClientError("x", 401, false));
    expect((await fetch(`${baseUrl}/api/paperclip/companies/co-1`)).status).toBe(401);
  });

  it("maps 403", async () => {
    const { baseUrl } = await withCompanyError(new PaperclipClientError("x", 403, false));
    expect((await fetch(`${baseUrl}/api/paperclip/companies/co-1`)).status).toBe(403);
  });

  it("maps 404", async () => {
    const { baseUrl } = await withCompanyError(new PaperclipClientError("x", 404, false));
    expect((await fetch(`${baseUrl}/api/paperclip/companies/co-1`)).status).toBe(404);
  });

  it("maps 5xx and network errors to 502", async () => {
    const a = await withCompanyError(new PaperclipClientError("x", 500, true));
    expect((await fetch(`${a.baseUrl}/api/paperclip/companies/co-1`)).status).toBe(502);
    const b = await withCompanyError(new Error("connection refused"));
    expect((await fetch(`${b.baseUrl}/api/paperclip/companies/co-1`)).status).toBe(502);
  });
});

describe("P1-2: feishu directory traversal completeness", () => {
  it("paginates child departments across pages", async () => {
    const client = new FeishuClient("cli", "secret");
    const raw = client.getRawClient();
    vi.spyOn(raw.contact.user, "list").mockImplementation(async (params: Record<string, unknown>) => {
      const deptId = (params as { params?: { department_id?: string } }).params?.department_id;
      return { data: { items: [{ open_id: `ou_${deptId}`, name: deptId }], page_token: undefined } } as never;
    });
    let childCall = 0;
    vi.spyOn(raw.contact.department, "children").mockImplementation(async (input: Record<string, unknown>) => {
      const deptId = (input as { path?: { department_id?: string } }).path?.department_id;
      if (deptId === "0") {
        childCall++;
        if (childCall === 1) return { data: { items: [{ open_department_id: "dept-a" }], page_token: "p2" } } as never;
        return { data: { items: [{ open_department_id: "dept-b" }], page_token: undefined } } as never;
      }
      return { data: { items: [] } } as never;
    });
    const result = await client.listUsersWithStatus();
    expect(result.complete).toBe(true);
    expect(result.users.map((u) => u.openId).sort()).toEqual(["ou_0", "ou_dept-a", "ou_dept-b"]);
  });

  it("handles cyclic department relationships without infinite loop", async () => {
    const client = new FeishuClient("cli", "secret");
    const raw = client.getRawClient();
    vi.spyOn(raw.contact.user, "list").mockImplementation(async (params: Record<string, unknown>) => {
      const deptId = (params as { params?: { department_id?: string } }).params?.department_id;
      return { data: { items: [{ open_id: `ou_${deptId}`, name: deptId }], page_token: undefined } } as never;
    });
    vi.spyOn(raw.contact.department, "children").mockImplementation(async (input: Record<string, unknown>) => {
      const deptId = (input as { path?: { department_id?: string } }).path?.department_id;
      if (deptId === "0") return { data: { items: [{ open_department_id: "dept-a" }] } } as never;
      if (deptId === "dept-a") return { data: { items: [{ open_department_id: "0" }] } } as never;
      return { data: { items: [] } } as never;
    });
    const result = await client.listUsersWithStatus();
    expect(result.complete).toBe(true);
    expect(result.users.map((u) => u.openId).sort()).toEqual(["ou_0", "ou_dept-a"]);
  });

  it("marks incomplete when a department query fails but keeps collected users", async () => {
    const client = new FeishuClient("cli", "secret");
    const raw = client.getRawClient();
    vi.spyOn(raw.contact.user, "list").mockImplementation(async (params: Record<string, unknown>) => {
      const deptId = (params as { params?: { department_id?: string } }).params?.department_id;
      if (deptId === "dept-bad") throw new Error("boom");
      return { data: { items: [{ open_id: `ou_${deptId}`, name: deptId }], page_token: undefined } } as never;
    });
    vi.spyOn(raw.contact.department, "children").mockImplementation(async (input: Record<string, unknown>) => {
      const deptId = (input as { path?: { department_id?: string } }).path?.department_id;
      if (deptId === "0") return { data: { items: [{ open_department_id: "dept-ok" }, { open_department_id: "dept-bad" }] } } as never;
      return { data: { items: [] } } as never;
    });
    const result = await client.listUsersWithStatus();
    expect(result.complete).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    const ids = result.users.map((u) => u.openId);
    expect(ids).toContain("ou_0");
    expect(ids).toContain("ou_dept-ok");
  });

  it("marks incomplete when an SDK call times out", async () => {
    const client = new FeishuClient("cli", "secret", { requestTimeoutMs: 30 });
    const raw = client.getRawClient();
    vi.spyOn(raw.contact.user, "list").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(raw.contact.department, "children").mockResolvedValue({ data: { items: [] } } as never);
    const result = await client.listUsersWithStatus();
    expect(result.complete).toBe(false);
    expect(result.warnings.some((w) => w.includes("timeout"))).toBe(true);
  });
});

describe("P1-3: budget viewModel", () => {
  async function budgetFor(monthly: number | null, spent: number | null) {
    const paperclip = mockPaperclip({
      getCompany: vi.fn().mockResolvedValue({ id: "co-1", name: "C", budgetMonthlyCents: monthly, spentMonthlyCents: spent }),
    });
    const { baseUrl } = await startServer({ paperclip });
    const data = await (await fetch(`${baseUrl}/api/paperclip/companies/co-1`)).json();
    return data.budget;
  }

  it("normal budget", async () => {
    expect(await budgetFor(10000, 2000)).toEqual({ monthlyCents: 10000, spentCents: 2000, remainingCents: 8000, overBudgetCents: 0 });
  });

  it("over budget reports negative remaining and overBudgetCents", async () => {
    const b = await budgetFor(10000, 15000);
    expect(b.remainingCents).toBe(-5000);
    expect(b.overBudgetCents).toBe(5000);
  });

  it("zero budget", async () => {
    expect(await budgetFor(0, 0)).toEqual({ monthlyCents: 0, spentCents: 0, remainingCents: 0, overBudgetCents: 0 });
  });

  it("null budget returns null", async () => {
    expect(await budgetFor(null, null)).toBeNull();
  });
});

describe("P1-4: approval type metadata single source", () => {
  it("ui/app.js does not contain a duplicate full metadata definition", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const appJs = readFileSync(resolve(import.meta.dirname, "../../ui/app.js"), "utf-8");
    expect(appJs.match(/budget_override_required:\s*{/g)).toBeNull();
    expect(appJs.match(/hire_agent:\s*{/g)).toBeNull();
    expect(appJs.match(/canFeishu:\s*(true|false)/g)).toBeNull();
  });
});

describe("P1-5: global feishu credential update is pair-based and mask-safe", () => {
  it("rejects partial update and keeps existing credentials", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_old", defaultFeishuAppSecret: "secret_old" });
    const res = await fetch(`${baseUrl}/api/config/secrets`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ defaultFeishuAppId: "cli_new" }),
    });
    expect(res.status).toBe(400);
    expect(store.getDefaultFeishuCredentials()).toEqual({ appId: "cli_old", appSecret: "secret_old" });
  });

  it("rejects masked values", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_old", defaultFeishuAppSecret: "secret_old" });
    const res = await fetch(`${baseUrl}/api/config/secrets`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ defaultFeishuAppId: "cli_***old", defaultFeishuAppSecret: "new_secret" }),
    });
    expect(res.status).toBe(400);
    expect(store.getDefaultFeishuCredentials()).toEqual({ appId: "cli_old", appSecret: "secret_old" });
  });

  it("accepts a full real pair", async () => {
    const { store, baseUrl } = await startServer();
    const res = await fetch(`${baseUrl}/api/config/secrets`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ defaultFeishuAppId: "cli_new", defaultFeishuAppSecret: "secret_new" }),
    });
    expect(res.status).toBe(200);
    expect(store.getDefaultFeishuCredentials()).toEqual({ appId: "cli_new", appSecret: "secret_new" });
  });

  it("secrets endpoint returns a boolean and never the raw secret", async () => {
    const { store, baseUrl } = await startServer();
    store.saveSecrets({ paperclipApiKey: "t", defaultFeishuAppId: "cli_old", defaultFeishuAppSecret: "secret_old" });
    const data = await (await fetch(`${baseUrl}/api/config/secrets`)).json();
    expect(data.hasDefaultFeishuApp).toBe(true);
    expect(data.defaultFeishuAppSecret).toBe("***");
    expect(JSON.stringify(data)).not.toContain("secret_old");
  });
});

