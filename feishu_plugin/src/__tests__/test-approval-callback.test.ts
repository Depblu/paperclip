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

  it("renders approve and reject actions for every route test type", () => {
    for (const type of Object.keys(APPROVAL_TYPE_META)) {
      const card = JSON.parse(renderTestApprovalCard(type, "session-1", "token-1"));
      const actionElement = card.elements.find((element: { tag: string }) => element.tag === "action");
      expect(actionElement.actions.map((action: { value: { action: string } }) => action.value.action))
        .toEqual(["approve", "reject"]);
      expect(JSON.stringify(card)).toContain("不会读取或修改 Paperclip 数据");
    }
  });
});
