import { describe, expect, it, vi } from "vitest";
import {
  registerAdminRoutes,
  type AdminDeps,
  type AdminDocumentTunnelDeps,
} from "../admin/routes.js";
import type { AdminServer, RouteHandler } from "../admin/server.js";
import type { TunnelStatus } from "../types.js";
import type { RefreshResult } from "../tunnel/pending-interaction-card-refresher.js";

const PREVIEW_PORT = 4321;
const TUNNEL_URL = "https://abc123.trycloudflare.com";

interface FakeRes {
  status?: number;
  data?: unknown;
}

interface CapturedRoute {
  method: string;
  path: string;
  handler: RouteHandler;
}

function createFakeServer(): { server: AdminServer; routes: CapturedRoute[] } {
  const routes: CapturedRoute[] = [];
  const server = {
    addRoute(method: string, path: string, handler: RouteHandler) {
      routes.push({ method, path, handler });
    },
    addStopHook() {},
    json(res: FakeRes, status: number, data: unknown) {
      res.status = status;
      res.data = data;
    },
  };
  return { server: server as unknown as AdminServer, routes };
}

async function call(
  routes: CapturedRoute[],
  method: string,
  path: string,
): Promise<FakeRes> {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`route not registered: ${method} ${path}`);
  const res: FakeRes = {};
  await route.handler({} as never, res as never, {}, undefined);
  return res;
}

function makeManager(opts: { startError?: Error; stopError?: Error } = {}) {
  let status: TunnelStatus = { state: "stopped", url: null, startedAt: null, error: null };
  return {
    getStatus: vi.fn((): TunnelStatus => status),
    start: vi.fn(async (_port: number): Promise<string> => {
      if (opts.startError) {
        status = { state: "error", url: null, startedAt: null, error: opts.startError.message };
        throw opts.startError;
      }
      status = { state: "running", url: TUNNEL_URL, startedAt: "2026-07-24T00:00:00.000Z", error: null };
      return TUNNEL_URL;
    }),
    stop: vi.fn(async (): Promise<void> => {
      if (opts.stopError) throw opts.stopError;
      status = { state: "stopped", url: null, startedAt: null, error: null };
    }),
  };
}

function makeRefresher(
  impl: () => Promise<RefreshResult> = async () => ({ updated: 2, failed: 0, skipped: 1 }),
) {
  return { refreshAll: vi.fn(impl) };
}

function setup(documentTunnel?: AdminDocumentTunnelDeps): { routes: CapturedRoute[] } {
  const { server, routes } = createFakeServer();
  const deps = {
    store: {},
    paperclip: {},
    authService: {},
    feishuRegistry: {},
    storeMode: false,
    onConfigChanged: () => {},
    documentTunnel,
  } as unknown as AdminDeps;
  registerAdminRoutes(server, deps);
  return { routes };
}

function tunnelDeps(
  manager: ReturnType<typeof makeManager>,
  refresher: ReturnType<typeof makeRefresher>,
): AdminDocumentTunnelDeps {
  return { manager, previewPort: PREVIEW_PORT, refresher };
}

describe("tunnel admin routes", () => {
  it("GET /api/tunnel/status returns manager status", async () => {
    const manager = makeManager();
    const refresher = makeRefresher();
    const { routes } = setup(tunnelDeps(manager, refresher));

    const res = await call(routes, "GET", "/api/tunnel/status");
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ state: "stopped", url: null, startedAt: null, error: null });
    expect(manager.getStatus).toHaveBeenCalled();
  });

  it("POST /api/tunnel/start starts on previewPort then refreshes cards", async () => {
    const manager = makeManager();
    const refresher = makeRefresher(async () => ({ updated: 3, failed: 0, skipped: 0 }));
    const { routes } = setup(tunnelDeps(manager, refresher));

    const res = await call(routes, "POST", "/api/tunnel/start");
    expect(manager.start).toHaveBeenCalledWith(PREVIEW_PORT);
    expect(refresher.refreshAll).toHaveBeenCalledTimes(1);
    expect(manager.start.mock.invocationCallOrder[0]).toBeLessThan(
      refresher.refreshAll.mock.invocationCallOrder[0],
    );
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      status: { state: "running", url: TUNNEL_URL, startedAt: "2026-07-24T00:00:00.000Z", error: null },
      refresh: { updated: 3, failed: 0, skipped: 0 },
    });
  });

  it("POST /api/tunnel/stop stops then refreshes cards to drop links", async () => {
    const manager = makeManager();
    const refresher = makeRefresher(async () => ({ updated: 1, failed: 0, skipped: 2 }));
    const { routes } = setup(tunnelDeps(manager, refresher));

    const res = await call(routes, "POST", "/api/tunnel/stop");
    expect(manager.stop).toHaveBeenCalledTimes(1);
    expect(refresher.refreshAll).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      status: { state: "stopped", url: null, startedAt: null, error: null },
      refresh: { updated: 1, failed: 0, skipped: 2 },
    });
  });

  it("POST /api/tunnel/stop returns 502 and does not refresh when stop fails", async () => {
    const manager = makeManager({ stopError: new Error("kill failed") });
    const refresher = makeRefresher();
    const { routes } = setup(tunnelDeps(manager, refresher));

    await manager.start(PREVIEW_PORT);
    const res = await call(routes, "POST", "/api/tunnel/stop");
    expect(res.status).toBe(502);
    expect(res.data).toEqual({
      error: "tunnel stop failed",
      status: { state: "running", url: TUNNEL_URL, startedAt: "2026-07-24T00:00:00.000Z", error: null },
    });
    expect(refresher.refreshAll).not.toHaveBeenCalled();
  });

  it("POST /api/tunnel/start returns 502 with stable error and current status on failure", async () => {
    const manager = makeManager({ startError: new Error("spawn failed") });
    const refresher = makeRefresher();
    const { routes } = setup(tunnelDeps(manager, refresher));

    const res = await call(routes, "POST", "/api/tunnel/start");
    expect(res.status).toBe(502);
    expect(res.data).toEqual({
      error: "tunnel start failed",
      status: { state: "error", url: null, startedAt: null, error: "spawn failed" },
    });
    expect(refresher.refreshAll).not.toHaveBeenCalled();
  });

  it("refresh failure does not roll back a running tunnel", async () => {
    const manager = makeManager();
    const refresher = makeRefresher(async () => {
      throw new Error("feishu api down");
    });
    const { routes } = setup(tunnelDeps(manager, refresher));

    const res = await call(routes, "POST", "/api/tunnel/start");
    expect(manager.stop).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const data = res.data as { status: TunnelStatus; refresh: RefreshResult & { error?: string } };
    expect(data.status.state).toBe("running");
    expect(data.status.url).toBe(TUNNEL_URL);
    expect(data.refresh).toEqual({ updated: 0, failed: 0, skipped: 0, error: "refresh failed" });
  });

  it("returns 503 when documentTunnel dependency is absent", async () => {
    const { routes } = setup(undefined);
    for (const [method, path] of [
      ["GET", "/api/tunnel/status"],
      ["POST", "/api/tunnel/start"],
      ["POST", "/api/tunnel/stop"],
    ] as const) {
      const res = await call(routes, method, path);
      expect(res.status).toBe(503);
      expect(res.data).toEqual({ error: "document tunnel not available" });
    }
  });
});
