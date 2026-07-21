import type { AdminServer } from "./server.js";
import type { ConfigStore } from "../config/store.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { PaperclipAuthService } from "../paperclip/auth-service.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import type { CompanyConfig } from "../types.js";
import { logger } from "../observability/logger.js";

export interface AdminDeps {
  store: ConfigStore;
  paperclip: PaperclipClient;
  authService: PaperclipAuthService;
  feishuRegistry: FeishuClientRegistry;
  storeMode: boolean;
  onConfigChanged: () => void;
}

export function registerAdminRoutes(server: AdminServer, deps: AdminDeps): void {
  const { store, paperclip, authService, feishuRegistry, storeMode, onConfigChanged } = deps;

  server.addRoute("GET", "/api/config/bridge", (_req, res) => {
    server.json(res, 200, store.getGlobal());
  });

  server.addRoute("PUT", "/api/config/bridge", (_req, res, _params, body) => {
    const current = store.getGlobal();
    const patch = body as Partial<typeof current>;
    const updated = { ...current, ...patch };
    store.saveGlobal(updated);
    onConfigChanged();
    server.json(res, 200, { ...updated, restartRequired: true });
  });

  server.addRoute("GET", "/api/config/secrets", (_req, res) => {
    server.json(res, 200, store.maskSecrets());
  });

  server.addRoute("PUT", "/api/config/secrets", (_req, res, _params, body) => {
    const patch = body as Record<string, unknown>;
    if ("paperclipApiKey" in patch) {
      server.json(res, 403, { error: "paperclipApiKey can only be set via auth flow" });
      return;
    }
    const current = store.getSecrets();
    const { paperclipApiKey: _locked, ...safeCurrent } = current;
    const updated = { ...safeCurrent, ...patch, paperclipApiKey: current.paperclipApiKey };
    store.saveSecrets(updated as typeof current);
    onConfigChanged();
    server.json(res, 200, { ...store.maskSecrets(), restartRequired: true });
  });

  server.addRoute("POST", "/api/paperclip/auth/start", async (_req, res, _params, body) => {
    if (!storeMode) {
      server.json(res, 409, { error: "env mode: authorization managed externally" });
      return;
    }
    const input = body as { paperclipBaseUrl?: string } | undefined;
    const baseUrl = input?.paperclipBaseUrl || store.getGlobal().paperclipBaseUrl;
    try {
      const result = await authService.startFlow(baseUrl);
      server.json(res, 200, result);
    } catch (err) {
      server.json(res, 502, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.addRoute("GET", "/api/paperclip/auth/flows/:flowId", async (_req, res, params) => {
    try {
      const result = await authService.pollFlow(params.flowId);
      server.json(res, 200, result);
    } catch (err) {
      server.json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.addRoute("POST", "/api/paperclip/auth/flows/:flowId/cancel", (_req, res, params) => {
    const result = authService.cancelFlow(params.flowId);
    server.json(res, 200, result);
  });

  server.addRoute("GET", "/api/paperclip/auth/status", async (_req, res) => {
    try {
      const result = await authService.getStatus();
      server.json(res, 200, result);
    } catch (err) {
      server.json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.addRoute("POST", "/api/paperclip/auth/revoke", async (_req, res) => {
    if (!storeMode) {
      server.json(res, 409, { error: "env mode: authorization managed externally" });
      return;
    }
    try {
      const result = await authService.revoke();
      if (!result.ok) {
        server.json(res, 502, { error: result.error });
        return;
      }
      server.json(res, 200, { ok: true });
    } catch (err) {
      server.json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.addRoute("GET", "/api/config/companies", (_req, res) => {
    server.json(res, 200, store.getCompaniesPublic());
  });

  server.addRoute("POST", "/api/config/companies", async (_req, res, _params, body) => {
    const input = body as Partial<CompanyConfig>;
    if (!input?.companyId) {
      server.json(res, 400, { error: "companyId is required" });
      return;
    }

    let knownCompanies;
    try {
      if (storeMode) {
        knownCompanies = await authService.listCompanies();
      } else {
        knownCompanies = await paperclip.listCompanies();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "not authorized") {
        server.json(res, 401, { error: "not authorized: complete Paperclip authorization first" });
        return;
      }
      logger.error("paperclip listCompanies failed during company add", { error: msg });
      server.json(res, 502, { error: "unable to verify company against Paperclip API" });
      return;
    }

    const matched = knownCompanies.find((c) => c.id === input.companyId);
    if (!matched) {
      server.json(res, 400, { error: "companyId not found in Paperclip" });
      return;
    }

    const company: CompanyConfig = {
      companyId: input.companyId,
      name: matched.name,
      feishu: input.feishu,
      defaultApprovers: input.defaultApprovers ?? [],
      routing: input.routing ?? {},
    };
    store.addCompany(company);
    onConfigChanged();
    logger.info("company added via admin", { companyId: company.companyId });
    server.json(res, 201, { ok: true, restartRequired: true });
  });

  server.addRoute("PUT", "/api/config/companies/:id", (_req, res, params, body) => {
    const patch = body as Partial<CompanyConfig>;
    if (patch.companyId && patch.companyId !== params.id) {
      server.json(res, 400, { error: "companyId cannot be changed" });
      return;
    }
    const { companyId: _ignored, ...safePatch } = patch;
    const updated = store.updateCompany(params.id, safePatch);
    if (!updated) {
      server.json(res, 404, { error: "company not found" });
      return;
    }
    onConfigChanged();
    logger.info("company updated via admin", { companyId: params.id });
    server.json(res, 200, { ok: true, restartRequired: true });
  });

  server.addRoute("DELETE", "/api/config/companies/:id", (_req, res, params) => {
    const removed = store.removeCompany(params.id);
    if (!removed) {
      server.json(res, 404, { error: "company not found" });
      return;
    }
    onConfigChanged();
    logger.info("company removed via admin", { companyId: params.id });
    server.json(res, 200, { ok: true, restartRequired: true });
  });

  server.addRoute("POST", "/api/paperclip/test", async (_req, res) => {
    const healthy = await paperclip.healthCheck();
    server.json(res, 200, { reachable: healthy });
  });

  server.addRoute("GET", "/api/paperclip/companies", async (_req, res) => {
    try {
      let companies;
      if (storeMode) {
        companies = await authService.listCompanies();
      } else {
        companies = await paperclip.listCompanies();
      }
      server.json(res, 200, companies);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "not authorized") {
        server.json(res, 401, { error: "not authorized: complete Paperclip authorization first" });
        return;
      }
      server.json(res, 502, { error: `paperclip api error: ${msg}` });
    }
  });

  server.addRoute("GET", "/api/feishu/users", async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const companyId = url.searchParams.get("companyId");
    let client;
    if (companyId) {
      client = feishuRegistry.getForCompany(companyId);
      if (!client) {
        server.json(res, 400, { error: `no feishu app configured for company ${companyId}` });
        return;
      }
    } else {
      client = feishuRegistry.getDefault();
      if (!client) {
        server.json(res, 400, { error: "no feishu app configured" });
        return;
      }
    }
    try {
      const users = await client.listUsers();
      server.json(res, 200, users);
    } catch (err) {
      server.json(res, 502, { error: `feishu api error: ${err}` });
    }
  });
}
