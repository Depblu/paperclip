import { describe, it, expect, vi, afterEach } from "vitest";
import { ConfigStore } from "../config/store.js";
import { AdminServer } from "../admin/server.js";
import { registerAdminRoutes } from "../admin/routes.js";
import { PaperclipAuthService } from "../paperclip/auth-service.js";
import { FeishuClientRegistry } from "../feishu/client-registry.js";
import type { PaperclipClient } from "../paperclip/client.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const realFetch = globalThis.fetch;

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "feishu-enhance-test-"));
}

function mockPaperclip(overrides: Partial<PaperclipClient> = {}): PaperclipClient {
  return {
    listCompanies: vi.fn().mockResolvedValue([
      { id: "co-1", name: "Test Co", issuePrefix: "TC" },
    ]),
    getCompany: vi.fn().mockResolvedValue({
      id: "co-1",
      name: "Test Co",
      issuePrefix: "TC",
      description: "A test company",
      status: "active",
      budgetMonthlyCents: 10000,
      spentMonthlyCents: 2000,
      logoUrl: null,
      brandColor: null,
      requireBoardApprovalForNewAgents: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    }),
    listCompanyUsers: vi.fn().mockResolvedValue([
      { id: "u-1", name: "张三", email: "zhangsan@example.com" },
      { id: "u-2", name: "李四", email: "lisi@example.com" },
    ]),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as PaperclipClient;
}

let server: AdminServer | null = null;
let authService: PaperclipAuthService | null = null;
let tmpDir: string | null = null;

afterEach(() => {
  server?.stop();
  server = null;
  authService?.destroy();
  authService = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

async function setup(paperclip: PaperclipClient, opts?: { feishuCompanyId?: string; storeMode?: boolean }) {
  tmpDir = makeTmpDir();
  const store = new ConfigStore(tmpDir);
  const feishuRegistry = new FeishuClientRegistry(store);
  const storeMode = opts?.storeMode ?? false;
  if (opts?.feishuCompanyId) {
    store.saveSecrets({
      paperclipApiKey: "test-token",
      companySecrets: {
        [opts.feishuCompanyId]: { appId: "cli_test", appSecret: "secret_test" },
      },
    });
    store.saveCompanies([
      { companyId: opts.feishuCompanyId, feishuBinding: { mode: "company" }, defaultApprovers: [], routing: {} },
    ]);
  }
  feishuRegistry.initFromStore();
  authService = new PaperclipAuthService(store, storeMode);
  const port = 19400 + Math.floor(Math.random() * 500);
  server = new AdminServer(port, join(tmpDir, "ui-nonexist"), "127.0.0.1");
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
  return { store, port };
}

describe("P0-1: Store mode uses current auth credentials", () => {
  it("GET /api/paperclip/companies/:id uses authService in store mode", async () => {
    const paperclip = mockPaperclip();
    const { port, store } = await setup(paperclip, { storeMode: true });
    store.saveSecrets({ paperclipApiKey: "store-token" });

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("127.0.0.1")) return realFetch(input as RequestInfo, init);
      if (url.includes("/api/companies/co-1")) {
        return { ok: true, json: async () => ({ id: "co-1", name: "Store Co", budgetMonthlyCents: 5000, spentMonthlyCents: 1000 }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/paperclip/companies/co-1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("co-1");
    expect(data.name).toBe("Store Co");
  });

  it("returns 401 when not authorized in store mode", async () => {
    const paperclip = mockPaperclip();
    const { port } = await setup(paperclip, { storeMode: true });
    const res = await fetch(`http://127.0.0.1:${port}/api/paperclip/companies/co-1`);
    expect(res.status).toBe(401);
  });
});

describe("P0-2: Uses real /user-directory endpoint", () => {
  it("listCompanyUsers calls /user-directory and parses nested response", async () => {
    const { PaperclipClient } = await import("../paperclip/client.js");
    const client = new PaperclipClient("http://localhost:3100", "test-key", 10000);

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/companies/co-1/user-directory")) {
        return {
          ok: true,
          json: async () => ({
            users: [
              { principalId: "p-1", status: "active", user: { id: "u-1", name: "张三", email: "zhangsan@example.com", image: null } },
              { principalId: "p-2", status: "active", user: null },
              { principalId: "p-3", status: "active", user: { id: "u-3", name: "王五", email: null, image: null } },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404, text: async () => "not found" } as Response;
    });

    const users = await client.listCompanyUsers("co-1");
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({ id: "u-1", name: "张三", email: "zhangsan@example.com" });
    expect(users[1]).toEqual({ id: "u-3", name: "王五", email: null });
  });
});

describe("P0-3: verificationId flow", () => {
  it("verify returns verificationId on success", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("127.0.0.1")) return realFetch(input as RequestInfo, init);
      if (url.includes("tenant_access_token")) {
        return { ok: true, json: async () => ({ code: 0, tenant_access_token: "tok-123" }) } as Response;
      }
      if (url.includes("bot/v3/info")) {
        return { ok: true, json: async () => ({ code: 0, bot: { app_name: "MyApp", bot_name: "MyBot", open_id: "ou_bot" } }) } as Response;
      }
      if (url.includes("contact/v3/users")) {
        return { ok: true, json: async () => ({ code: 0, data: {} }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/feishu/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "cli_ok", appSecret: "ok_secret" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.verificationId).toBeDefined();
    expect(data.verificationId.length).toBeGreaterThan(20);
    expect(data.appName).toBe("MyApp");
  });

  it("approver-suggestions works with verificationId for new company", async () => {
    const { FeishuClient } = await import("../feishu/client.js");
    const listUsersSpy = vi.spyOn(FeishuClient.prototype, "listUsersWithStatus").mockResolvedValue({
      users: [{ openId: "ou_zhang", name: "张三", email: "zhangsan@example.com" }],
      complete: true,
      warnings: [],
    });

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("127.0.0.1")) return realFetch(input as RequestInfo, init);
      if (url.includes("tenant_access_token")) {
        return { ok: true, json: async () => ({ code: 0, tenant_access_token: "tok-verify" }) } as Response;
      }
      if (url.includes("bot/v3/info")) {
        return { ok: true, json: async () => ({ code: 0, bot: { app_name: "App", bot_name: "Bot", open_id: "ou_b" } }) } as Response;
      }
      if (url.includes("contact/v3/users")) {
        return { ok: true, json: async () => ({ code: 0, data: {} }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const { port } = await setup(mockPaperclip());

    const verifyRes = await fetch(`http://127.0.0.1:${port}/api/feishu/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "cli_new", appSecret: "secret_new" }),
    });
    const verifyData = await verifyRes.json();
    expect(verifyData.verificationId).toBeDefined();

    const sugRes = await fetch(
      `http://127.0.0.1:${port}/api/approver-suggestions?companyId=co-new&verificationId=${verifyData.verificationId}`,
    );
    expect(sugRes.status).toBe(200);
    const sugData = await sugRes.json();
    expect(sugData.suggestions).toHaveLength(1);
    expect(sugData.suggestions[0].openId).toBe("ou_zhang");
    listUsersSpy.mockRestore();
  });

  it("returns error for invalid verificationId", async () => {
    const { port } = await setup(mockPaperclip());
    const res = await fetch(
      `http://127.0.0.1:${port}/api/approver-suggestions?companyId=co-1&verificationId=invalid-id`,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not found or expired");
  });
});

describe("P1-5: Company detail budget fields", () => {
  it("returns budget viewModel with cents fields", async () => {
    const paperclip = mockPaperclip();
    const { port } = await setup(paperclip);
    const res = await fetch(`http://127.0.0.1:${port}/api/paperclip/companies/co-1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.budget).toEqual({
      monthlyCents: 10000,
      spentCents: 2000,
      remainingCents: 8000,
      overBudgetCents: 0,
    });
    expect(data.requireBoardApprovalForNewAgents).toBe(true);
  });

  it("returns null budget when budgetMonthlyCents is null", async () => {
    const paperclip = mockPaperclip({
      getCompany: vi.fn().mockResolvedValue({
        id: "co-2", name: "No Budget Co", budgetMonthlyCents: null, spentMonthlyCents: null,
      }),
    });
    const { port } = await setup(paperclip);
    const res = await fetch(`http://127.0.0.1:${port}/api/paperclip/companies/co-2`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.budget).toBeNull();
  });
});

describe("P1-6: Feishu verify checks business code and timeout", () => {
  it("returns valid=false when HTTP 200 but business code != 0", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("127.0.0.1")) return realFetch(input as RequestInfo, init);
      if (url.includes("tenant_access_token")) {
        return { ok: true, json: async () => ({ code: 10003, msg: "invalid app_id" }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/feishu/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "cli_bad", appSecret: "bad_secret" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toContain("invalid app_id");
  });

  it("contacts permission requires code===0 not just HTTP ok", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("127.0.0.1")) return realFetch(input as RequestInfo, init);
      if (url.includes("tenant_access_token")) {
        return { ok: true, json: async () => ({ code: 0, tenant_access_token: "tok-x" }) } as Response;
      }
      if (url.includes("bot/v3/info")) {
        return { ok: true, json: async () => ({ code: 0, bot: { app_name: "App" } }) } as Response;
      }
      if (url.includes("contact/v3/users")) {
        return { ok: true, json: async () => ({ code: 99991664, msg: "no permission" }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/feishu/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "cli_x", appSecret: "s_x" }),
    });
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.permissions.contacts).toBe(false);
  });
});

describe("P1-7: Approval type metadata from production source", () => {
  it("production module has correct budget_override_required metadata", async () => {
    const { APPROVAL_TYPE_META } = await import("../approvals/approval-type-meta.js");
    expect(APPROVAL_TYPE_META.budget_override_required.canFeishu).toBe(false);
    expect(APPROVAL_TYPE_META.budget_override_required.label).toBe("预算超限处理");
    expect(APPROVAL_TYPE_META.budget_override_required.hint).toContain("跳转 Paperclip");
    expect(APPROVAL_TYPE_META.hire_agent.canFeishu).toBe(true);
    expect(APPROVAL_TYPE_META.approve_ceo_strategy.canFeishu).toBe(true);
    expect(APPROVAL_TYPE_META.request_board_approval.canFeishu).toBe(true);
  });

  it("GET /api/approval-type-meta serves production metadata", async () => {
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/approval-type-meta`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.budget_override_required.canFeishu).toBe(false);
    expect(data.hire_agent.canFeishu).toBe(true);
  });
});

describe("P0-2: Approver suggestions response structure", () => {
  it("returns suggestions with directory status and match confidence", async () => {
    const { FeishuClient } = await import("../feishu/client.js");
    const listUsersSpy = vi.spyOn(FeishuClient.prototype, "listUsersWithStatus").mockResolvedValue({
      users: [
        { openId: "ou_zhang", name: "张三", email: "zhangsan@example.com" },
        { openId: "ou_wang", name: "王五", email: "wangwu@example.com" },
        { openId: "ou_li", name: "李四", email: undefined },
      ],
      complete: true,
      warnings: [],
    });
    const { port } = await setup(mockPaperclip(), { feishuCompanyId: "co-1" });
    const res = await fetch(`http://127.0.0.1:${port}/api/approver-suggestions?companyId=co-1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paperclipDirectoryAvailable).toBe(true);
    expect(data.paperclipDirectoryError).toBeNull();
    expect(data.suggestions).toHaveLength(3);

    const zhang = data.suggestions.find((s: { name: string }) => s.name === "张三");
    expect(zhang.matchedPaperclipUser).not.toBeNull();
    expect(zhang.matchConfidence).toBe("high");

    const li = data.suggestions.find((s: { name: string }) => s.name === "李四");
    expect(li.matchedPaperclipUser).not.toBeNull();
    expect(li.matchConfidence).toBe("low");

    const wang = data.suggestions.find((s: { name: string }) => s.name === "王五");
    expect(wang.matchedPaperclipUser).toBeNull();
    expect(wang.matchConfidence).toBeNull();
    listUsersSpy.mockRestore();
  });

  it("reports directory error without masking as empty", async () => {
    const { FeishuClient } = await import("../feishu/client.js");
    const listUsersSpy = vi.spyOn(FeishuClient.prototype, "listUsersWithStatus").mockResolvedValue({
      users: [{ openId: "ou_x", name: "X", email: "x@example.com" }],
      complete: true,
      warnings: [],
    });
    const paperclip = mockPaperclip({
      listCompanyUsers: vi.fn().mockRejectedValue(new Error("403 forbidden")),
    });
    const { port } = await setup(paperclip, { feishuCompanyId: "co-1" });
    const res = await fetch(`http://127.0.0.1:${port}/api/approver-suggestions?companyId=co-1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paperclipDirectoryAvailable).toBe(false);
    expect(data.paperclipDirectoryError).toContain("403");
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].matchConfidence).toBeNull();
    listUsersSpy.mockRestore();
  });
});

describe("Phase 3: Feishu app verification", () => {
  it("returns 400 when appId or appSecret missing", async () => {
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/feishu/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "cli_x" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });
});

describe("Phase 4: Approver suggestions require feishu client", () => {
  it("returns 400 without companyId", async () => {
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/approver-suggestions`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no feishu app configured for company", async () => {
    const { port } = await setup(mockPaperclip());
    const res = await fetch(`http://127.0.0.1:${port}/api/approver-suggestions?companyId=co-1`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("no feishu app");
  });
});
