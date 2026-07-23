import { afterEach, describe, expect, it } from "vitest";
import { TestApprovalSessions } from "../feishu/test-approval-sessions.js";
import type { CardActionEvent } from "../feishu/long-connection.js";

let sessions: TestApprovalSessions[] = [];

afterEach(() => {
  for (const manager of sessions) manager.destroy();
  sessions = [];
});

function actionEvent(overrides: Partial<CardActionEvent> = {}): CardActionEvent {
  return {
    eventId: "evt-1",
    operatorOpenId: "ou-1",
    operatorName: "审批人一",
    tenantKey: "tenant-1",
    actionValue: {},
    ...overrides,
  };
}

describe("TestApprovalSessions", () => {
  it("uses a 600 second wait window", () => {
    let now = Date.parse("2026-07-23T00:00:00.000Z");
    const manager = new TestApprovalSessions({ now: () => now });
    sessions.push(manager);

    const created = manager.create("co-1", "hire_agent", [{ openId: "ou-1", name: "审批人一" }]);
    expect(Date.parse(created.expiresAt) - now).toBe(600_000);
    expect(manager.get(created.sessionId)?.status).toBe("pending");

    now += 600_000;
    expect(manager.get(created.sessionId)?.status).toBe("timed_out");
  });

  it("records an authorized Feishu approval result", () => {
    const manager = new TestApprovalSessions();
    sessions.push(manager);
    const created = manager.create("co-1", "approve_ceo_strategy", [{ openId: "ou-1", name: "审批人一" }]);

    const handled = manager.handleAction(actionEvent({
      actionValue: {
        action: "approve",
        token: created.token,
        approval_id: created.sessionId,
      },
    }));

    expect(handled.matched).toBe(true);
    expect(manager.get(created.sessionId)).toMatchObject({
      status: "approved",
      operatorOpenId: "ou-1",
      operatorName: "审批人一",
    });
  });

  it("records a rejection and blocks a second decision", () => {
    const manager = new TestApprovalSessions();
    sessions.push(manager);
    const created = manager.create("co-1", "request_board_approval", [{ openId: "ou-1", name: "审批人一" }]);
    const event = actionEvent({
      actionValue: {
        action: "reject",
        token: created.token,
        approval_id: created.sessionId,
      },
    });

    manager.handleAction(event);
    manager.handleAction({ ...event, actionValue: { ...event.actionValue, action: "approve" } });
    expect(manager.get(created.sessionId)?.status).toBe("rejected");
  });

  it("rejects an operator outside the configured approvers", () => {
    const manager = new TestApprovalSessions();
    sessions.push(manager);
    const created = manager.create("co-1", "hire_agent", [{ openId: "ou-allowed", name: "允许审批人" }]);

    manager.handleAction(actionEvent({
      operatorOpenId: "ou-other",
      actionValue: {
        action: "approve",
        token: created.token,
        approval_id: created.sessionId,
      },
    }));

    expect(manager.get(created.sessionId)?.status).toBe("pending");
  });

  it("cancels pending waits and ignores unrelated callbacks", () => {
    const manager = new TestApprovalSessions();
    sessions.push(manager);
    const created = manager.create("co-1", "budget_override_required", [{ openId: "ou-1", name: "审批人一" }]);

    expect(manager.handleAction(actionEvent({
      actionValue: { action: "approve", token: "normal-token", approval_id: "approval-1" },
    }))).toEqual({ matched: false });
    expect(manager.cancel(created.sessionId)?.status).toBe("cancelled");
  });
});
