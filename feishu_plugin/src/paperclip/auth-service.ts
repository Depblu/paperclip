import { randomBytes } from "node:crypto";
import type { ConfigStore } from "../config/store.js";
import { PaperclipClientError } from "./client.js";
import type {
  AuthFlowStatus,
  AuthMetadata,
  AuthFlowPublic,
  AuthStatusResponse,
  AuthValidity,
  CreateChallengeResponse,
  ChallengeStatusResponse,
  CliAuthMeResponse,
  BoardApiKeyEntry,
  PaperclipCompanyDetail,
  PaperclipDirectoryUser,
  UserDirectoryResponse,
} from "../types.js";
import { logger } from "../observability/logger.js";

interface PendingFlow {
  flowId: string;
  challengeId: string;
  challengeToken: string;
  boardApiToken: string;
  approvalUrl: string;
  expiresAt: string;
  suggestedPollIntervalMs: number;
  status: AuthFlowStatus;
  metadata?: AuthMetadata;
  error?: string;
  createdAt: number;
}

const FLOW_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

export class PaperclipAuthService {
  private flows = new Map<string, PendingFlow>();
  private store: ConfigStore;
  private storeMode: boolean;

  constructor(store: ConfigStore, storeMode: boolean) {
    this.store = store;
    this.storeMode = storeMode;
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
  }

  private cleanupTimer: ReturnType<typeof setInterval>;

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.flows.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, flow] of this.flows) {
      if (now - flow.createdAt > FLOW_TTL_MS || flow.status === "approved" || flow.status === "cancelled" || flow.status === "failed") {
        this.flows.delete(id);
      }
    }
  }

  private normalizeBaseUrl(raw: string): string {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("invalid Paperclip URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("only http: and https: protocols are allowed");
    }
    return url.origin;
  }

  async startFlow(paperclipBaseUrl: string): Promise<AuthFlowPublic> {
    const baseUrl = this.normalizeBaseUrl(paperclipBaseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/api/cli-auth/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "feishu-plugin connect",
          clientName: "paperclip-feishu-bridge",
          requestedAccess: "board",
          requestedCompanyId: null,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Paperclip unreachable (timeout)");
      }
      throw new Error("Paperclip unreachable");
    }
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Paperclip challenge creation failed (${resp.status}): ${text.slice(0, 120)}`);
    }

    const data = (await resp.json()) as CreateChallengeResponse;
    if (!data.id || !data.token || !data.boardApiToken) {
      throw new Error("invalid challenge response from Paperclip");
    }

    const flowId = randomBytes(16).toString("hex");
    const approvalUrl = data.approvalUrl ?? `${baseUrl}${data.approvalPath}`;

    const flow: PendingFlow = {
      flowId,
      challengeId: data.id,
      challengeToken: data.token,
      boardApiToken: data.boardApiToken,
      approvalUrl,
      expiresAt: data.expiresAt,
      suggestedPollIntervalMs: data.suggestedPollIntervalMs ?? 1000,
      status: "pending",
      createdAt: Date.now(),
    };

    this.flows.set(flowId, flow);

    const global = this.store.getGlobal();
    global.paperclipBaseUrl = baseUrl;
    global.paperclipPublicUrl = baseUrl;
    this.store.saveGlobal(global);

    return {
      flowId,
      status: "pending",
      approvalUrl,
      expiresAt: data.expiresAt,
      suggestedPollIntervalMs: flow.suggestedPollIntervalMs,
    };
  }

  async pollFlow(flowId: string): Promise<AuthFlowPublic> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return { flowId, status: "failed", error: "flow not found or expired" };
    }

    if (flow.status !== "pending") {
      return this.toPublic(flow);
    }

    if (Date.now() - flow.createdAt > FLOW_TTL_MS) {
      flow.status = "expired";
      this.purgeSecrets(flow);
      this.flows.delete(flowId);
      return { flowId, status: "expired", error: "flow expired" };
    }

    const baseUrl = this.store.getGlobal().paperclipBaseUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(
        `${baseUrl}/api/cli-auth/challenges/${flow.challengeId}?token=${encodeURIComponent(flow.challengeToken)}`,
        { signal: controller.signal },
      );
    } catch {
      clearTimeout(timer);
      return { flowId, status: "pending" };
    }
    clearTimeout(timer);

    if (!resp.ok) {
      return { flowId, status: "pending" };
    }

    const data = (await resp.json()) as ChallengeStatusResponse;

    if (data.status === "pending") {
      return { flowId, status: "pending", expiresAt: flow.expiresAt };
    }

    if (data.status === "cancelled") {
      flow.status = "cancelled";
      this.purgeSecrets(flow);
      this.flows.delete(flowId);
      return { flowId, status: "cancelled", error: "authorization cancelled" };
    }

    if (data.status === "expired") {
      flow.status = "expired";
      this.purgeSecrets(flow);
      this.flows.delete(flowId);
      return { flowId, status: "expired", error: "authorization expired" };
    }

    if (data.status === "approved") {
      try {
        const metadata = await this.verifyAndSave(flow, baseUrl);
        flow.status = "approved";
        flow.metadata = metadata;
        this.purgeSecrets(flow);
        const pub = this.toPublic(flow);
        this.flows.delete(flowId);
        return pub;
      } catch (err) {
        flow.status = "failed";
        flow.error = `verification failed: ${err instanceof Error ? err.message : String(err)}`;
        this.purgeSecrets(flow);
        const pub = this.toPublic(flow);
        this.flows.delete(flowId);
        return pub;
      }
    }

    return { flowId, status: "pending" };
  }

  private async verifyAndSave(flow: PendingFlow, baseUrl: string): Promise<AuthMetadata> {
    const meResp = await this.fetchWithToken<CliAuthMeResponse>(
      baseUrl, "/api/cli-auth/me", flow.boardApiToken,
    );

    if (!meResp.userId || meResp.source !== "board_key") {
      throw new Error("credential is not a valid board key");
    }

    const companies = await this.fetchWithToken<Array<{ id: string }>>(
      baseUrl, "/api/companies", flow.boardApiToken,
    );

    let keyExpiresAt: string | null = null;
    if (meResp.keyId) {
      try {
        const keys = await this.fetchWithToken<BoardApiKeyEntry[]>(
          baseUrl, "/api/board-api-keys", flow.boardApiToken,
        );
        const matched = keys.find((k) => k.id === meResp.keyId);
        if (matched) {
          keyExpiresAt = matched.expiresAt ?? null;
        }
      } catch {
        logger.warn("could not fetch board-api-keys metadata");
      }
    }

    const metadata: AuthMetadata = {
      userId: meResp.userId,
      userName: meResp.user?.name ?? null,
      userEmail: meResp.user?.email ?? null,
      keyId: meResp.keyId ?? flow.challengeId,
      keyExpiresAt,
      connectedAt: new Date().toISOString(),
      companyCount: Array.isArray(companies) ? companies.length : 0,
    };

    const secrets = this.store.getSecrets();
    secrets.paperclipApiKey = flow.boardApiToken;
    this.store.saveSecrets(secrets);
    this.store.saveAuthMetadata(metadata);

    return metadata;
  }

  private async fetchWithToken<T>(baseUrl: string, path: string, token: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!resp.ok) {
        const retryable = resp.status >= 500 || resp.status === 429;
        throw new PaperclipClientError(`Paperclip ${path} → ${resp.status}`, resp.status, retryable);
      }
      return (await resp.json()) as T;
    } catch (err) {
      if (err instanceof PaperclipClientError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new PaperclipClientError(`Paperclip ${path} timeout`, 0, true);
      }
      throw new PaperclipClientError(`Paperclip ${path} unreachable`, 0, true);
    } finally {
      clearTimeout(timer);
    }
  }

  private purgeSecrets(flow: PendingFlow): void {
    flow.challengeToken = "";
    flow.boardApiToken = "";
  }

  private toPublic(flow: PendingFlow): AuthFlowPublic {
    return {
      flowId: flow.flowId,
      status: flow.status,
      approvalUrl: flow.status === "pending" ? flow.approvalUrl : undefined,
      expiresAt: flow.expiresAt,
      suggestedPollIntervalMs: flow.suggestedPollIntervalMs,
      metadata: flow.metadata,
      restartRequired: flow.status === "approved" ? true : undefined,
      error: flow.error,
    };
  }

  cancelFlow(flowId: string): AuthFlowPublic {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return { flowId, status: "failed", error: "flow not found" };
    }
    flow.status = "cancelled";
    this.purgeSecrets(flow);
    this.flows.delete(flowId);
    return { flowId, status: "cancelled" };
  }

  async getStatus(): Promise<AuthStatusResponse> {
    if (!this.storeMode) {
      return { connected: true, validity: "valid", mode: "env" };
    }

    const secrets = this.store.getSecrets();
    const token = secrets.paperclipApiKey;
    if (!token) {
      return { connected: false, validity: "missing", mode: "store" };
    }

    const baseUrl = this.store.getGlobal().paperclipBaseUrl.replace(/\/+$/, "");
    const metadata = this.store.getAuthMetadata();

    let meResp: CliAuthMeResponse;
    try {
      meResp = await this.fetchWithToken<CliAuthMeResponse>(baseUrl, "/api/cli-auth/me", token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("403")) {
        return { connected: false, validity: "revoked_or_invalid", mode: "store" };
      }
      return { connected: false, validity: "unreachable", mode: "store" };
    }

    let keyExpiresAt: string | null = metadata?.keyExpiresAt ?? null;
    let keyId = metadata?.keyId ?? meResp.keyId ?? "unknown";

    if (meResp.keyId) {
      keyId = meResp.keyId;
      try {
        const keys = await this.fetchWithToken<BoardApiKeyEntry[]>(baseUrl, "/api/board-api-keys", token);
        const matched = keys.find((k) => k.id === meResp.keyId);
        if (matched) {
          keyExpiresAt = matched.expiresAt ?? null;
        }
      } catch {
        // keep existing metadata
      }
    }

    const expired = keyExpiresAt ? new Date(keyExpiresAt).getTime() < Date.now() : false;
    const validity: AuthValidity = expired ? "expired" : "valid";

    const updatedMeta: AuthMetadata = {
      userId: meResp.userId,
      userName: meResp.user?.name ?? null,
      userEmail: meResp.user?.email ?? null,
      keyId,
      keyExpiresAt,
      connectedAt: metadata?.connectedAt ?? new Date().toISOString(),
      companyCount: meResp.companyIds?.length ?? 0,
    };
    this.store.saveAuthMetadata(updatedMeta);

    return {
      connected: !expired,
      validity,
      user: { id: meResp.userId, name: meResp.user?.name ?? null, email: meResp.user?.email ?? null },
      companyCount: updatedMeta.companyCount,
      key: { id: keyId, expiresAt: keyExpiresAt, expired },
      lastValidatedAt: new Date().toISOString(),
      mode: "store",
    };
  }

  async revoke(): Promise<{ ok: boolean; error?: string }> {
    const secrets = this.store.getSecrets();
    const token = secrets.paperclipApiKey;
    if (!token) {
      return { ok: true };
    }

    const baseUrl = this.store.getGlobal().paperclipBaseUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/api/cli-auth/revoke-current`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return { ok: false, error: "Paperclip unreachable, please retry" };
    }
    clearTimeout(timer);

    if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
      this.clearLocalCredentials();
      return { ok: true };
    }

    if (resp.status >= 500) {
      return { ok: false, error: "Paperclip server error, please retry" };
    }

    if (!resp.ok) {
      return { ok: false, error: `revoke failed (${resp.status})` };
    }

    this.clearLocalCredentials();
    return { ok: true };
  }

  private clearLocalCredentials(): void {
    const secrets = this.store.getSecrets();
    secrets.paperclipApiKey = "";
    this.store.saveSecrets(secrets);
    this.store.clearAuthMetadata();
  }

  async listCompanies(): Promise<Array<{ id: string; name: string; issuePrefix?: string }>> {
    const secrets = this.store.getSecrets();
    const token = secrets.paperclipApiKey;
    if (!token) {
      throw new PaperclipClientError("not authorized", 401, false);
    }
    const baseUrl = this.store.getGlobal().paperclipBaseUrl.replace(/\/+$/, "");
    return this.fetchWithToken(baseUrl, "/api/companies", token);
  }

  async getCompany(companyId: string): Promise<PaperclipCompanyDetail> {
    const secrets = this.store.getSecrets();
    const token = secrets.paperclipApiKey;
    if (!token) {
      throw new PaperclipClientError("not authorized", 401, false);
    }
    const baseUrl = this.store.getGlobal().paperclipBaseUrl.replace(/\/+$/, "");
    return this.fetchWithToken<PaperclipCompanyDetail>(baseUrl, `/api/companies/${companyId}`, token);
  }

  async listCompanyUsers(companyId: string): Promise<PaperclipDirectoryUser[]> {
    const secrets = this.store.getSecrets();
    const token = secrets.paperclipApiKey;
    if (!token) {
      throw new PaperclipClientError("not authorized", 401, false);
    }
    const baseUrl = this.store.getGlobal().paperclipBaseUrl.replace(/\/+$/, "");
    const resp = await this.fetchWithToken<UserDirectoryResponse>(
      baseUrl, `/api/companies/${companyId}/user-directory`, token,
    );
    return (resp.users ?? [])
      .filter((entry) => entry.user !== null)
      .map((entry) => ({
        id: entry.user!.id,
        name: entry.user!.name,
        email: entry.user!.email,
      }));
  }
}
