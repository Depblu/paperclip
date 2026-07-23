import { afterEach, describe, expect, it, vi } from "vitest";
import { CallbackHandler } from "../feishu/callback-handler.js";
import { TestApprovalSessions } from "../feishu/test-approval-sessions.js";
import { renderTestApprovalCard } from "../feishu/card-renderer.js";
import { APPROVAL_TYPE_META } from "../approvals/approval-type-meta.js";

let sessions: TestApprovalSessions[] = [];

afterEach(() => {
  for (const manager of sessions) manager.destroy();
  sessions = [];
});

describe("test approval callback isolation", () => {
  it("captures the result without reading or mutating Paperclip", async () => {
    const manager = new TestApprovalSessions();
    sessions.push(manager);
    const created = manager.create("co-1", "hire_agent", [
      { openId: "ou-1", name: "审批人一" },
    ]);
    const paperclip = {
      getApproval: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    };
    const handler = new CallbackHandler({
      config: {} as never,
      paperclip: paperclip as never,
      feishuRegistry: {} as never,
      tokenService: {} as never,
      deliveryRepo: {} as never,
      callbackRepo: {} as never,
      testApprovalSessions: manager,
    });

    const response = await handler.handle({
      eventId: "evt-1",
      operatorOpenId: "ou-1",
      operatorName: "审批人一",
      tenantKey: "tenant-1",
      messageId: "om_msg_1",
      actionValue: {
        action: "approve",
        token: created.token,
        approval_id: created.sessionId,
      },
    });

    expect(response).toEqual({ toast: { type: "info", content: "测试结果：已同意" } });
    expect(manager.get(created.sessionId)?.status).toBe("approved");
    expect(paperclip.getApproval).not.toHaveBeenCalled();
    expect(paperclip.approve).not.toHaveBeenCalled();
    expect(paperclip.reject).not.toHaveBeenCalled();
  });

  it("renders approve, reject and view_details callback actions for every route test type", () => {
    for (const type of Object.keys(APPROVAL_TYPE_META)) {
      const card = JSON.parse(renderTestApprovalCard(type, "session-1", "token-1"));
      const actionElement = card.elements.find((element: { tag: string }) => element.tag === "action");
      expect(actionElement.actions).toHaveLength(3);
      expect(actionElement.actions[0].value.action).toBe("approve");
      expect(actionElement.actions[1].value.action).toBe("reject");
      const detailBtn = actionElement.actions[2];
      expect(detailBtn.text.content).toBe("查看详情");
      expect(detailBtn.type).toBe("default");
      expect(detailBtn.url).toBeUndefined();
      expect(detailBtn.value).toEqual({
        action: "view_details",
        token: "token-1",
        approval_id: "session-1",
      });
      expect(JSON.stringify(card)).toContain("不会读取或修改 Paperclip 数据");
    }
  });

  it("returns a wrapped raw card for test view_details and keeps session pending", async () => {
    const manager = new TestApprovalSessions();
    sessions.push(manager);
    const created = manager.create("co-1", "hire_agent", [
      { openId: "ou-1", name: "审批人一" },
    ]);
    const feishuRegistry = { getForCompany: vi.fn() };
    const handler = new CallbackHandler({
      config: {} as never,
      paperclip: {} as never,
      feishuRegistry: feishuRegistry as never,
      tokenService: {} as never,
      deliveryRepo: {} as never,
      callbackRepo: {} as never,
      testApprovalSessions: manager,
    });

    const response = await handler.handle({
      eventId: "evt-view-test",
      operatorOpenId: "ou-1",
      operatorName: "审批人一",
      tenantKey: "tenant-1",
      messageId: "om_msg_test_view",
      actionValue: {
        action: "view_details",
        token: created.token,
        approval_id: created.sessionId,
      },
    });

    expect(response).toMatchObject({
      toast: { type: "info", content: "详情已展开" },
      card: { type: "raw" },
    });
    const card = (response as { card: { data: Record<string, unknown> } }).card.data;
    expect(JSON.stringify(card)).toContain("测试详情");
    expect(feishuRegistry.getForCompany).not.toHaveBeenCalled();
    expect(manager.get(created.sessionId)?.status).toBe("pending");
  });
});

describe("real approval view_details callback", () => {
  const approval = {
    id: "ap-1234567890",
    companyId: "co-1",
    type: "hire_agent",
    status: "pending",
    payload: { title: "招聘一名 Agent", description: "x".repeat(500) },
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };

  function buildHandler(overrides: {
    issues?: () => Promise<unknown>;
    comments?: () => Promise<unknown>;
  } = {}) {
    const paperclip = {
      getApproval: vi.fn().mockResolvedValue(approval),
      getApprovalIssues: vi.fn().mockImplementation(
        overrides.issues ?? (async () => [{ id: "i-1", title: "关联 Issue" }]),
      ),
      getApprovalComments: vi.fn().mockImplementation(
        overrides.comments ?? (async () => [{ id: "c-1", body: "一条评论", createdAt: "2026-07-23T00:00:00.000Z" }]),
      ),
      approve: vi.fn(),
      reject: vi.fn(),
    };
    const tokenService = {
      validate: vi.fn().mockReturnValue({
        valid: true,
        record: {
          approvalId: "ap-1234567890",
          companyId: "co-1",
          recipientOpenId: "ou-1",
          allowedActions: ["approve", "reject", "view_details"],
          version: { approvalUpdatedAt: approval.updatedAt, payloadHash: "h" },
        },
      }),
      consume: vi.fn(),
      invalidate: vi.fn(),
    };
    const callbackRepo = { exists: vi.fn(), insert: vi.fn(), updateResult: vi.fn() };
    const feishuRegistry = { getForCompany: vi.fn() };
    const handler = new CallbackHandler({
      config: {
        companies: [{ companyId: "co-1", defaultApprovers: [{ openId: "ou-1", name: "审批人一" }], routing: {} }],
      } as never,
      paperclip: paperclip as never,
      feishuRegistry: feishuRegistry as never,
      tokenService: tokenService as never,
      deliveryRepo: {} as never,
      callbackRepo: callbackRepo as never,
      testApprovalSessions: undefined,
    });
    return { handler, paperclip, tokenService, callbackRepo, feishuRegistry };
  }

  const viewEvent = {
    eventId: "evt-view",
    operatorOpenId: "ou-1",
    operatorName: "审批人一",
    tenantKey: "tenant-1",
    messageId: "om_msg_view",
    actionValue: { action: "view_details", token: "tok", approval_id: "ap-1234567890" },
  };

  it("returns the detail card in the official wrapped callback response", async () => {
    const { handler, paperclip, tokenService, callbackRepo, feishuRegistry } = buildHandler();
    const response = await handler.handle(viewEvent) as Record<string, unknown>;

    expect(response).toMatchObject({
      toast: { type: "info", content: "详情已展开" },
      card: { type: "raw" },
    });
    const card = (response as { card: { data: Record<string, unknown> } }).card.data;
    const cardBody = JSON.stringify(card);
    expect(cardBody).toContain("审批详情");
    expect(cardBody).toContain("关联 Issue");
    expect(cardBody).toContain("一条评论");
    expect(cardBody).toContain("同意");
    expect(cardBody).toContain("拒绝");
    expect(feishuRegistry.getForCompany).not.toHaveBeenCalled();

    expect(paperclip.approve).not.toHaveBeenCalled();
    expect(paperclip.reject).not.toHaveBeenCalled();
    expect(tokenService.consume).not.toHaveBeenCalled();
    expect(tokenService.invalidate).not.toHaveBeenCalled();
    expect(callbackRepo.insert).not.toHaveBeenCalled();
  });

  it("degrades issues/comments failures to empty detail sections", async () => {
    const { handler, paperclip } = buildHandler({
      issues: async () => { throw new Error("boom"); },
      comments: async () => { throw new Error("boom"); },
    });
    const response = await handler.handle(viewEvent) as Record<string, unknown>;
    expect(response).toMatchObject({ card: { type: "raw" } });
    const card = (response as { card: { data: Record<string, unknown> } }).card.data;
    expect(JSON.stringify(card)).toContain("无关联 Issue");
    expect(JSON.stringify(card)).toContain("无评论");
    expect(paperclip.getApprovalIssues).toHaveBeenCalled();
    expect(paperclip.getApprovalComments).toHaveBeenCalled();
  });

  it("rejects view_details when the operator is not the token recipient", async () => {
    const { handler, paperclip } = buildHandler();
    const response = await handler.handle({ ...viewEvent, operatorOpenId: "ou-other" }) as Record<string, unknown>;
    expect(response).toEqual({ toast: { type: "info", content: "您不是该审批的授权审批人" } });
    expect(paperclip.getApproval).not.toHaveBeenCalled();
  });
});

describe("renderApprovalDetailCard truncation", () => {
  it("caps payload, issue and comment lengths", async () => {
    const { renderApprovalDetailCard } = await import("../feishu/card-renderer.js");
    const longApproval = {
      id: "ap-1",
      companyId: "co-1",
      type: "hire_agent",
      status: "pending",
      payload: { blob: "y".repeat(5000) },
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const issues = Array.from({ length: 8 }, (_, i) => ({ id: `i-${i}`, title: "t".repeat(300) }));
    const comments = Array.from({ length: 8 }, (_, i) => ({
      id: `c-${i}`, body: "b".repeat(300), createdAt: "2026-07-23T00:00:00.000Z",
    }));
    const card = JSON.parse(renderApprovalDetailCard(longApproval, issues, comments, "tok", true));
    const body = JSON.stringify(card);
    expect(body).toContain("已截断");
    expect(body).toContain("另有 3 条未显示");
    expect(body.length).toBeLessThan(8000);
    const actionElement = card.elements.find((element: { tag: string }) => element.tag === "action");
    expect(actionElement.actions.map((a: { value: { action: string } }) => a.value.action))
      .toEqual(["approve", "reject"]);
  });

  it("omits decision buttons for non-actionable types", async () => {
    const { renderApprovalDetailCard } = await import("../feishu/card-renderer.js");
    const approval = {
      id: "ap-2",
      companyId: "co-1",
      type: "budget_override_required",
      status: "pending",
      payload: {},
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const card = JSON.parse(renderApprovalDetailCard(approval, [], [], "tok", false));
    expect(card.elements.find((element: { tag: string }) => element.tag === "action")).toBeUndefined();
    expect(JSON.stringify(card)).toContain("不支持飞书决策");
  });
});
