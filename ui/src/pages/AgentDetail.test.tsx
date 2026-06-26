// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HeartbeatRun } from "@paperclipai/shared";
import { LatestRunCard } from "./AgentDetail";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@codesandbox/sandpack-react", () => ({}));

vi.mock("@/lib/router", async () => {
  const actual = await vi.importActual<typeof import("@/lib/router")>("@/lib/router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: React.ReactNode; to: string } & React.ComponentProps<"a">) => (
      <a href={to} {...props}>{children}</a>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../components/MarkdownEditor", () => ({
  MarkdownEditor: () => null,
}));

vi.mock("../components/MarkdownBody", () => ({
  MarkdownBody: ({ children, className }: { children: string; className?: string }) => (
    <div className={className}>
      {children}
      <a href="/CMPA/issues/CMPA-5">CMPA-5</a>
    </div>
  ),
}));

function createRun(overrides: Partial<HeartbeatRun> = {}): HeartbeatRun {
  const now = new Date("2026-06-26T00:00:00Z");
  return {
    id: "fb510a20-d66a-4280-a566-fa16dcf59ec6",
    companyId: "company-1",
    agentId: "agent-1",
    invocationSource: "timer",
    triggerDetail: null,
    status: "succeeded",
    startedAt: now,
    finishedAt: now,
    error: null,
    wakeupRequestId: null,
    exitCode: 0,
    signal: null,
    usageJson: null,
    resultJson: { summary: "Fixed task CMPA-5." },
    sessionIdBefore: null,
    sessionIdAfter: null,
    logStore: null,
    logRef: null,
    logBytes: null,
    logSha256: null,
    logCompressed: false,
    stdoutExcerpt: null,
    stderrExcerpt: null,
    errorCode: null,
    externalRunId: null,
    processPid: null,
    processGroupId: null,
    processStartedAt: null,
    lastOutputAt: null,
    lastOutputSeq: 0,
    lastOutputStream: null,
    lastOutputBytes: null,
    retryOfRunId: null,
    processLossRetryCount: 0,
    scheduledRetryAt: null,
    scheduledRetryAttempt: 0,
    scheduledRetryReason: null,
    retryExhaustedReason: null,
    livenessState: null,
    livenessReason: null,
    continuationAttempt: 0,
    lastUsefulActionAt: null,
    nextAction: null,
    contextSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("LatestRunCard", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/CMPA/agents/cto/dashboard");
  });

  it("can rerender from no runs to a latest run without changing hook order", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(<LatestRunCard runs={[]} agentId="cto" />);
      });
      act(() => {
        root.render(<LatestRunCard runs={[createRun()]} agentId="cto" />);
      });
    }).not.toThrow();

    expect(container.textContent).toContain("CMPA-5");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not wrap markdown issue links in another anchor", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<LatestRunCard runs={[createRun()]} agentId="cto" />);
    });

    expect(container.querySelectorAll("a a")).toHaveLength(0);
    expect(container.querySelector('a[href="/CMPA/issues/CMPA-5"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
