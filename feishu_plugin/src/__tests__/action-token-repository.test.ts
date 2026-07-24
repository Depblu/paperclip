import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "../storage/database.js";
import { ActionTokenRepository, DeliveryRepository } from "../storage/repositories.js";
import { ActionTokenService, buildVersionSnapshot } from "../approvals/action-token.js";
import type { DeliveryRecord } from "../types.js";

describe("ActionTokenRepository (real SQLite)", () => {
  let db: Database.Database;
  let repo: ActionTokenRepository;
  let service: ActionTokenService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new ActionTokenRepository(db);
    service = new ActionTokenService(repo, 86400000);
  });

  afterEach(() => {
    db.close();
  });

  it("generate→validate restores approvalId/companyId/recipient/allowedActions/version", () => {
    const version = buildVersionSnapshot("2026-01-01T00:00:00Z", { version: 1, prompt: "Confirm?" });
    const token = service.generate(
      "interaction:issue-1:int-1",
      "co-1",
      "ou_operator",
      ["accept", "reject"],
      version,
    );

    const result = service.validate(token);

    expect(result.valid).toBe(true);
    expect(result.record).toEqual({
      approvalId: "interaction:issue-1:int-1",
      companyId: "co-1",
      recipientOpenId: "ou_operator",
      allowedActions: ["accept", "reject"],
      version,
    });
  });

  it("validate returns invalid for unknown token", () => {
    const result = service.validate("does-not-exist");
    expect(result.valid).toBe(false);
  });

  it("consume makes token invalid", () => {
    const version = buildVersionSnapshot("2026-01-01T00:00:00Z", { a: 1 });
    const token = service.generate("approval-1", "co-1", "ou_operator", ["approve"], version);
    service.consume(token);
    expect(service.validate(token).valid).toBe(false);
  });
});

describe("DeliveryRepository (real SQLite)", () => {
  let db: Database.Database;
  let repo: DeliveryRepository;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new DeliveryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function makeDelivery(overrides: Partial<Omit<DeliveryRecord, "id" | "updatedAt">> = {}):
    Omit<DeliveryRecord, "id" | "updatedAt"> {
    return {
      approvalId: "interaction:issue-1:int-1",
      companyId: "co-1",
      approvalType: "request_confirmation",
      approvalStatus: "pending",
      approvalUpdatedAt: "2026-01-01T00:00:00Z",
      payloadHash: "hash-1",
      feishuTenantKey: "tenant",
      recipientOpenId: "ou_operator",
      recipientName: "Operator",
      messageId: "om_msg_1",
      cardId: "card-1",
      deliveryStatus: "sent",
      attemptCount: 1,
      lastError: null,
      lastAttemptAt: null,
      sentAt: "2026-01-01T00:00:01Z",
      ...overrides,
    };
  }

  it("findActiveByApproval returns camelCase DeliveryRecord with messageId", () => {
    repo.upsert(makeDelivery());
    const rows = repo.findActiveByApproval("interaction:issue-1:int-1");
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.approvalId).toBe("interaction:issue-1:int-1");
    expect(r.companyId).toBe("co-1");
    expect(r.messageId).toBe("om_msg_1");
    expect(r.recipientOpenId).toBe("ou_operator");
    expect(r.approvalUpdatedAt).toBe("2026-01-01T00:00:00Z");
    expect(r.payloadHash).toBe("hash-1");
    expect(r.deliveryStatus).toBe("sent");
    expect(r.approvalStatus).toBe("pending");
  });

  it("findActivePending returns camelCase records for reconciliation", () => {
    repo.upsert(makeDelivery());
    const rows = repo.findActivePending();
    expect(rows).toHaveLength(1);
    expect(rows[0].approvalId).toBe("interaction:issue-1:int-1");
    expect(rows[0].messageId).toBe("om_msg_1");
    expect(rows[0].approvalUpdatedAt).toBe("2026-01-01T00:00:00Z");
    expect(rows[0].payloadHash).toBe("hash-1");
    expect(rows[0].companyId).toBe("co-1");
    expect(rows[0].approvalType).toBe("request_confirmation");
  });

  it("findPendingOrRetryable returns camelCase records", () => {
    repo.upsert(makeDelivery({ deliveryStatus: "failed", approvalStatus: "pending" }));
    const rows = repo.findPendingOrRetryable();
    expect(rows).toHaveLength(1);
    expect(rows[0].approvalId).toBe("interaction:issue-1:int-1");
    expect(rows[0].messageId).toBe("om_msg_1");
    expect(rows[0].deliveryStatus).toBe("failed");
  });
});
