import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InteractionPoller } from "../paperclip/interaction-poller.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { BridgeConfig, PaperclipInteraction, PaperclipIssueListItem } from "../types.js";

function makeConfig(): BridgeConfig {
  return {
    paperclipBaseUrl: "http://localhost:3100",
    paperclipApiKey: "key",
    paperclipPublicUrl: "http://localhost:3100",
    feishuAppId: "app",
    feishuAppSecret: "secret",
    pollIntervalMs: 100,
    reconciliationIntervalMs: 60000,
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

describe("InteractionPoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("discovers pending request_confirmation interactions across paginated issues", async () => {
    const discovered: Array<{ interaction: PaperclipInteraction; companyId: string; issue: PaperclipIssueListItem }> = [];
    const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `issue-${i}`, title: `I${i}`, identifier: `T-${i}` }));
    const client = {
      listCompanyIssues: vi.fn()
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce([{ id: "issue-50", title: "Last", identifier: "T-50" }]),
      listIssueInteractions: vi.fn().mockImplementation(async (issueId: string) => {
        if (issueId === "issue-0") return [makeInteraction({ id: "int-1", issueId: "issue-0" })];
        if (issueId === "issue-50") return [makeInteraction({ id: "int-2", issueId: "issue-50" })];
        if (issueId === "issue-1") return [makeInteraction({ id: "int-3", issueId: "issue-1", status: "accepted" })];
        return [];
      }),
    } as unknown as PaperclipClient;

    const poller = new InteractionPoller(makeConfig(), client, async (interaction, companyId, issue) => {
      discovered.push({ interaction, companyId, issue });
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(150);
    poller.stop();

    expect(discovered).toHaveLength(2);
    expect(discovered[0].interaction.id).toBe("int-1");
    expect(discovered[1].interaction.id).toBe("int-2");
    expect(discovered[0].companyId).toBe("co-1");
    // Issue metadata is passed through
    expect(discovered[0].issue.identifier).toBe("T-0");
    expect(discovered[1].issue.identifier).toBe("T-50");
  });

  it("filters out non-request_confirmation kinds", async () => {
    const discovered: PaperclipInteraction[] = [];
    const client = {
      listCompanyIssues: vi.fn().mockResolvedValue([{ id: "issue-1", title: "A" }]),
      listIssueInteractions: vi.fn().mockResolvedValue([
        makeInteraction({ id: "int-1", kind: "suggest_tasks" }),
        makeInteraction({ id: "int-2", kind: "ask_user_questions" }),
        makeInteraction({ id: "int-3", kind: "request_confirmation" }),
      ]),
    } as unknown as PaperclipClient;

    const poller = new InteractionPoller(makeConfig(), client, async (interaction) => {
      discovered.push(interaction);
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(150);
    poller.stop();

    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe("int-3");
  });

  it("handles pagination: stops when page is smaller than page size", async () => {
    const client = {
      listCompanyIssues: vi.fn()
        .mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ id: `issue-${i}`, title: `I${i}` })))
        .mockResolvedValueOnce([{ id: "issue-50", title: "Last" }]),
      listIssueInteractions: vi.fn().mockResolvedValue([]),
    } as unknown as PaperclipClient;

    const poller = new InteractionPoller(makeConfig(), client, async () => {});
    poller.start();
    await vi.advanceTimersByTimeAsync(150);
    poller.stop();

    expect(client.listCompanyIssues).toHaveBeenCalledTimes(2);
  });

  it("does not re-enter while already running", async () => {
    let resolveFirst!: (value: { id: string; title: string }[]) => void;
    const firstPoll = new Promise<{ id: string; title: string }[]>((r) => { resolveFirst = r; });
    const client = {
      listCompanyIssues: vi.fn().mockImplementation(() => firstPoll),
      listIssueInteractions: vi.fn().mockResolvedValue([]),
    } as unknown as PaperclipClient;

    const poller = new InteractionPoller(makeConfig(), client, async () => {});
    poller.start();
    await vi.advanceTimersByTimeAsync(150);
    // Second tick fires while first is still running
    await vi.advanceTimersByTimeAsync(150);
    resolveFirst([]);
    await vi.advanceTimersByTimeAsync(50);
    poller.stop();

    // listCompanyIssues called once per poll cycle that actually ran
    expect(client.listCompanyIssues).toHaveBeenCalledTimes(1);
  });
});
