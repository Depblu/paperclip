import { describe, it, expect, vi } from "vitest";
import { CallbackHandler } from "../feishu/callback-handler.js";
import type { CallbackDeps } from "../feishu/callback-handler.js";
import type { CardActionEvent } from "../feishu/long-connection.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { ActionTokenService } from "../approvals/action-token.js";
import { renderApprovalCard } from "../feishu/card-renderer.js";
import type { PaperclipApprovalWithMeta, VersionSnapshot } from "../types.js";

function makeEvent(actionValue: Record<string, string>): CardActionEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    operatorOpenId: "ou_operator",
    operatorName: "Operator",
    actionValue,
    tenantKey: "tenant",
    messageId: "om_msg_binding",
  };
}

function makeDeps(overrides: {
  tokenRecord?: Partial<ReturnType<ActionTokenService["validate"]>["record"]>;
} = {}): CallbackDeps {
  const tokenRecord = {
    approvalId: "real-approval-id",
    companyId: "co-1",
    recipientOpenId: "ou_operator",
    allowedActions: ["approve", "reject", "view_details"],
    version: { approvalUpdatedAt: "2026-01-01T00:00:00Z", payloadHash: "abc" } as VersionSnapshot,
    ...overrides.tokenRecord,
  };

  const tokenService = {
    validate: vi.fn().mockReturnValue({ valid: true, record: tokenRecord }),
    consume: vi.fn(),
    invalidate: vi.fn(),
    invalidateByApproval: vi.fn(),
  } as unknown as ActionTokenService;

  const paperclip = {
    getApproval: vi.fn().mockResolvedValue({
      id: "real-approval-id",
      companyId: "co-1",
      type: "hire_agent",
      status: "pending",
      payload: { title: "Test" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
    getApprovalIssues: vi.fn().mockResolvedValue([]),
    getApprovalComments: vi.fn().mockResolvedValue([]),
    approve: vi.fn().mockResolvedValue({ status: "approved" }),
    reject: vi.fn().mockResolvedValue({ status: "rejected" }),
  } as unknown as PaperclipClient;

  const callbackRepo = {
    exists: vi.fn().mockReturnValue(false),
    insert: vi.fn(),
    updateResult: vi.fn(),
  };

  const deliveryRepo = { findActiveByApproval: vi.fn().mockReturnValue([]) };
  const feishuRegistry = { getForCompany: vi.fn().mockReturnValue(null) };

  return {
    config: {
      companies: [{ companyId: "co-1", defaultApprovers: [{ openId: "ou_operator", name: "Op" }], routing: {} }],
    },
    paperclip,
    feishuRegistry,
    tokenService,
    deliveryRepo,
    callbackRepo,
  } as unknown as CallbackDeps;
}

describe("approval_id binding: tampered approval_id rejected", () => {
  it("view_details with tampered approval_id returns toast and calls no Paperclip API", async () => {
    const deps = makeDeps();
    const handler = new CallbackHandler(deps);
    const event = makeEvent({
      action: "view_details",
      token: "valid-token",
      approval_id: "tampered-id",
    });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "不允许的操作" } });
    expect(deps.paperclip.getApproval).not.toHaveBeenCalled();
    expect(deps.paperclip.getApprovalIssues).not.toHaveBeenCalled();
    expect(deps.paperclip.getApprovalComments).not.toHaveBeenCalled();
    expect(deps.paperclip.approve).not.toHaveBeenCalled();
    expect(deps.paperclip.reject).not.toHaveBeenCalled();
  });

  it("approve with tampered approval_id returns toast and calls no Paperclip API", async () => {
    const deps = makeDeps();
    const handler = new CallbackHandler(deps);
    const event = makeEvent({
      action: "approve",
      token: "valid-token",
      approval_id: "tampered-id",
    });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "不允许的操作" } });
    expect(deps.paperclip.getApproval).not.toHaveBeenCalled();
    expect(deps.paperclip.approve).not.toHaveBeenCalled();
    expect(deps.paperclip.reject).not.toHaveBeenCalled();
  });

  it("reject with tampered approval_id returns toast and calls no Paperclip API", async () => {
    const deps = makeDeps();
    const handler = new CallbackHandler(deps);
    const event = makeEvent({
      action: "reject",
      token: "valid-token",
      approval_id: "tampered-id",
    });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "不允许的操作" } });
    expect(deps.paperclip.getApproval).not.toHaveBeenCalled();
    expect(deps.paperclip.approve).not.toHaveBeenCalled();
    expect(deps.paperclip.reject).not.toHaveBeenCalled();
  });
});

describe("renderApprovalCard button structure", () => {
  const version: VersionSnapshot = { approvalUpdatedAt: "2026-01-01T00:00:00Z", payloadHash: "abc" };

  function makeApproval(type: string): PaperclipApprovalWithMeta {
    return {
      id: "approval-123",
      companyId: "co-1",
      type,
      status: "pending",
      payload: { title: "Test Approval" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
  }

  function getButtons(card: Record<string, unknown>): Record<string, unknown>[] {
    const elements = card.elements as Record<string, unknown>[];
    const buttons: Record<string, unknown>[] = [];
    for (const el of elements) {
      if (el.tag === "action" && Array.isArray(el.actions)) {
        buttons.push(...(el.actions as Record<string, unknown>[]));
      }
    }
    return buttons;
  }

  it("actionable card has approve, reject, view_details buttons with no url", () => {
    const card = JSON.parse(renderApprovalCard(makeApproval("hire_agent"), version, "tok-1"));
    const buttons = getButtons(card);

    expect(buttons).toHaveLength(3);
    const actions = buttons.map((b) => (b.value as Record<string, string>).action);
    expect(actions).toContain("approve");
    expect(actions).toContain("reject");
    expect(actions).toContain("view_details");

    for (const btn of buttons) {
      expect(btn.url).toBeUndefined();
      expect(btn.multi_url).toBeUndefined();
    }

    const detailBtn = buttons.find((b) => (b.value as Record<string, string>).action === "view_details")!;
    expect((detailBtn.value as Record<string, string>).action).toBe("view_details");
    expect((detailBtn.value as Record<string, string>).approval_id).toBe("approval-123");
  });

  it("non-actionable card has only view_details button, no approve/reject, no url", () => {
    const card = JSON.parse(renderApprovalCard(makeApproval("budget_override_required"), version, "tok-2"));
    const buttons = getButtons(card);

    expect(buttons).toHaveLength(1);
    const actions = buttons.map((b) => (b.value as Record<string, string>).action);
    expect(actions).toEqual(["view_details"]);
    expect(actions).not.toContain("approve");
    expect(actions).not.toContain("reject");

    for (const btn of buttons) {
      expect(btn.url).toBeUndefined();
      expect(btn.multi_url).toBeUndefined();
    }
  });
});
