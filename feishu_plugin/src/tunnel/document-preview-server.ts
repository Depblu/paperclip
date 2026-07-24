import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { PreviewTokenService } from "./preview-token.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { PaperclipDocumentRevision } from "../types.js";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  "Referrer-Policy": "no-referrer",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function renderRevision(rev: PaperclipDocumentRevision): string {
  const displayTitle = rev.title ?? rev.key;
  return [
    "<!DOCTYPE html><html><head>",
    `<title>${escapeHtml(displayTitle)}</title>`,
    "<style>body{font-family:monospace;padding:2rem;max-width:80ch;margin:auto}pre{white-space:pre-wrap}</style>",
    "</head><body>",
    `<h1>${escapeHtml(displayTitle)}</h1>`,
    `<p>Revision #${rev.revisionNumber} &mdash; ${escapeHtml(rev.createdAt)}</p>`,
    rev.changeSummary ? `<p><em>${escapeHtml(rev.changeSummary)}</em></p>` : "",
    `<pre>${escapeHtml(rev.body)}</pre>`,
    "</body></html>",
  ].join("");
}

export interface DocumentPreviewServerDeps {
  tokenService: PreviewTokenService;
  client: PaperclipClient;
}

export class DocumentPreviewServer {
  private server: Server | null = null;
  private deps: DocumentPreviewServerDeps;

  constructor(deps: DocumentPreviewServerDeps) {
    this.deps = deps;
  }

  async start(): Promise<{ port: number }> {
    if (this.server) throw new Error("already started");
    return new Promise((resolve, reject) => {
      const srv = createServer((req, res) => this.handleRequest(req, res));
      srv.on("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("failed to bind"));
          return;
        }
        this.server = srv;
        resolve({ port: addr.port });
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    return new Promise((resolve) => srv.close(() => resolve()));
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname !== "/preview/document") {
      sendHtml(res, 404, "<h1>404 Not Found</h1>");
      return;
    }
    if (req.method !== "GET") {
      sendHtml(res, 405, "<h1>405 Method Not Allowed</h1>");
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      sendHtml(res, 403, "<h1>403 Forbidden</h1><p>Missing token</p>");
      return;
    }

    const result = this.deps.tokenService.verify(token);
    if (!result.valid) {
      const status = result.reason === "expired" ? 403 : 403;
      sendHtml(res, status, `<h1>403 Forbidden</h1><p>${escapeHtml(result.reason)}</p>`);
      return;
    }

    const { payload } = result;
    let revisions: PaperclipDocumentRevision[];
    try {
      revisions = await this.deps.client.listIssueDocumentRevisions(payload.issueId, payload.key);
    } catch {
      sendHtml(res, 502, "<h1>502 Bad Gateway</h1><p>Upstream error</p>");
      return;
    }

    const rev = revisions.find(
      (r) =>
        r.id === payload.revisionId &&
        r.companyId === payload.companyId &&
        r.issueId === payload.issueId &&
        r.key === payload.key,
    );
    if (!rev) {
      sendHtml(res, 404, "<h1>404 Not Found</h1><p>Revision not found</p>");
      return;
    }

    sendHtml(res, 200, renderRevision(rev));
  }
}
