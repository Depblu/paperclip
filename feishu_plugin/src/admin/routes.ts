import type { AdminServer } from "./server.js";
import type { ConfigStore } from "../config/store.js";
import type { PaperclipClient } from "../paperclip/client.js";
import { PaperclipClientError } from "../paperclip/client.js";
import type { PaperclipAuthService } from "../paperclip/auth-service.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import { FeishuClient } from "../feishu/client.js";
import { FeishuVerificationSessions } from "../feishu/verification-sessions.js";
import { APPROVAL_TYPE_META } from "../approvals/approval-type-meta.js";
import type {
  ApproverConfig,
  ApproverSuggestion,
  ApproverSuggestionsResponse,
  ApprovalTypeRouting,
  CompanyConfig,
  FeishuBinding,
  PaperclipCompanyDetail,
  CompanyBudgetViewModel,
} from "../types.js";
import { logger } from "../observability/logger.js";

export interface AdminDeps {
  store: ConfigStore;
  paperclip: PaperclipClient;
  authService: PaperclipAuthService;
  feishuRegistry: FeishuClientRegistry;
  storeMode: boolean;
  onConfigChanged: () => void;
  verificationSessions?: FeishuVerificationSessions;
}

interface CompanySaveInput {
  companyId: string;
  name?: string;
  feishuBinding?: FeishuBinding | null;
  feishuVerificationId?: string;
  defaultApprovers?: ApproverConfig[];
  routing?: Record<string, ApprovalTypeRouting>;
}

type BindingResult = { ok: true } | { ok: false; status: number; error: string };

type ResolvedClient =
  | { client: FeishuClient }
  | { error: string; status: number };

export function registerAdminRoutes(server: AdminServer, deps: AdminDeps): void {
  const { store, paperclip, authService, storeMode, onConfigChanged } = deps;
  const verificationSessions = deps.verificationSessions ?? new FeishuVerificationSessions();
  server.addStopHook(() => verificationSessions.destroy());

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
    const updated = { ...current };

    const hasIdField = "defaultFeishuAppId" in patch;
    const hasSecretField = "defaultFeishuAppSecret" in patch;
    if (hasIdField || hasSecretField) {
      const id = typeof patch.defaultFeishuAppId === "string" ? patch.defaultFeishuAppId.trim() : "";
      const secret = typeof patch.defaultFeishuAppSecret === "string" ? patch.defaultFeishuAppSecret.trim() : "";
      if (id.includes("***") || secret.includes("***")) {
        server.json(res, 400, { error: "masked feishu credential cannot be saved; provide real values" });
        return;
      }
      if (!id || !secret) {
        server.json(res, 400, { error: "defaultFeishuAppId and defaultFeishuAppSecret must be provided together" });
        return;
      }
      updated.defaultFeishuAppId = id;
      updated.defaultFeishuAppSecret = secret;
    }

    store.saveSecrets(updated);
    onConfigChanged();
    server.json(res, 200, { ...store.maskSecrets(), restartRequired: true });
  });

  server.addRoute("GET", "/api/feishu/global-status", (_req, res) => {
    server.json(res, 200, { hasDefaultFeishuApp: store.hasDefaultFeishuCredentials() });
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
    const input = body as CompanySaveInput;
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
      const mapped = mapPaperclipError(err);
      logger.error("paperclip listCompanies failed during company add", { error: String(err) });
      server.json(res, mapped.status, { error: mapped.error });
      return;
    }

    const matched = knownCompanies.find((c) => c.id === input.companyId);
    if (!matched) {
      server.json(res, 400, { error: "companyId not found in Paperclip" });
      return;
    }

    const bindingResult = applyCompanyBinding(store, verificationSessions, input.companyId, {
      feishuBinding: input.feishuBinding ?? null,
      feishuVerificationId: input.feishuVerificationId,
    });
    if (!bindingResult.ok) {
      server.json(res, bindingResult.status, { error: bindingResult.error });
      return;
    }

    const company: CompanyConfig = {
      companyId: input.companyId,
      name: matched.name,
      feishuBinding: input.feishuBinding ?? undefined,
      defaultApprovers: input.defaultApprovers ?? [],
      routing: input.routing ?? {},
    };
    store.addCompany(company);
    onConfigChanged();
    logger.info("company added via admin", { companyId: company.companyId });
    server.json(res, 201, { ok: true, restartRequired: true });
  });

  server.addRoute("PUT", "/api/config/companies/:id", (_req, res, params, body) => {
    const patch = body as Partial<CompanySaveInput>;
    if (patch.companyId && patch.companyId !== params.id) {
      server.json(res, 400, { error: "companyId cannot be changed" });
      return;
    }
    const existing = store.getCompanies().find((c) => c.companyId === params.id);
    if (!existing) {
      server.json(res, 404, { error: "company not found" });
      return;
    }

    if (patch.feishuBinding !== undefined || patch.feishuVerificationId !== undefined) {
      const bindingResult = applyCompanyBinding(store, verificationSessions, params.id, {
        feishuBinding: patch.feishuBinding !== undefined ? patch.feishuBinding : existing.feishuBinding ?? null,
        feishuVerificationId: patch.feishuVerificationId,
      });
      if (!bindingResult.ok) {
        server.json(res, bindingResult.status, { error: bindingResult.error });
        return;
      }
    }

    const updatePatch: Partial<CompanyConfig> = {};
    if (patch.name !== undefined) updatePatch.name = patch.name;
    if (patch.defaultApprovers !== undefined) updatePatch.defaultApprovers = patch.defaultApprovers;
    if (patch.routing !== undefined) updatePatch.routing = patch.routing;
    if (patch.feishuBinding !== undefined) updatePatch.feishuBinding = patch.feishuBinding ?? undefined;
    const updated = store.updateCompany(params.id, updatePatch);
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
      const mapped = mapPaperclipError(err);
      server.json(res, mapped.status, { error: mapped.error });
    }
  });

  server.addRoute("GET", "/api/paperclip/companies/:id", async (_req, res, params) => {
    try {
      let detail: PaperclipCompanyDetail;
      if (storeMode) {
        detail = await authService.getCompany(params.id);
      } else {
        detail = await paperclip.getCompany(params.id);
      }
      const budget = toBudgetViewModel(detail);
      server.json(res, 200, { ...detail, budget });
    } catch (err) {
      const mapped = mapPaperclipError(err);
      server.json(res, mapped.status, { error: mapped.error });
    }
  });

  server.addRoute("GET", "/api/feishu/users", async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const companyId = url.searchParams.get("companyId");
    const verificationId = url.searchParams.get("verificationId");
    if (!companyId && !verificationId) {
      server.json(res, 400, { error: "companyId is required" });
      return;
    }
    const modeParam = url.searchParams.get("mode");
    const modeOverride = modeParam === "global" || modeParam === "company" ? modeParam : null;
    const resolved = resolveAdminFeishuClient(store, verificationSessions, companyId ?? "", verificationId, modeOverride);
    if ("error" in resolved) {
      server.json(res, resolved.status, { error: resolved.error });
      return;
    }
    try {
      const users = await resolved.client.listUsers();
      server.json(res, 200, users);
    } catch (err) {
      server.json(res, 502, { error: "feishu api error" });
    }
  });

  server.addRoute("POST", "/api/feishu/verify", async (_req, res, _params, body) => {
    const input = body as { appId?: string; appSecret?: string } | undefined;
    if (!input?.appId || !input?.appSecret) {
      server.json(res, 400, { error: "appId and appSecret are required" });
      return;
    }
    const client = new FeishuClient(input.appId, input.appSecret);
    try {
      const result = await client.verifyApp();
      if (result.valid) {
        const verificationId = verificationSessions.create(input.appId, input.appSecret);
        server.json(res, 200, { ...result, verificationId });
      } else {
        server.json(res, 200, result);
      }
    } catch (err) {
      server.json(res, 502, { error: "feishu verify failed" });
    }
  });

  server.addRoute("DELETE", "/api/feishu/verifications/:verificationId", (_req, res, params) => {
    verificationSessions.consume(params.verificationId);
    server.json(res, 200, { ok: true });
  });

  server.addRoute("GET", "/api/approver-suggestions", async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const companyId = url.searchParams.get("companyId");
    if (!companyId) {
      server.json(res, 400, { error: "companyId is required" });
      return;
    }

    const verificationId = url.searchParams.get("verificationId");
    const modeParam = url.searchParams.get("mode");
    const modeOverride = modeParam === "global" || modeParam === "company" ? modeParam : null;
    const resolved = resolveAdminFeishuClient(store, verificationSessions, companyId, verificationId, modeOverride);
    if ("error" in resolved) {
      server.json(res, resolved.status, { error: resolved.error });
      return;
    }

    let directory;
    try {
      directory = await resolved.client.listUsersWithStatus();
    } catch (err) {
      server.json(res, 502, { error: "feishu api error" });
      return;
    }
    const feishuUsers = directory.users;

    let paperclipUsers: Array<{ id: string; name: string; email: string | null }> = [];
    let paperclipDirectoryAvailable = false;
    let paperclipDirectoryError: string | null = null;

    try {
      if (storeMode) {
        paperclipUsers = await authService.listCompanyUsers(companyId);
      } else {
        paperclipUsers = await paperclip.listCompanyUsers(companyId);
      }
      paperclipDirectoryAvailable = true;
    } catch (err) {
      paperclipDirectoryAvailable = false;
      paperclipDirectoryError = err instanceof Error ? err.message : String(err);
    }

    const suggestions: ApproverSuggestion[] = feishuUsers.map((fu) => {
      let matched: { id: string; name: string; email: string | null } | null = null;
      let matchConfidence: "high" | "low" | null = null;

      const emailMatch = paperclipUsers.find(
        (pu) => pu.email && fu.email && pu.email.toLowerCase() === fu.email.toLowerCase(),
      );
      if (emailMatch) {
        matched = { id: emailMatch.id, name: emailMatch.name, email: emailMatch.email };
        matchConfidence = "high";
      } else {
        const nameMatch = paperclipUsers.find(
          (pu) => pu.name && fu.name && pu.name === fu.name,
        );
        if (nameMatch) {
          matched = { id: nameMatch.id, name: nameMatch.name, email: nameMatch.email };
          matchConfidence = "low";
        }
      }

      return {
        openId: fu.openId,
        name: fu.name,
        source: "feishu" as const,
        matchConfidence,
        matchedPaperclipUser: matched,
      };
    });

    const response: ApproverSuggestionsResponse = {
      suggestions,
      paperclipDirectoryAvailable,
      paperclipDirectoryError,
      feishuDirectoryComplete: directory.complete,
      feishuDirectoryWarnings: directory.warnings,
    };
    server.json(res, 200, response);
  });

  server.addRoute("GET", "/api/approval-type-meta", (_req, res) => {
    server.json(res, 200, APPROVAL_TYPE_META);
  });
}

function applyCompanyBinding(
  store: ConfigStore,
  sessions: FeishuVerificationSessions,
  companyId: string,
  input: { feishuBinding: FeishuBinding | null; feishuVerificationId?: string },
): BindingResult {
  const mode = input.feishuBinding?.mode;

  if (mode === "global") {
    if (!store.hasDefaultFeishuCredentials()) {
      return { ok: false, status: 400, error: "global feishu app not configured" };
    }
    store.removeCompanyFeishuCredentials(companyId);
    return { ok: true };
  }

  if (mode === "company") {
    const verificationId = input.feishuVerificationId;
    if (verificationId) {
      const creds = sessions.get(verificationId);
      if (!creds) {
        return { ok: false, status: 400, error: "verificationId not found or expired" };
      }
      store.setCompanyFeishuCredentials(companyId, creds);
      sessions.consume(verificationId);
      return { ok: true };
    }
    if (store.hasCompanyFeishuCredentials(companyId)) {
      return { ok: true };
    }
    return { ok: false, status: 400, error: "company feishu credentials require a valid verificationId" };
  }

  store.removeCompanyFeishuCredentials(companyId);
  return { ok: true };
}

function resolveAdminFeishuClient(
  store: ConfigStore,
  sessions: FeishuVerificationSessions,
  companyId: string,
  verificationId: string | null,
  modeOverride?: FeishuBinding["mode"] | null,
): ResolvedClient {
  if (verificationId) {
    const creds = sessions.get(verificationId);
    if (!creds) {
      return { error: "verificationId not found or expired", status: 400 };
    }
    return { client: new FeishuClient(creds.appId, creds.appSecret) };
  }

  const company = store.getCompanies().find((c) => c.companyId === companyId);
  const mode = modeOverride ?? company?.feishuBinding?.mode;

  if (mode === "global") {
    const creds = store.getDefaultFeishuCredentials();
    if (!creds) {
      return { error: "global feishu app not configured", status: 400 };
    }
    return { client: new FeishuClient(creds.appId, creds.appSecret) };
  }

  const companyCreds = store.getFeishuForCompany(companyId);
  if (companyCreds) {
    return { client: new FeishuClient(companyCreds.appId, companyCreds.appSecret) };
  }

  return { error: "no feishu app configured for this company", status: 400 };
}

function mapPaperclipError(err: unknown): { status: number; error: string } {
  if (err instanceof PaperclipClientError) {
    if (err.statusCode === 401) {
      return { status: 401, error: "not authorized: complete Paperclip authorization first" };
    }
    if (err.statusCode === 403) {
      return { status: 403, error: "forbidden: no access to this company" };
    }
    if (err.statusCode === 404) {
      return { status: 404, error: "not found in Paperclip" };
    }
    return { status: 502, error: "unable to reach Paperclip API" };
  }
  return { status: 502, error: "unable to reach Paperclip API" };
}

function toBudgetViewModel(detail: PaperclipCompanyDetail): CompanyBudgetViewModel | null {
  const monthly = detail.budgetMonthlyCents;
  if (monthly == null) return null;
  const spent = detail.spentMonthlyCents ?? 0;
  const remaining = monthly - spent;
  return {
    monthlyCents: monthly,
    spentCents: spent,
    remainingCents: remaining,
    overBudgetCents: remaining < 0 ? -remaining : 0,
  };
}
