import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PreviewTokenService } from "../tunnel/preview-token.js";
import { DocumentPreviewServer } from "../tunnel/document-preview-server.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { PaperclipDocumentRevision } from "../types.js";

const SECRET = Buffer.from("preview-server-test-secret-32b!");
const BASE_TIME = 1_700_000_000_000;

const REVISION: PaperclipDocumentRevision = {
  id: "rev-1",
  companyId: "co-1",
  documentId: "doc-1",
  issueId: "iss-1",
  key: "plan",
  revisionNumber: 3,
  title: "Test Plan <script>",
  format: "markdown",
  body: "# Hello\n<script>alert(1)</script>",
  changeSummary: "initial & draft",
  createdByAgentId: "agent-1",
  createdByUserId: null,
  createdAt: "2025-01-01T00:00:00Z",
};

function makeTokenService() {
  return new PreviewTokenService({ ttlMs: 60_000, secret: SECRET, now: () => BASE_TIME });
}

function makeMockClient(revisions?: PaperclipDocumentRevision[]): PaperclipClient {
  return {
    listIssueDocumentRevisions: vi.fn().mockResolvedValue(revisions ?? [REVISION]),
  } as unknown as PaperclipClient;
}

async function fetchPreview(port: number, path: string, method = "GET") {
  return fetch(`http://127.0.0.1:${port}${path}`, { method });
}

describe("DocumentPreviewServer", () => {
  let server: DocumentPreviewServer;
  let port: number;
  let tokenService: PreviewTokenService;

  beforeEach(async () => {
    tokenService = makeTokenService();
  });

  afterEach(async () => {
    await server?.stop();
  });

  async function startServer(client?: PaperclipClient) {
    server = new DocumentPreviewServer({
      tokenService,
      client: client ?? makeMockClient(),
    });
    const result = await server.start();
    port = result.port;
  }

  it("serves a valid revision as escaped HTML", async () => {
    await startServer();
    const token = tokenService.generate({
      companyId: "co-1",
      issueId: "iss-1",
      key: "plan",
      revisionId: "rev-1",
    });
    const res = await fetchPreview(port, `/preview/document?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Test Plan &lt;script&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("initial &amp; draft");
    expect(html).toContain("Revision #3");
    // Security headers
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns 404 for unknown path", async () => {
    await startServer();
    const res = await fetchPreview(port, "/unknown");
    expect(res.status).toBe(404);
  });

  it("returns 405 for POST", async () => {
    await startServer();
    const res = await fetchPreview(port, "/preview/document?token=x", "POST");
    expect(res.status).toBe(405);
  });

  it("returns 403 for missing token", async () => {
    await startServer();
    const res = await fetchPreview(port, "/preview/document");
    expect(res.status).toBe(403);
  });

  it("returns 403 for invalid signature", async () => {
    await startServer();
    const res = await fetchPreview(port, "/preview/document?token=bad.token");
    expect(res.status).toBe(403);
  });

  it("returns 403 for expired token", async () => {
    let clock = BASE_TIME;
    const expiringService = new PreviewTokenService({ ttlMs: 1000, secret: SECRET, now: () => clock });
    const token = expiringService.generate({
      companyId: "co-1",
      issueId: "iss-1",
      key: "plan",
      revisionId: "rev-1",
    });
    clock = BASE_TIME + 2000;
    server = new DocumentPreviewServer({
      tokenService: expiringService,
      client: makeMockClient(),
    });
    const result = await server.start();
    port = result.port;
    const res = await fetchPreview(port, `/preview/document?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("expired");
  });

  it("returns 502 when upstream client throws", async () => {
    const failClient = {
      listIssueDocumentRevisions: vi.fn().mockRejectedValue(new Error("network")),
    } as unknown as PaperclipClient;
    await startServer(failClient);
    const token = tokenService.generate({
      companyId: "co-1",
      issueId: "iss-1",
      key: "plan",
      revisionId: "rev-1",
    });
    const res = await fetchPreview(port, `/preview/document?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(502);
  });

  it("returns 404 when revision not found in list", async () => {
    await startServer(makeMockClient([]));
    const token = tokenService.generate({
      companyId: "co-1",
      issueId: "iss-1",
      key: "plan",
      revisionId: "rev-missing",
    });
    const res = await fetchPreview(port, `/preview/document?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when companyId mismatches", async () => {
    await startServer(makeMockClient([{ ...REVISION, companyId: "co-other" }]));
    const token = tokenService.generate({
      companyId: "co-1",
      issueId: "iss-1",
      key: "plan",
      revisionId: "rev-1",
    });
    const res = await fetchPreview(port, `/preview/document?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(404);
  });

  it("stop is idempotent", async () => {
    await startServer();
    await server.stop();
    await server.stop(); // should not throw
  });

  it("renders key as title when revision title is null", async () => {
    const nullTitleRev: PaperclipDocumentRevision = { ...REVISION, title: null };
    await startServer(makeMockClient([nullTitleRev]));
    const token = tokenService.generate({
      companyId: "co-1",
      issueId: "iss-1",
      key: "plan",
      revisionId: "rev-1",
    });
    const res = await fetchPreview(port, `/preview/document?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>plan</title>");
    expect(html).toContain("<h1>plan</h1>");
  });
});
