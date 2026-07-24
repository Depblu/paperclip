import { describe, it, expect, vi } from "vitest";
import { InteractionCoordinator } from "../approvals/interaction-coordinator.js";
import type { InteractionCoordinatorDeps } from "../approvals/interaction-coordinator.js";
import type { PaperclipInteraction, PaperclipIssueListItem, BridgeConfig } from "../types.js";

function makeConfig(): BridgeConfig {
  return {
    paperclipBaseUrl: "http://localhost:3100",
    paperclipApiKey: "key",
    paperclipPublicUrl: "http://localhost:3100",
    feishuAppId: "app",
    feishuAppSecret: "secret",
    pollIntervalMs: 5000,
    reconciliationIntervalMs: 60000,
    scanConcurrency: 2,
    requestTimeoutMs: 5000,
    sqlitePath: ":memory:",
    actionTokenTtlMs: 86400000,
    adminPort: 9090,
    companies: [{
      companyId: "co-1",
      defaultApprovers: [{ openId: "ou-1", name: "审批人" }],
      routing: {
        request_confirmation: {
          approvers: [{ openId: "ou-rc", name: "确认审批人" }],
        },
      },
    }],
  };
}

function makeInteraction(overrides: Partial<PaperclipInteraction> = {}): PaperclipInteraction {
  return {
    id: "int-1",
    companyId: "co-1",
    issueId: "issue-1",
    kind: "request_confirmation",
    status: "pending",
    payload: { version: 1, prompt: "确认部署？", acceptLabel: "部署", rejectLabel: "取消" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeIssue(overrides: Partial<PaperclipIssueListItem> = {}): PaperclipIssueListItem {
  return {
    id: "issue-1",
    title: "Deploy service",
    identifier: "CPCA-11",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<InteractionCoordinatorDeps> = {}): InteractionCoordinatorDeps {
  return {
    config: makeConfig(),
    feishuRegistry: {
      getForCompany: vi.fn().mockReturnValue({
        sendInteractiveCard: vi.fn().mockResolvedValue({ messageId: "om_msg_1" }),
      }),
    } as never,
    tokenService: {
      generate: vi.fn().mockReturnValue("tok-123"),
      invalidateByApproval: vi.fn(),
    } as never,
    deliveryRepo: {
      supersedeByApproval: vi.fn(),
      hasDelivered: vi.fn().mockReturnValue(false),
      upsert: vi.fn(),
    } as never,
    ...overrides,
  };
}

describe("InteractionCoordinator", () => {
  it("delivers card to routing approvers for request_confirmation", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-1", makeIssue());

    expect(deps.deliveryRepo.supersedeByApproval).toHaveBeenCalledWith(
      "interaction:issue-1:int-1",
      expect.any(Object),
    );
    expect(deps.tokenService.generate).toHaveBeenCalledWith(
      "interaction:issue-1:int-1",
      "co-1",
      "ou-rc",
      ["accept", "reject"],
      expect.any(Object),
    );
    expect(deps.deliveryRepo.upsert).toHaveBeenCalledTimes(2); // sending + sent
    const sentCall = (deps.deliveryRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(sentCall.deliveryStatus).toBe("sent");
    expect(sentCall.approvalId).toBe("interaction:issue-1:int-1");
    expect(sentCall.recipientOpenId).toBe("ou-rc");
  });

  it("falls back to defaultApprovers when no routing configured", async () => {
    const config = makeConfig();
    config.companies[0].routing = {};
    const deps = makeDeps({ config });
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-1", makeIssue());

    expect(deps.tokenService.generate).toHaveBeenCalledWith(
      "interaction:issue-1:int-1",
      "co-1",
      "ou-1",
      ["accept", "reject"],
      expect.any(Object),
    );
  });

  it("skips delivery when already delivered for same version", async () => {
    const deps = makeDeps();
    (deps.deliveryRepo.hasDelivered as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-1", makeIssue());

    expect(deps.tokenService.generate).not.toHaveBeenCalled();
    expect(deps.deliveryRepo.upsert).not.toHaveBeenCalled();
  });

  it("skips when company not configured", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-unknown", makeIssue());

    expect(deps.tokenService.generate).not.toHaveBeenCalled();
  });

  it("records failed delivery on feishu error", async () => {
    const deps = makeDeps({
      feishuRegistry: {
        getForCompany: vi.fn().mockReturnValue({
          sendInteractiveCard: vi.fn().mockRejectedValue(new Error("feishu down")),
        }),
      } as never,
    });
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-1", makeIssue());

    const lastCall = (deps.deliveryRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(lastCall.deliveryStatus).toBe("failed");
    expect(lastCall.lastError).toContain("feishu down");
  });

  it("renders card with custom accept/reject labels from payload", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-1", makeIssue());

    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    const cardJson = feishu.sendInteractiveCard.mock.calls[0][1];
    const card = JSON.parse(cardJson);
    const actions = card.elements.find((e: { tag: string }) => e.tag === "action").actions;
    expect(actions[0].text.content).toBe("部署");
    expect(actions[1].text.content).toBe("取消");
  });

  it("renders card with issue identifier and title", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    await coordinator.handleDiscovered(makeInteraction(), "co-1", makeIssue());

    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    const cardJson = feishu.sendInteractiveCard.mock.calls[0][1];
    const card = JSON.parse(cardJson);
    const mdBlock = card.elements.find((e: { tag: string }) => e.tag === "markdown");
    expect(mdBlock.content).toContain("CPCA-11");
    expect(mdBlock.content).toContain("Deploy service");
  });

  it("renders structured target with label, key, revisionNumber", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    const interaction = makeInteraction({
      payload: {
        prompt: "Confirm?",
        target: { label: "config.yaml", key: "cfg-001", revisionNumber: 3 },
      },
    });
    await coordinator.handleDiscovered(interaction, "co-1", makeIssue());

    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    const cardJson = feishu.sendInteractiveCard.mock.calls[0][1];
    const card = JSON.parse(cardJson);
    const mdBlock = card.elements.find((e: { tag: string }) => e.tag === "markdown");
    expect(mdBlock.content).toContain("config.yaml · cfg-001 · rev 3");
  });

  it("rejects interaction with mismatched companyId", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    const interaction = makeInteraction({ companyId: "co-OTHER" });
    await coordinator.handleDiscovered(interaction, "co-1", makeIssue());

    expect(deps.tokenService.generate).not.toHaveBeenCalled();
    expect(deps.deliveryRepo.upsert).not.toHaveBeenCalled();
  });

  it("rejects interaction when interaction.issueId !== issue.id", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    const interaction = makeInteraction({ issueId: "issue-OTHER" });
    await coordinator.handleDiscovered(interaction, "co-1", makeIssue());

    expect(deps.tokenService.generate).not.toHaveBeenCalled();
    expect(deps.deliveryRepo.upsert).not.toHaveBeenCalled();
    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    expect(feishu.sendInteractiveCard).not.toHaveBeenCalled();
  });

  it("rejects when issue.companyId mismatches scanned companyId", async () => {
    const deps = makeDeps();
    const coordinator = new InteractionCoordinator(deps);
    const issue = makeIssue({ companyId: "co-OTHER" });
    await coordinator.handleDiscovered(makeInteraction(), "co-1", issue);

    expect(deps.tokenService.generate).not.toHaveBeenCalled();
    expect(deps.deliveryRepo.upsert).not.toHaveBeenCalled();
    const feishu = (deps.feishuRegistry.getForCompany as ReturnType<typeof vi.fn>)();
    expect(feishu.sendInteractiveCard).not.toHaveBeenCalled();
  });
});
