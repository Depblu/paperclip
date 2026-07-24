import { describe, it, expect, vi } from "vitest";
import { PendingInteractionCardRefresher } from "../tunnel/pending-interaction-card-refresher.js";
import { buildVersionSnapshot } from "../approvals/action-token.js";
import type { DeliveryRecord, PaperclipInteraction, PaperclipIssue } from "../types.js";
import { logger } from "../observability/logger.js";

const DOC_URL = "https://abc-123.trycloudflare.com/preview/document?token=signed";

function makeInteraction(overrides: Partial<PaperclipInteraction> = {}): PaperclipInteraction {
  return {
    id: "int-1",
    companyId: "co-1",
    issueId: "issue-1",
    kind: "request_confirmation",
    status: "pending",
    payload: { prompt: "Confirm?", target: { type: "issue_document", key: "plan", revisionId: "rev-1" } },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDelivery(interaction: PaperclipInteraction, overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  const version = buildVersionSnapshot(interaction.updatedAt, interaction.payload);
  return {
    id: 1,
    approvalId: `interaction:${interaction.issueId}:${interaction.id}`,
    companyId: interaction.companyId,
    approvalType: "request_confirmation",
    approvalStatus: "pending",
    approvalUpdatedAt: version.approvalUpdatedAt,
    payloadHash: version.payloadHash,
    feishuTenantKey: "",
    recipientOpenId: "ou-1",
    recipientName: "审批人",
    messageId: "om_msg_1",
    cardId: null,
    deliveryStatus: "sent",
    attemptCount: 1,
    lastError: null,
    lastAttemptAt: null,
    sentAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

interface DepsOptions {
  deliveries: DeliveryRecord[];
  interaction?: PaperclipInteraction | null;
  issue?: PaperclipIssue;
  feishu?: { updateInteractiveCard: ReturnType<typeof vi.fn> } | null;
  buildLink?: (interaction: PaperclipInteraction, expected: { companyId: string; issueId: string }) => string | null;
}

function makeDeps(opts: DepsOptions) {
  const defaultFeishu = { updateInteractiveCard: vi.fn().mockResolvedValue(undefined) };
  return {
    paperclip: {
      findInteraction: vi.fn().mockResolvedValue(
        opts.interaction === undefined ? makeInteraction() : opts.interaction,
      ),
      getIssue: vi.fn().mockResolvedValue(opts.issue ?? { id: "issue-1", title: "Deploy", identifier: "CPCA-11" }),
    },
    feishuRegistry: {
      getForCompany: vi.fn().mockReturnValue(opts.feishu === undefined ? defaultFeishu : opts.feishu),
    },
    tokenService: {
      generate: vi.fn().mockReturnValue("new-tok"),
      invalidate: vi.fn(),
      consume: vi.fn(),
      invalidateByApproval: vi.fn(),
    },
    deliveryRepo: {
      findActivePending: vi.fn().mockReturnValue(opts.deliveries),
      upsert: vi.fn(),
      setStatus: vi.fn(),
    },
    previewLinkService: opts.buildLink ? { buildLink: vi.fn(opts.buildLink) } : undefined,
  };
}

describe("PendingInteractionCardRefresher", () => {
  it("updates an eligible pending confirmation card and mints a fresh token", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction);
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    const result = await refresher.refreshAll();

    expect(result).toEqual({ updated: 1, failed: 0, skipped: 0 });
    expect(deps.tokenService.generate).toHaveBeenCalledWith(
      "interaction:issue-1:int-1",
      "co-1",
      "ou-1",
      ["accept", "reject"],
      expect.any(Object),
    );
    const feishu = deps.feishuRegistry.getForCompany("co-1");
    expect(feishu!.updateInteractiveCard).toHaveBeenCalledTimes(1);
    expect(feishu!.updateInteractiveCard.mock.calls[0][0]).toBe("om_msg_1");
  });

  it("passes documentUrl from previewLinkService into the rendered card", async () => {
    const interaction = makeInteraction({
      payload: {
        prompt: "Confirm?",
        detailsMarkdown: "请看 [查看文档](#document-plan)",
        target: { type: "issue_document", key: "plan", revisionId: "rev-1" },
      },
    });
    const delivery = makeDelivery(interaction);
    const deps = makeDeps({ deliveries: [delivery], interaction, buildLink: () => DOC_URL });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    await refresher.refreshAll();

    const feishu = deps.feishuRegistry.getForCompany("co-1");
    const cardJson = feishu!.updateInteractiveCard.mock.calls[0][1] as string;
    expect(cardJson).toContain(DOC_URL);
    expect(deps.previewLinkService!.buildLink).toHaveBeenCalledWith(
      interaction,
      { companyId: "co-1", issueId: "issue-1" },
    );
  });

  it("filters out non-request_confirmation deliveries without counting them", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction, { approvalType: "hire_agent" });
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    const result = await refresher.refreshAll();

    expect(result).toEqual({ updated: 0, failed: 0, skipped: 0 });
    expect(deps.paperclip.findInteraction).not.toHaveBeenCalled();
  });

  it("skips when interaction is no longer pending", async () => {
    const interaction = makeInteraction({ status: "accepted" });
    const delivery = makeDelivery(interaction);
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it("skips on identity mismatch", async () => {
    const interaction = makeInteraction({ companyId: "co-OTHER" });
    const delivery = makeDelivery(makeInteraction());
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it("skips when delivery version does not match current interaction version", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction, { payloadHash: "stale-hash" });
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it("skips records without a messageId", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction, { messageId: null });
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it("skips records when no feishu client is available", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction);
    const deps = makeDeps({ deliveries: [delivery], interaction, feishu: null });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it("counts failed when card update throws and continues", async () => {
    const interaction = makeInteraction();
    const d1 = makeDelivery(interaction, { id: 1, recipientOpenId: "ou-1", messageId: "om_1" });
    const d2 = makeDelivery(interaction, { id: 2, recipientOpenId: "ou-2", messageId: "om_2" });
    const feishu = {
      updateInteractiveCard: vi.fn()
        .mockRejectedValueOnce(new Error("feishu down"))
        .mockResolvedValueOnce(undefined),
    };
    const deps = makeDeps({ deliveries: [d1, d2], interaction, feishu });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 1, failed: 1, skipped: 0 });
  });

  it("skips the whole group when interaction is not found", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction);
    const deps = makeDeps({ deliveries: [delivery], interaction: null });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it("fetches interaction once per resource key for multiple recipients", async () => {
    const interaction = makeInteraction();
    const d1 = makeDelivery(interaction, { id: 1, recipientOpenId: "ou-1", messageId: "om_1" });
    const d2 = makeDelivery(interaction, { id: 2, recipientOpenId: "ou-2", messageId: "om_2" });
    const deps = makeDeps({ deliveries: [d1, d2], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 2, failed: 0, skipped: 0 });
    expect(deps.paperclip.findInteraction).toHaveBeenCalledTimes(1);
    expect(deps.tokenService.generate).toHaveBeenCalledTimes(2);
  });

  it("never mutates deliveries or invalidates/consumes existing tokens", async () => {
    const interaction = makeInteraction();
    const delivery = makeDelivery(interaction);
    const deps = makeDeps({ deliveries: [delivery], interaction });
    const refresher = new PendingInteractionCardRefresher(deps as never);

    await refresher.refreshAll();

    expect(deps.deliveryRepo.upsert).not.toHaveBeenCalled();
    expect(deps.deliveryRepo.setStatus).not.toHaveBeenCalled();
    expect(deps.tokenService.invalidate).not.toHaveBeenCalled();
    expect(deps.tokenService.consume).not.toHaveBeenCalled();
    expect(deps.tokenService.invalidateByApproval).not.toHaveBeenCalled();
  });

  it("counts failed for all deliveries when findInteraction throws and logs once", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const interaction = makeInteraction();
    const d1 = makeDelivery(interaction, { id: 1, recipientOpenId: "ou-1", messageId: "om_1" });
    const d2 = makeDelivery(interaction, { id: 2, recipientOpenId: "ou-2", messageId: "om_2" });
    const deps = makeDeps({ deliveries: [d1, d2], interaction });
    deps.paperclip.findInteraction.mockRejectedValue(new Error("paperclip down"));
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 2, skipped: 0 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "pending interaction card refresh failed",
      expect.objectContaining({
        resourceKey: "interaction:issue-1:int-1",
        error: expect.stringContaining("paperclip down"),
      }),
    );
    warnSpy.mockRestore();
  });

  it("counts failed for all deliveries when getIssue throws and logs once", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const interaction = makeInteraction();
    const d1 = makeDelivery(interaction, { id: 1, recipientOpenId: "ou-1", messageId: "om_1" });
    const d2 = makeDelivery(interaction, { id: 2, recipientOpenId: "ou-2", messageId: "om_2" });
    const deps = makeDeps({ deliveries: [d1, d2], interaction });
    deps.paperclip.getIssue.mockRejectedValue(new Error("issue fetch failed"));
    const refresher = new PendingInteractionCardRefresher(deps as never);

    expect(await refresher.refreshAll()).toEqual({ updated: 0, failed: 2, skipped: 0 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "pending interaction card refresh failed",
      expect.objectContaining({
        resourceKey: "interaction:issue-1:int-1",
        error: expect.stringContaining("issue fetch failed"),
      }),
    );
    warnSpy.mockRestore();
  });
});
