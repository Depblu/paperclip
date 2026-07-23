import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AdminServer } from "../admin/server.js";
import { registerAdminRoutes } from "../admin/routes.js";
import { ConfigStore } from "../config/store.js";
import { PaperclipAuthService } from "../paperclip/auth-service.js";
import { FeishuClientRegistry } from "../feishu/client-registry.js";
import { FeishuClient } from "../feishu/client.js";
import { TestApprovalSessions } from "../feishu/test-approval-sessions.js";

let server: AdminServer | null = null;
let authService: PaperclipAuthService | null = null;
let dir: string | null = null;

afterEach(() => {
  server?.stop();
  authService?.destroy();
  if (dir) rmSync(dir, { recursive: true, force: true });
  server = null;
  authService = null;
  dir = null;
  vi.restoreAllMocks();
});

async function setup(ensureFeishuCallback = vi.fn().mockResolvedValue(undefined)) {
  dir = mkdtempSync(join(tmpdir(), "feishu-test-routes-"));
  const store = new ConfigStore(dir);
  store.setCompanyFeishuCredentials("co-1", { appId: "cli-test", appSecret: "secret-test" });
  const feishuRegistry = new FeishuClientRegistry(store);
  feishuRegistry.initFromStore();
  authService = new PaperclipAuthService(store, false);
  const sessions = new TestApprovalSessions();
  server = new AdminServer(0, join(dir, "ui-missing"), "127.0.0.1");
  registerAdminRoutes(server, {
    store,
    paperclip: { healthCheck: vi.fn().mockResolvedValue(true) } as never,
    authService,
    feishuRegistry,
    storeMode: false,
    onConfigChanged: () => {},
    testApprovalSessions: sessions,
    ensureFeishuCallback,
  });
  server.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  return { sessions, ensureFeishuCallback, baseUrl: `http://127.0.0.1:${server.getPort()}` };
}

const REQUEST = {
  companyId: "co-1",
  type: "hire_agent",
  approvers: [{ openId: "ou-1", name: "审批人一" }],
  mode: "company",
};

describe("test approval routes", () => {
  it("creates a pending session and exposes the Feishu result", async () => {
    let cardContent = "";
    const sendCard = vi.spyOn(FeishuClient.prototype, "sendInteractiveCard").mockImplementation(async (_openId, content) => {
      cardContent = content;
      return { messageId: "message-1", cardId: null };
    });
    const { sessions, ensureFeishuCallback, baseUrl } = await setup();
    const send = await fetch(`${baseUrl}/api/feishu/test-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
    const sent = await send.json();

    expect(send.status).toBe(200);
    expect(ensureFeishuCallback).toHaveBeenCalledWith("cli-test", "secret-test");
    expect(ensureFeishuCallback.mock.invocationCallOrder[0]).toBeLessThan(sendCard.mock.invocationCallOrder[0]);
    expect(sent.status).toBe("pending");
    expect(Date.parse(sent.expiresAt) - Date.now()).toBeGreaterThan(599_000);
    expect((await (await fetch(`${baseUrl}/api/feishu/test-sessions/${sent.sessionId}`)).json()).status)
      .toBe("pending");

    const card = JSON.parse(cardContent);
    const actionElement = card.elements.find((element: { tag: string }) => element.tag === "action");
    expect(actionElement.actions).toHaveLength(3);
    const detailBtn = actionElement.actions[2];
    expect(detailBtn.text.content).toBe("查看详情");
    expect(detailBtn.url).toBeUndefined();
    expect(detailBtn.value.action).toBe("view_details");
    expect(detailBtn.value.approval_id).toBe(sent.sessionId);
    const rejectValue = actionElement.actions[1].value;
    sessions.handleAction({
      eventId: "evt-1",
      operatorOpenId: "ou-1",
      operatorName: "unknown",
      tenantKey: "tenant-1",
      actionValue: rejectValue,
    });
    const result = await (await fetch(`${baseUrl}/api/feishu/test-sessions/${sent.sessionId}`)).json();
    expect(result).toMatchObject({ status: "rejected", operatorName: "审批人一" });
    expect(sent.token).toBeUndefined();
  });

  it("cancels a pending session through the admin API", async () => {
    vi.spyOn(FeishuClient.prototype, "sendInteractiveCard").mockResolvedValue({ messageId: "message-1", cardId: null });
    const { baseUrl } = await setup();
    const sent = await (await fetch(`${baseUrl}/api/feishu/test-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    })).json();

    const cancelled = await (await fetch(
      `${baseUrl}/api/feishu/test-sessions/${sent.sessionId}/cancel`,
      { method: "POST" },
    )).json();
    expect(cancelled.status).toBe("cancelled");
  });

  it("does not send a card when its callback connection is offline", async () => {
    const sendCard = vi.spyOn(FeishuClient.prototype, "sendInteractiveCard");
    const ensureFeishuCallback = vi.fn().mockRejectedValue(new Error("not connected"));
    const { baseUrl } = await setup(ensureFeishuCallback);

    const response = await fetch(`${baseUrl}/api/feishu/test-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "feishu callback connection is not online" });
    expect(sendCard).not.toHaveBeenCalled();
  });
});
