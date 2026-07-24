import { describe, it, expect } from "vitest";
import { DocumentPreviewLinkService } from "../tunnel/document-preview-link.js";
import type { TunnelStatusProvider } from "../tunnel/document-preview-link.js";
import { PreviewTokenService } from "../tunnel/preview-token.js";
import type { PaperclipInteraction, TunnelStatus } from "../types.js";

const SECRET = Buffer.from("document-preview-link-test-32b!");
const TUNNEL_URL = "https://abc-123.trycloudflare.com";

function makeTokenService() {
  return new PreviewTokenService({ ttlMs: 60_000, secret: SECRET, now: () => 1_700_000_000_000 });
}

function makeManager(status: TunnelStatus): TunnelStatusProvider {
  return { getStatus: () => status };
}

function runningManager(url: string | null = TUNNEL_URL): TunnelStatusProvider {
  return makeManager({ state: "running", url, startedAt: "2026-01-01T00:00:00Z", error: null });
}

function makeInteraction(overrides: Partial<PaperclipInteraction> = {}): PaperclipInteraction {
  return {
    id: "int-1",
    companyId: "co-1",
    issueId: "issue-1",
    kind: "request_confirmation",
    status: "pending",
    payload: {
      prompt: "Confirm?",
      target: { type: "issue_document", label: "plan.md", key: "plan", revisionId: "rev-1", revisionNumber: 2 },
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const EXPECTED = { companyId: "co-1", issueId: "issue-1" };

function extractToken(link: string): string {
  const idx = link.indexOf("token=");
  return decodeURIComponent(link.slice(idx + "token=".length));
}

describe("DocumentPreviewLinkService.buildLink", () => {
  it("returns a signed preview link when eligible", () => {
    const tokenService = makeTokenService();
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService });
    const link = svc.buildLink(makeInteraction(), EXPECTED);

    expect(link).not.toBeNull();
    expect(link!.startsWith(`${TUNNEL_URL}/preview/document?token=`)).toBe(true);

    const result = tokenService.verify(extractToken(link!));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.companyId).toBe("co-1");
      expect(result.payload.issueId).toBe("issue-1");
      expect(result.payload.key).toBe("plan");
      expect(result.payload.revisionId).toBe("rev-1");
    }
  });

  it("returns null when kind is not request_confirmation", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    expect(svc.buildLink(makeInteraction({ kind: "ask_user_questions" }), EXPECTED)).toBeNull();
  });

  it("returns null on companyId mismatch", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    expect(svc.buildLink(makeInteraction(), { companyId: "co-OTHER", issueId: "issue-1" })).toBeNull();
  });

  it("returns null on issueId mismatch", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    expect(svc.buildLink(makeInteraction(), { companyId: "co-1", issueId: "issue-OTHER" })).toBeNull();
  });

  it("returns null when target is missing or not an object", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    expect(svc.buildLink(makeInteraction({ payload: { prompt: "x" } }), EXPECTED)).toBeNull();
    expect(svc.buildLink(makeInteraction({ payload: { target: "plan" } }), EXPECTED)).toBeNull();
    expect(svc.buildLink(makeInteraction({ payload: { target: ["a"] } }), EXPECTED)).toBeNull();
  });

  it("returns null when target.type is not issue_document", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    const interaction = makeInteraction({ payload: { target: { type: "issue", key: "plan", revisionId: "rev-1" } } });
    expect(svc.buildLink(interaction, EXPECTED)).toBeNull();
  });

  it("returns null when key or revisionId is empty/missing", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    expect(svc.buildLink(makeInteraction({ payload: { target: { type: "issue_document", revisionId: "rev-1" } } }), EXPECTED)).toBeNull();
    expect(svc.buildLink(makeInteraction({ payload: { target: { type: "issue_document", key: "", revisionId: "rev-1" } } }), EXPECTED)).toBeNull();
    expect(svc.buildLink(makeInteraction({ payload: { target: { type: "issue_document", key: "plan" } } }), EXPECTED)).toBeNull();
    expect(svc.buildLink(makeInteraction({ payload: { target: { type: "issue_document", key: "plan", revisionId: "" } } }), EXPECTED)).toBeNull();
  });

  it("returns null when tunnel is not running", () => {
    const svc = new DocumentPreviewLinkService({
      tunnelManager: makeManager({ state: "stopped", url: null, startedAt: null, error: null }),
      tokenService: makeTokenService(),
    });
    expect(svc.buildLink(makeInteraction(), EXPECTED)).toBeNull();
  });

  it("returns null when tunnel url is not an https trycloudflare url", () => {
    const tokenService = makeTokenService();
    const httpSvc = new DocumentPreviewLinkService({ tunnelManager: runningManager("http://abc.trycloudflare.com"), tokenService });
    expect(httpSvc.buildLink(makeInteraction(), EXPECTED)).toBeNull();

    const otherSvc = new DocumentPreviewLinkService({ tunnelManager: runningManager("https://example.com"), tokenService });
    expect(otherSvc.buildLink(makeInteraction(), EXPECTED)).toBeNull();

    const nullUrlSvc = new DocumentPreviewLinkService({ tunnelManager: runningManager(null), tokenService });
    expect(nullUrlSvc.buildLink(makeInteraction(), EXPECTED)).toBeNull();
  });

  it("returns null when key or revisionId is only whitespace", () => {
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService: makeTokenService() });
    expect(svc.buildLink(makeInteraction({ payload: { target: { type: "issue_document", key: "   ", revisionId: "rev-1" } } }), EXPECTED)).toBeNull();
    expect(svc.buildLink(makeInteraction({ payload: { target: { type: "issue_document", key: "plan", revisionId: "  " } } }), EXPECTED)).toBeNull();
  });

  it("trims surrounding whitespace from key and revisionId into the token payload", () => {
    const tokenService = makeTokenService();
    const svc = new DocumentPreviewLinkService({ tunnelManager: runningManager(), tokenService });
    const interaction = makeInteraction({
      payload: { target: { type: "issue_document", label: "plan.md", key: "  plan  ", revisionId: "  rev-1  " } },
    });
    const link = svc.buildLink(interaction, EXPECTED);
    expect(link).not.toBeNull();
    const result = tokenService.verify(extractToken(link!));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.key).toBe("plan");
      expect(result.payload.revisionId).toBe("rev-1");
    }
  });
});
