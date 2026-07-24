import { describe, it, expect, vi } from "vitest";
import { CallbackHandler } from "../feishu/callback-handler.js";
import type { CallbackDeps } from "../feishu/callback-handler.js";
import type { CardActionEvent } from "../feishu/long-connection.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { ActionTokenService } from "../approvals/action-token.js";
import type { VersionSnapshot, PaperclipInteraction } from "../types.js";

const RESOURCE_KEY = "interaction:issue-1:int-1";

function makeEvent(actionValue: Record<string, string>): CardActionEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    operatorOpenId: "ou_operator",
    operatorName: "Operator",
    actionValue,
    tenantKey: "tenant",
    messageId: "om_msg_int",
  };
}

function makeInteraction(overrides: Partial<PaperclipInteraction> = {}): PaperclipInteraction {
  return {
    id: "int-1",
    companyId: "co-1",
    issueId: "issue-1",
    kind: "request_confirmation",
    status: "pending",
    payload: { version: 1, prompt: "Confirm?" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDeps(overrides: {
  tokenRecord?: Partial<NonNullable<ReturnType<ActionTokenService["validate"]>["record"]>>;
  interaction?: PaperclipInteraction | null;
  acceptResult?: PaperclipInteraction;
  rejectResult?: PaperclipInteraction;
  acceptError?: Error;
  rejectError?: Error;
} = {}): CallbackDeps {
  const tokenRecord = {
    approvalId: RESOURCE_KEY,
    companyId: "co-1",
    recipientOpenId: "ou_operator",
    allowedActions: ["accept", "reject"],
    version: { approvalUpdatedAt: "2026-01-01T00:00:00Z", payloadHash: "9947ccccb8a2ebf23b34a6a1e2e2417a4b62d57ce16ace22b643b74c963f3a4d" } as VersionSnapshot,
    ...overrides.tokenRecord,
  };

  const tokenService = {
    validate: vi.fn().mockReturnValue({ valid: true, record: tokenRecord }),
    consume: vi.fn(),
    invalidate: vi.fn(),
    invalidateByApproval: vi.fn(),
  } as unknown as ActionTokenService;

  const interaction = overrides.interaction !== undefined ? overrides.interaction : makeInteraction();
  const paperclip = {
    findInteraction: vi.fn().mockResolvedValue(interaction),
    acceptInteraction: overrides.acceptError
      ? vi.fn().mockRejectedValue(overrides.acceptError)
      : vi.fn().mockResolvedValue(overrides.acceptResult ?? makeInteraction({ status: "accepted" })),
    rejectInteraction: overrides.rejectError
      ? vi.fn().mockRejectedValue(overrides.rejectError)
      : vi.fn().mockResolvedValue(overrides.rejectResult ?? makeInteraction({ status: "rejected" })),
    getApproval: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
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
      companies: [{
        companyId: "co-1",
        defaultApprovers: [{ openId: "ou_operator", name: "Op" }],
        routing: { request_confirmation: { approvers: [{ openId: "ou_operator", name: "Op" }] } },
      }],
    },
    paperclip,
    feishuRegistry,
    tokenService,
    deliveryRepo,
    callbackRepo,
  } as unknown as CallbackDeps;
}

describe("interaction callback: accept", () => {
  it("calls acceptInteraction and consumes token on success", async () => {
    const deps = makeDeps();
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "已同意" } });
    expect(deps.paperclip.acceptInteraction).toHaveBeenCalledWith("issue-1", "int-1");
    expect(deps.tokenService.consume).toHaveBeenCalledWith("tok");
  });
});

describe("interaction callback: reject", () => {
  it("calls rejectInteraction with reason and consumes token", async () => {
    const deps = makeDeps();
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "reject", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "已拒绝" } });
    expect(deps.paperclip.rejectInteraction).toHaveBeenCalledWith(
      "issue-1", "int-1", expect.stringContaining("Operator"),
    );
    expect(deps.tokenService.consume).toHaveBeenCalledWith("tok");
  });
});

describe("interaction callback: tampered resource key", () => {
  it("rejects when token resource key does not match card resource key", async () => {
    const deps = makeDeps({
      tokenRecord: { approvalId: "interaction:issue-1:int-OTHER" },
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "不允许的操作" } });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });
});

describe("interaction callback: unauthorized operator", () => {
  it("rejects when operator openId does not match token recipient", async () => {
    const deps = makeDeps({
      tokenRecord: { recipientOpenId: "ou_someone_else" },
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "您不是该确认请求的授权审批人" } });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });
});

describe("interaction callback: version mismatch", () => {
  it("invalidates token when interaction version changed", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ updatedAt: "2026-02-01T00:00:00Z" }),
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "确认请求内容已更新，当前卡片已失效，请等待新卡片" } });
    expect(deps.tokenService.invalidate).toHaveBeenCalledWith("tok");
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });
});

describe("interaction callback: duplicate event", () => {
  it("returns already-processed toast for duplicate eventId", async () => {
    const deps = makeDeps();
    (deps.callbackRepo.exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "该操作已处理" } });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });
});

describe("interaction callback: already decided", () => {
  it("returns already-decided toast when interaction is accepted", async () => {
    const deps = makeDeps({ interaction: makeInteraction({ status: "accepted" }) });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({
      toast: { type: "info", content: "该确认请求已处理（accepted），请以 Paperclip 状态为准" },
    });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
    expect(deps.tokenService.consume).toHaveBeenCalledWith("tok");
  });

  it("returns already-decided toast when interaction is expired", async () => {
    const deps = makeDeps({ interaction: makeInteraction({ status: "expired" }) });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "reject", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({
      toast: { type: "info", content: "该确认请求已处理（expired），请以 Paperclip 状态为准" },
    });
    expect(deps.paperclip.rejectInteraction).not.toHaveBeenCalled();
  });
});

describe("interaction callback: 5xx ambiguity", () => {
  it("re-reads interaction and confirms if target state reached", async () => {
    const serverErr = Object.assign(new Error("500"), { statusCode: 500, retryable: true });
    const deps = makeDeps({ acceptError: serverErr });
    // After the 5xx, re-read shows accepted
    (deps.paperclip.findInteraction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeInteraction()) // first read: pending
      .mockResolvedValueOnce(makeInteraction({ status: "accepted" })); // re-read after 5xx

    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "已同意" } });
    expect(deps.tokenService.consume).toHaveBeenCalledWith("tok");
  });

  it("returns retryable toast when 5xx and re-read also fails", async () => {
    const serverErr = Object.assign(new Error("500"), { statusCode: 500, retryable: true });
    const deps = makeDeps({ acceptError: serverErr });
    (deps.paperclip.findInteraction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeInteraction())
      .mockRejectedValueOnce(new Error("still down"));

    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "处理失败，请稍后重试" } });
    expect(deps.tokenService.consume).not.toHaveBeenCalled();
  });
});

describe("interaction callback: invalid token", () => {
  it("returns invalid token toast", async () => {
    const deps = makeDeps();
    (deps.tokenService.validate as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false, reason: "token_not_found_or_expired_or_used",
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "bad-tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "操作凭证无效或已过期" } });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });
});

describe("interaction callback: action not allowed", () => {
  it("rejects approve action on interaction token", async () => {
    const deps = makeDeps({
      tokenRecord: { allowedActions: ["accept", "reject"] },
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "approve", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "不允许的操作" } });
  });
});

describe("interaction callback: identity mismatch", () => {
  it("rejects when interaction companyId does not match token company", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ companyId: "co-OTHER" }),
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "确认请求身份校验失败" } });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });

  it("rejects when interaction kind is not request_confirmation", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ kind: "suggest_tasks" }),
    });
    const handler = new CallbackHandler(deps);
    const event = makeEvent({ action: "accept", token: "tok", approval_id: RESOURCE_KEY });

    const result = await handler.handle(event);

    expect(result).toEqual({ toast: { type: "info", content: "确认请求身份校验失败" } });
    expect(deps.paperclip.acceptInteraction).not.toHaveBeenCalled();
  });
});
