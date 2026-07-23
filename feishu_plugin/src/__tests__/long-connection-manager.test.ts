import { afterEach, describe, expect, it, vi } from "vitest";
import * as lark from "@larksuiteoapi/node-sdk";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigStore } from "../config/store.js";
import { FeishuLongConnection } from "../feishu/long-connection.js";
import { LongConnectionManager } from "../feishu/long-connection-manager.js";
import { TestApprovalSessions } from "../feishu/test-approval-sessions.js";

let dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
  vi.restoreAllMocks();
});

function makeStore(): ConfigStore {
  const dir = mkdtempSync(join(tmpdir(), "feishu-connections-"));
  dirs.push(dir);
  return new ConfigStore(dir);
}

describe("LongConnectionManager", () => {
  it("handles a v2 card callback after the SDK dispatcher flattens it", async () => {
    let dispatcher: lark.EventDispatcher | null = null;
    vi.spyOn(lark.WSClient.prototype, "start").mockImplementation(async ({ eventDispatcher }) => {
      dispatcher = eventDispatcher;
    });
    const sessions = new TestApprovalSessions();
    const session = sessions.create("co-1", "hire_agent", [
      { openId: "ou-1", name: "审批人一" },
    ]);
    const onCardAction = vi.fn(async (event) => {
      const result = sessions.handleAction(event);
      return result.matched ? result.response : undefined;
    });
    const connection = new FeishuLongConnection(
      "cli_0123456789abcdef",
      "secret",
      onCardAction,
    );
    await connection.start();

    const response = await dispatcher!.invoke({
      schema: "2.0",
      header: {
        event_id: "evt-card-1",
        event_type: "card.action.trigger",
        tenant_key: "tenant-1",
      },
      event: {
        context: { open_message_id: "om_msg_test" },
        operator: { open_id: "ou-1" },
        action: {
          value: {
            action: "approve",
            token: session.token,
            approval_id: session.sessionId,
          },
        },
      },
    });

    expect(onCardAction).toHaveBeenCalledWith({
      eventId: "evt-card-1",
      operatorOpenId: "ou-1",
      operatorName: "unknown",
      tenantKey: "tenant-1",
      messageId: "om_msg_test",
      actionValue: {
        action: "approve",
        token: session.token,
        approval_id: session.sessionId,
      },
    });
    expect(response).toEqual({ toast: { type: "info", content: "测试结果：已同意" } });
    expect(sessions.get(session.sessionId)).toMatchObject({
      status: "approved",
      operatorOpenId: "ou-1",
      operatorName: "审批人一",
    });
    sessions.destroy();
  });

  it("forwards a wrapped raw card response through the event dispatcher", async () => {
    let dispatcher: lark.EventDispatcher | null = null;
    vi.spyOn(lark.WSClient.prototype, "start").mockImplementation(async ({ eventDispatcher }) => {
      dispatcher = eventDispatcher;
    });
    const callbackResponse = {
      toast: { type: "info", content: "详情已展开" },
      card: {
        type: "raw",
        data: { header: { title: { tag: "plain_text", content: "审批详情" } }, elements: [] },
      },
    };
    const connection = new FeishuLongConnection(
      "cli_0123456789abcdef",
      "secret",
      vi.fn().mockResolvedValue(callbackResponse),
    );
    await connection.start();

    const response = await dispatcher!.invoke({
      schema: "2.0",
      header: { event_id: "evt-detail", event_type: "card.action.trigger", tenant_key: "tenant-1" },
      event: {
        context: { open_message_id: "om_detail" },
        operator: { open_id: "ou-1" },
        action: { value: { action: "view_details", token: "tok", approval_id: "ap-1" } },
      },
    });

    expect(response).toEqual(callbackResponse);
  });

  it("reads messageId from event.context.open_message_id (v2 format)", async () => {
    let dispatcher: lark.EventDispatcher | null = null;
    vi.spyOn(lark.WSClient.prototype, "start").mockImplementation(async ({ eventDispatcher }) => {
      dispatcher = eventDispatcher;
    });
    const onCardAction = vi.fn(async () => undefined);
    const connection = new FeishuLongConnection("cli_0123456789abcdef", "secret", onCardAction);
    await connection.start();

    await dispatcher!.invoke({
      schema: "2.0",
      header: { event_id: "evt-ctx", event_type: "card.action.trigger", tenant_key: "tenant-1" },
      event: {
        context: { open_message_id: "om_ctx_123" },
        operator: { open_id: "ou-1" },
        action: { value: { action: "approve", token: "tok", approval_id: "ap-1" } },
      },
    });

    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "om_ctx_123" }),
    );
  });

  it("falls back to event.open_message_id when context is absent", async () => {
    let dispatcher: lark.EventDispatcher | null = null;
    vi.spyOn(lark.WSClient.prototype, "start").mockImplementation(async ({ eventDispatcher }) => {
      dispatcher = eventDispatcher;
    });
    const onCardAction = vi.fn(async () => undefined);
    const connection = new FeishuLongConnection("cli_0123456789abcdef", "secret", onCardAction);
    await connection.start();

    await dispatcher!.invoke({
      schema: "2.0",
      header: { event_id: "evt-fb", event_type: "card.action.trigger", tenant_key: "tenant-1" },
      event: {
        open_message_id: "om_fallback_456",
        operator: { open_id: "ou-1" },
        action: { value: { action: "approve", token: "tok", approval_id: "ap-1" } },
      },
    });

    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "om_fallback_456" }),
    );
  });

  it("rejects card action when open_message_id is missing", async () => {
    let dispatcher: lark.EventDispatcher | null = null;
    vi.spyOn(lark.WSClient.prototype, "start").mockImplementation(async ({ eventDispatcher }) => {
      dispatcher = eventDispatcher;
    });
    const onCardAction = vi.fn(async () => undefined);
    const connection = new FeishuLongConnection("cli_0123456789abcdef", "secret", onCardAction);
    await connection.start();

    await dispatcher!.invoke({
      schema: "2.0",
      header: { event_id: "evt-nomsg", event_type: "card.action.trigger", tenant_key: "tenant-1" },
      event: {
        operator: { open_id: "ou-1" },
        action: { value: { action: "approve", token: "tok", approval_id: "ap-1" } },
      },
    });

    expect(onCardAction).not.toHaveBeenCalled();
  });

  it("starts and waits for a newly verified app before it is used", async () => {
    const start = vi.spyOn(FeishuLongConnection.prototype, "start").mockResolvedValue();
    const waitUntilReady = vi.spyOn(FeishuLongConnection.prototype, "waitUntilReady").mockResolvedValue();
    const manager = new LongConnectionManager(makeStore());
    await manager.start(async () => undefined);

    await manager.ensureConnection("cli_0123456789abcdef", "secret-new");

    expect(start).toHaveBeenCalledTimes(1);
    expect(waitUntilReady).toHaveBeenCalledTimes(1);
    await manager.stop();
  });

  it("reuses one callback connection for the same app", async () => {
    const start = vi.spyOn(FeishuLongConnection.prototype, "start").mockResolvedValue();
    const waitUntilReady = vi.spyOn(FeishuLongConnection.prototype, "waitUntilReady").mockResolvedValue();
    const manager = new LongConnectionManager(makeStore());
    await manager.start(async () => undefined);

    await manager.ensureConnection("cli_0123456789abcdef", "secret-one");
    await manager.ensureConnection("cli_0123456789abcdef", "secret-two");

    expect(start).toHaveBeenCalledTimes(1);
    expect(waitUntilReady).toHaveBeenCalledTimes(2);
    await manager.stop();
  });

  it("closes the SDK websocket when a connection stops", async () => {
    const close = vi.spyOn(lark.WSClient.prototype, "close");
    const connection = new FeishuLongConnection(
      "cli_0123456789abcdef",
      "secret",
      async () => undefined,
    );

    await connection.stop();

    expect(close).toHaveBeenCalledWith({ force: true });
  });
});
