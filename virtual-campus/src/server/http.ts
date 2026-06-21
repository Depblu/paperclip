import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CampusStore } from "./campus-store";
import type { PaperclipLiveEvent } from "./paperclip-types";
import type { UserRole } from "../shared/types";

export interface CampusServerOptions {
  store: CampusStore;
  events: PaperclipLiveEvent[];
  port: number;
  staticDir?: string;
}

interface SseClient {
  id: number;
  response: ServerResponse;
}

let clientId = 0;

export function createCampusHttpServer(options: CampusServerOptions) {
  const clients = new Map<number, SseClient>();
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(options, clients, request, response);
    } catch (error) {
      sendError(response, error);
    }
  });

  server.on("listening", () => {
    startMockEventPump(options.store, options.events, clients);
  });

  return server;
}

async function handleRequest(
  options: CampusServerOptions,
  clients: Map<number, SseClient>,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, { ok: true });
  }
  if (request.method === "GET" && url.pathname === "/api/campus") {
    return sendJson(response, [{ id: "campus-main", name: "Virtual Software Campus" }]);
  }
  if (request.method === "GET" && url.pathname === "/api/events") {
    return openSse(clients, request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/timeline") {
    const viewer = viewerFromRequest(request);
    return sendJson(response, options.store.getTimeline(viewer, param(url, "entityType"), param(url, "entityId")));
  }
  const overviewMatch = url.pathname.match(/^\/api\/campus\/([^/]+)\/overview$/);
  if (request.method === "GET" && overviewMatch) {
    return sendJson(response, options.store.getOverview(viewerFromRequest(request)));
  }
  const companyCampusMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/campus$/);
  if (request.method === "GET" && companyCampusMatch) {
    const companyId = decodeURIComponent(companyCampusMatch[1] ?? "");
    const overview = options.store.getOverview(viewerFromRequest(request));
    return sendJson(response, overview.buildings.filter((building) => building.companyId === companyId));
  }
  const floorMatch = url.pathname.match(/^\/api\/floors\/([^/]+)$/);
  if (request.method === "GET" && floorMatch) {
    const floorId = decodeURIComponent(floorMatch[1] ?? "");
    return sendJson(response, options.store.getFloorView(floorId, viewerFromRequest(request), {
      query: param(url, "query"),
      team: param(url, "team"),
      status: param(url, "status"),
      priority: param(url, "priority"),
      alert: param(url, "alert"),
    }));
  }
  const seatMatch = url.pathname.match(/^\/api\/seats\/([^/]+)$/);
  if (request.method === "GET" && seatMatch) {
    return sendJson(response, options.store.getSeatDetail(decodeURIComponent(seatMatch[1] ?? ""), viewerFromRequest(request)));
  }
  const employeeMatch = url.pathname.match(/^\/api\/employees\/([^/]+)$/);
  if (request.method === "GET" && employeeMatch) {
    return sendJson(response, options.store.getEmployee(decodeURIComponent(employeeMatch[1] ?? ""), viewerFromRequest(request)));
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (request.method === "GET" && taskMatch) {
    return sendJson(response, options.store.getTask(decodeURIComponent(taskMatch[1] ?? ""), viewerFromRequest(request)));
  }
  const metricsMatch = url.pathname.match(/^\/api\/metrics\/company\/([^/]+)$/);
  if (request.method === "GET" && metricsMatch) {
    return sendJson(response, options.store.getCompanyMetrics(decodeURIComponent(metricsMatch[1] ?? ""), viewerFromRequest(request)));
  }
  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    return serveStatic(options.staticDir, url.pathname, response);
  }
  sendJson(response, { error: "not_found" }, 404);
}

function param(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value && value.length > 0 ? value : undefined;
}

function viewerFromRequest(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const role = normalizeRole(headerOrQuery(request, url, "x-campus-role", "role"));
  const companyHeader = headerOrQuery(request, url, "x-campus-companies", "companies");
  const companyIds =
    companyHeader.length > 0
      ? companyHeader.split(",").map((item) => item.trim()).filter(Boolean)
      : role === "platform_admin" || role === "company_owner"
        ? []
        : [];
  return { role, companyIds };
}

function headerOrQuery(request: IncomingMessage, url: URL, header: string, query: string) {
  const value = request.headers[header];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? url.searchParams.get(query) ?? "";
}

function normalizeRole(value: string): UserRole {
  if (value === "platform_admin" || value === "company_owner" || value === "team_lead" || value === "observer" || value === "auditor") {
    return value;
  }
  return "company_owner";
}

function openSse(clients: Map<number, SseClient>, request: IncomingMessage, response: ServerResponse) {
  const id = clientId + 1;
  clientId = id;
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  response.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  clients.set(id, { id, response });
  request.on("close", () => {
    clients.delete(id);
  });
}

function startMockEventPump(store: CampusStore, events: PaperclipLiveEvent[], clients: Map<number, SseClient>) {
  let delay = 1500;
  for (const event of events) {
    setTimeout(() => {
      const applied = store.applyPaperclipEvent(event);
      if (!applied) return;
      broadcast(clients, "campus.event", event);
    }, delay);
    delay += 2500;
  }
}

function broadcast(clients: Map<number, SseClient>, eventName: string, payload: unknown) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients.values()) {
    client.response.write(data);
  }
}

async function serveStatic(staticDir: string | undefined, pathname: string, response: ServerResponse) {
  if (!staticDir) {
    return sendJson(response, { error: "static_disabled" }, 404);
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(staticDir, safePath);
  const fallback = path.join(staticDir, "index.html");
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(content);
  } catch {
    const content = await readFile(fallback);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(content);
  }
}

function contentType(filePath: string) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/html; charset=utf-8";
}

function sendJson(response: ServerResponse, payload: unknown, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "internal_error";
  const status = message === "forbidden" ? 403 : message.endsWith("_not_found") ? 404 : 500;
  sendJson(response, { error: message }, status);
}

export function defaultStaticDir() {
  const current = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(current, "../../dist/client");
}
