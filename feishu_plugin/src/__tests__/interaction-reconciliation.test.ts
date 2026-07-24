import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Reconciliation } from "../approvals/reconciliation.js";
import type { ReconciliationDeps } from "../approvals/reconciliation.js";
import type { PaperclipInteraction, BridgeConfig } from "../types.js";

function makeConfig(): BridgeConfig {
  return {
    paperclipBaseUrl: "http://localhost:3100",
    paperclipApiKey: "key",
    paperclipPublicUrl: "http://localhost:3100",
    feishuAppId: "app",
    feishuAppSecret: "secret",
    pollIntervalMs: 5000,
    reconciliationIntervalMs: 100,
    scanConcurrency: 2,
    requestTimeoutMs: 5000,
    sqlitePath: ":memory:",
    actionTokenTtlMs: 86400000,
    adminPort: 9090,
    documentTunnelAutoStart: false,
    companies: [{ companyId: "co-1", defaultApprovers: [], routing: {} }],
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
  activeDeliveries?: Array<Record<string, unknown>>;
  interaction?: PaperclipInteraction | null;
  feishuClient?: { updateInteractiveCard: ReturnType<typeof vi.fn> } | null;
} = {}): ReconciliationDeps {
  const deliveries = overrides.activeDeliveries ?? [{
    approvalId: "interaction:issue-1:int-1",
    companyId: "co-1",
    approvalType: "request_confirmation",
    approvalStatus: "pending",
    approvalUpdatedAt: "2026-01-01T00:00:00Z",
    payloadHash: "9947ccccb8a2ebf23b34a6a1e2e2417a4b62d57ce16ace22b643b74c963f3a4d",
    messageId: "om_msg_1",
  }];

  const interaction = overrides.interaction !== undefined ? overrides.interaction : makeInteraction();

  const feishuClient = overrides.feishuClient !== undefined
    ? overrides.feishuClient
    : { updateInteractiveCard: vi.fn().mockResolvedValue(undefined) };

  return {
    config: makeConfig(),
    paperclip: {
      findInteraction: vi.fn().mockResolvedValue(interaction),
      getApproval: vi.fn(),
    } as never,
    feishuRegistry: {
      getForCompany: vi.fn().mockReturnValue(feishuClient),
    } as never,
    tokenService: {
      invalidateByApproval: vi.fn(),
    } as never,
    deliveryRepo: {
      findActivePending: vi.fn().mockReturnValue(deliveries),
      setStatus: vi.fn(),
      supersedeByApproval: vi.fn(),
    } as never,
  };
}

describe("interaction reconciliation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("supersedes deliveries when interaction is accepted and all cards updated", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "accepted", updatedAt: "2026-01-02T00:00:00Z" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.tokenService.invalidateByApproval).toHaveBeenCalledWith("interaction:issue-1:int-1");
    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    expect(feishu.updateInteractiveCard).toHaveBeenCalledWith("om_msg_1", expect.any(String));
  });

  it("does NOT supersede when card update fails", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "accepted" }),
      feishuClient: {
        updateInteractiveCard: vi.fn().mockRejectedValue(new Error("feishu 500")),
      },
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.tokenService.invalidateByApproval).toHaveBeenCalledWith("interaction:issue-1:int-1");
    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();
  });

  it("does NOT supersede when feishu client is unavailable", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "rejected" }),
      feishuClient: null,
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();
  });

  it("does NOT supersede when partial card update fails (multiple recipients)", async () => {
    const updateFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("timeout"));
    const deps = makeDeps({
      activeDeliveries: [
        {
          approvalId: "interaction:issue-1:int-1",
          companyId: "co-1",
          approvalType: "request_confirmation",
          approvalStatus: "pending",
          approvalUpdatedAt: "2026-01-01T00:00:00Z",
          payloadHash: "9947ccccb8a2ebf23b34a6a1e2e2417a4b62d57ce16ace22b643b74c963f3a4d",
          messageId: "om_msg_1",
        },
        {
          approvalId: "interaction:issue-1:int-1",
          companyId: "co-1",
          approvalType: "request_confirmation",
          approvalStatus: "pending",
          approvalUpdatedAt: "2026-01-01T00:00:00Z",
          payloadHash: "9947ccccb8a2ebf23b34a6a1e2e2417a4b62d57ce16ace22b643b74c963f3a4d",
          messageId: "om_msg_2",
        },
      ],
      interaction: makeInteraction({ status: "accepted" }),
      feishuClient: { updateInteractiveCard: updateFn },
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    // Both cards attempted
    expect(updateFn).toHaveBeenCalledTimes(2);
    // NOT superseded because one failed
    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();
  });

  it("supersedes on next cycle when previously failed card now succeeds", async () => {
    const updateFn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(undefined);
    const deps = makeDeps({
      interaction: makeInteraction({ status: "accepted" }),
      feishuClient: { updateInteractiveCard: updateFn },
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();

    // First cycle: fails
    await vi.advanceTimersByTimeAsync(150);
    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();

    // Second cycle: succeeds
    await vi.advanceTimersByTimeAsync(150);
    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
    reconciliation.stop();
  });

  it("supersedes deliveries when interaction is expired", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "expired" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
  });

  it("supersedes deliveries when interaction is cancelled", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "cancelled" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
  });

  it("supersedes deliveries when interaction is failed", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "failed" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
  });

  it("supersedes old deliveries on version change while still pending", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ updatedAt: "2026-02-01T00:00:00Z" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.supersedeByApproval).toHaveBeenCalledWith(
      "interaction:issue-1:int-1",
      expect.objectContaining({ approvalUpdatedAt: "2026-02-01T00:00:00Z" }),
    );
    expect(deps.tokenService.invalidateByApproval).toHaveBeenCalledWith(
      "interaction:issue-1:int-1",
      expect.objectContaining({ approvalUpdatedAt: "2026-02-01T00:00:00Z" }),
    );
  });

  it("does nothing when interaction is still pending with same version", async () => {
    const deps = makeDeps({ interaction: makeInteraction() });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();
    expect(deps.deliveryRepo.supersedeByApproval).not.toHaveBeenCalled();
  });

  it("supersedes when interaction not found (deleted)", async () => {
    const deps = makeDeps({ interaction: null });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
    expect(deps.tokenService.invalidateByApproval).toHaveBeenCalledWith("interaction:issue-1:int-1");
  });

  it("handles multiple recipients: all updated successfully", async () => {
    const deps = makeDeps({
      activeDeliveries: [
        {
          approvalId: "interaction:issue-1:int-1",
          companyId: "co-1",
          approvalType: "request_confirmation",
          approvalStatus: "pending",
          approvalUpdatedAt: "2026-01-01T00:00:00Z",
          payloadHash: "9947ccccb8a2ebf23b34a6a1e2e2417a4b62d57ce16ace22b643b74c963f3a4d",
          messageId: "om_msg_1",
        },
        {
          approvalId: "interaction:issue-1:int-1",
          companyId: "co-1",
          approvalType: "request_confirmation",
          approvalStatus: "pending",
          approvalUpdatedAt: "2026-01-01T00:00:00Z",
          payloadHash: "9947ccccb8a2ebf23b34a6a1e2e2417a4b62d57ce16ace22b643b74c963f3a4d",
          messageId: "om_msg_2",
        },
      ],
      interaction: makeInteraction({ status: "rejected" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    expect(feishu.updateInteractiveCard).toHaveBeenCalledTimes(2);
    expect(deps.deliveryRepo.setStatus).toHaveBeenCalledWith("interaction:issue-1:int-1", "superseded");
  });

  it("skips when interaction identity mismatches resource key", async () => {
    const deps = makeDeps({
      interaction: makeInteraction({ status: "accepted", companyId: "co-OTHER" }),
    });
    const reconciliation = new Reconciliation(deps);
    reconciliation.start();
    await vi.advanceTimersByTimeAsync(150);
    reconciliation.stop();

    // Should NOT supersede or update cards due to identity mismatch
    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();
    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    expect(feishu.updateInteractiveCard).not.toHaveBeenCalled();
  });
});
