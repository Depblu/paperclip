import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { logger } from "../observability/logger.js";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  body: unknown,
) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export class AdminServer {
  private routes: Route[] = [];
  private server: ReturnType<typeof createServer> | null = null;
  private uiDir: string;
  private host: string;

  constructor(private port: number, uiDir = "./ui", host = "127.0.0.1") {
    this.uiDir = resolve(uiDir);
    this.host = host;
  }

  addRoute(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:([^/]+)/g, (_m, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler,
    });
  }

  start(): void {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, this.host, () => {
      logger.info("admin server started", { host: this.host, port: this.port });
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "GET" && !pathname.startsWith("/api/")) {
      this.serveStatic(pathname, res);
      return;
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      const body = await this.parseBody(req);
      try {
        await route.handler(req, res, params, body);
      } catch (err) {
        logger.error("admin route error", { pathname, error: String(err) });
        this.json(res, 500, { error: "internal server error" });
      }
      return;
    }

    this.json(res, 404, { error: "not found" });
  }

  private async parseBody(req: IncomingMessage): Promise<unknown> {
    if (req.method === "GET" || req.method === "DELETE") return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return undefined;
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      return undefined;
    }
  }

  private serveStatic(pathname: string, res: ServerResponse): void {
    const safePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = join(this.uiDir, safePath);
    if (!filePath.startsWith(this.uiDir) || !existsSync(filePath)) {
      const indexPath = join(this.uiDir, "index.html");
      if (existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(readFileSync(indexPath));
        return;
      }
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(readFileSync(filePath));
  }

  json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  }
}
