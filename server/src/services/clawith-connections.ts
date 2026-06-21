import { companySecrets, type Db } from "@paperclipai/db";
import { and, eq, ne } from "drizzle-orm";
import type { SecretProvider } from "@paperclipai/shared";
import { conflict, forbidden, HttpError, notFound, unprocessable } from "../errors.js";
import { secretService } from "./secrets.js";

const CLAWITH_CONNECTION_KIND = "clawith_connection";
const DEFAULT_PROVIDER: SecretProvider = "local_encrypted";

export interface ClawithConnection {
  id: string;
  companyId: string;
  baseUrl: string;
  label: string;
  username: string | null;
  tenantId: string | null;
  tenantName: string | null;
  status: "connected" | "expired" | "disabled";
  connectedAt: string | null;
  lastValidatedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClawithAgentListOption {
  id: string;
  name: string;
  status: string | null;
  creatorUsername: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeBaseUrl(value: unknown): string {
  const raw = asString(value);
  if (!raw) throw unprocessable("Clawith URL is required");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw unprocessable("Invalid Clawith URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw unprocessable("Clawith URL must use http or https");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (parsed.pathname === "/") parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

async function readResponseBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function readErrorMessage(body: unknown, fallback: string): string {
  const record = asRecord(body);
  const detail = record?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  const detailRecord = asRecord(detail);
  const nestedMessage = asString(detailRecord?.message);
  return nestedMessage ?? asString(record?.error) ?? asString(record?.message) ?? fallback;
}

function readMetadata(secret: typeof companySecrets.$inferSelect): Record<string, unknown> {
  return asRecord(secret.providerMetadata) ?? {};
}

function connectionFromSecret(secret: typeof companySecrets.$inferSelect): ClawithConnection | null {
  const metadata = readMetadata(secret);
  if (metadata.kind !== CLAWITH_CONNECTION_KIND) return null;
  const baseUrl = asString(metadata.baseUrl);
  if (!baseUrl) return null;
  const status = asString(metadata.connectionStatus);
  return {
    id: secret.id,
    companyId: secret.companyId,
    baseUrl,
    label: asString(metadata.label) ?? secret.name,
    username: asString(metadata.username),
    tenantId: asString(metadata.tenantId),
    tenantName: asString(metadata.tenantName),
    status: status === "expired" || status === "disabled" ? status : "connected",
    connectedAt: asString(metadata.connectedAt),
    lastValidatedAt: asString(metadata.lastValidatedAt),
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

function connectionKey(baseUrl: string, tenantId: string | null, username: string | null): string {
  const normalized = `${baseUrl}:${tenantId ?? "default"}:${username ?? "user"}`
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return `clawith-${normalized || "connection"}`;
}

function connectionName(baseUrl: string, tenantName: string | null, username: string | null): string {
  const host = new URL(baseUrl).host;
  const owner = username ?? tenantName ?? "user";
  return `Clawith ${owner} at ${host}`;
}

function userDisplayName(user: Record<string, unknown> | null, identity: Record<string, unknown> | null): string | null {
  return asString(user?.display_name)
    ?? asString(user?.username)
    ?? asString(user?.email)
    ?? asString(identity?.email);
}

function readTenantName(user: Record<string, unknown> | null, body: Record<string, unknown>): string | null {
  return asString(body.tenant_name) ?? asString(user?.tenant_name);
}

function readTenantId(user: Record<string, unknown> | null): string | null {
  return asString(user?.tenant_id);
}

async function loginClawith(input: {
  baseUrl: string;
  loginIdentifier: string;
  password: string;
  tenantId?: string | null;
}): Promise<Record<string, unknown>> {
  const res = await fetch(joinUrl(input.baseUrl, "/api/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      login_identifier: input.loginIdentifier,
      password: input.password,
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    }),
  });
  const body = await readResponseBody(res);
  if (!res.ok) {
    throw new HttpError(
      res.status === 401 || res.status === 403 ? res.status : 502,
      readErrorMessage(body, `Clawith login returned HTTP ${res.status}`),
    );
  }
  const record = asRecord(body);
  if (!record) throw new HttpError(502, "Clawith login returned an invalid response");
  return record;
}

async function getClawithMe(baseUrl: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(joinUrl(baseUrl, "/api/auth/me"), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return asRecord(await readResponseBody(res));
}

function readAgentList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
  const record = asRecord(body);
  for (const key of ["agents", "items", "data"]) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
    }
  }
  return [];
}

function connectionTargetId(connectionId: string): string {
  return `clawith_connection:${connectionId}`;
}

export function clawithConnectionService(db: Db) {
  const secrets = secretService(db);

  async function ensureConnectionBinding(companyId: string, connectionId: string) {
    try {
      await secrets.createBinding({
        companyId,
        secretId: connectionId,
        targetType: "system",
        targetId: connectionTargetId(connectionId),
        configPath: "clawith.accessToken",
        versionSelector: "latest",
        required: true,
        label: "Clawith connection token",
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) return;
      throw err;
    }
  }

  async function getConnectionSecret(companyId: string, connectionId: string) {
    const secret = await secrets.getById(connectionId);
    if (!secret || secret.companyId !== companyId || secret.status === "deleted") return null;
    if (connectionFromSecret(secret)) return secret;
    return null;
  }

  async function resolveToken(companyId: string, connectionId: string, context?: {
    actorType?: "agent" | "user" | "system";
    actorId?: string | null;
    issueId?: string | null;
    heartbeatRunId?: string | null;
  }) {
    const secret = await getConnectionSecret(companyId, connectionId);
    if (!secret) throw notFound("Clawith connection not found");
    const connection = connectionFromSecret(secret);
    if (!connection) throw notFound("Clawith connection not found");
    if (connection.status === "disabled") throw unprocessable("Clawith connection is disabled");
    if (connection.status === "expired") throw forbidden("Clawith connection expired. Reconnect Clawith.");
    await ensureConnectionBinding(companyId, secret.id);
    const token = await secrets.resolveSecretValue(companyId, secret.id, "latest", {
      consumerType: "system",
      consumerId: connectionTargetId(secret.id),
      configPath: "clawith.accessToken",
      actorType: context?.actorType ?? "system",
      actorId: context?.actorId ?? null,
      issueId: context?.issueId ?? null,
      heartbeatRunId: context?.heartbeatRunId ?? null,
    });
    return { connection, token };
  }

  return {
    list: async (companyId: string): Promise<ClawithConnection[]> => {
      const rows = await db
        .select()
        .from(companySecrets)
        .where(and(
          eq(companySecrets.companyId, companyId),
          ne(companySecrets.status, "deleted"),
        ));
      return rows
        .map(connectionFromSecret)
        .filter((connection): connection is ClawithConnection => connection !== null);
    },

    connect: async (
      companyId: string,
      input: {
        baseUrl: unknown;
        loginIdentifier: unknown;
        password: unknown;
        tenantId?: unknown;
      },
      actor?: { userId?: string | null; agentId?: string | null },
    ) => {
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      const loginIdentifier = asString(input.loginIdentifier);
      const password = asString(input.password);
      if (!loginIdentifier) throw unprocessable("Clawith login identifier is required");
      if (!password) throw unprocessable("Clawith password is required");

      const login = await loginClawith({
        baseUrl,
        loginIdentifier,
        password,
        tenantId: asString(input.tenantId),
      });
      if (asBoolean(login.requires_tenant_selection)) {
        const tenants = Array.isArray(login.tenants)
          ? login.tenants
            .map((tenant) => asRecord(tenant))
            .filter((tenant): tenant is Record<string, unknown> => tenant !== null)
            .map((tenant) => ({
              tenantId: asString(tenant.tenant_id),
              tenantName: asString(tenant.tenant_name) ?? "Organization",
              tenantSlug: asString(tenant.tenant_slug),
              logoUrl: asString(tenant.logo_url),
            }))
          : [];
        return {
          requiresTenantSelection: true as const,
          loginIdentifier,
          tenants,
        };
      }

      const token = asString(login.access_token);
      if (!token) throw new HttpError(502, "Clawith login did not return an access token");
      const user = asRecord(login.user) ?? await getClawithMe(baseUrl, token);
      const identity = asRecord(login.identity);
      const username = userDisplayName(user, identity) ?? loginIdentifier;
      const tenantId = readTenantId(user);
      const tenantName = readTenantName(user, login);
      const label = connectionName(baseUrl, tenantName, username);
      const key = connectionKey(baseUrl, tenantId, username);
      const now = new Date().toISOString();
      const metadata = {
        kind: CLAWITH_CONNECTION_KIND,
        baseUrl,
        label,
        username,
        tenantId,
        tenantName,
        connectionStatus: "connected",
        connectedAt: now,
        lastValidatedAt: now,
      };

      const duplicate = await db
        .select()
        .from(companySecrets)
        .where(and(
          eq(companySecrets.companyId, companyId),
          eq(companySecrets.key, key),
          ne(companySecrets.status, "deleted"),
        ))
        .then((rows) => rows[0] ?? null);

      const secret = duplicate
        ? await (async () => {
            const existingConnection = connectionFromSecret(duplicate);
            if (!existingConnection) throw conflict(`Secret key already exists: ${key}`);
            await secrets.rotate(duplicate.id, { value: token }, actor);
            const updated = await secrets.update(duplicate.id, {
              name: label,
              description: "Clawith connection access token. Managed by Paperclip.",
              providerMetadata: metadata,
              status: "active",
            });
            if (!updated) throw notFound("Clawith connection not found");
            return updated;
          })()
        : await secrets.create(
            companyId,
            {
              name: label,
              key,
              provider: DEFAULT_PROVIDER,
              value: token,
              description: "Clawith connection access token. Managed by Paperclip.",
              providerMetadata: metadata,
            },
            actor,
          );
      await ensureConnectionBinding(companyId, secret.id);
      const connection = connectionFromSecret(secret);
      if (!connection) throw new Error("Created Clawith connection has invalid metadata");
      return { requiresTenantSelection: false as const, connection };
    },

    disconnect: async (companyId: string, connectionId: string) => {
      const secret = await getConnectionSecret(companyId, connectionId);
      if (!secret) throw notFound("Clawith connection not found");
      await secrets.remove(secret.id);
      return { ok: true };
    },

    resolveToken,

    listAgents: async (companyId: string, connectionId: string): Promise<ClawithAgentListOption[]> => {
      const { connection, token } = await resolveToken(companyId, connectionId);
      const res = await fetch(joinUrl(connection.baseUrl, "/api/agents/"), {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await readResponseBody(res);
      if (res.status === 401 || res.status === 403) {
        const secret = await getConnectionSecret(companyId, connectionId);
        if (secret) {
          await secrets.update(secret.id, {
            providerMetadata: {
              ...readMetadata(secret),
              connectionStatus: "expired",
            },
          });
        }
        throw forbidden("Clawith connection expired. Reconnect Clawith.");
      }
      if (!res.ok) {
        throw new HttpError(502, readErrorMessage(body, `Clawith agents returned HTTP ${res.status}`));
      }
      return readAgentList(body)
        .map((agent) => {
          const id = asString(agent.id);
          if (!id) return null;
          return {
            id,
            name: asString(agent.name) ?? id,
            status: asString(agent.status),
            creatorUsername: asString(agent.creator_username),
          };
        })
        .filter((agent): agent is ClawithAgentListOption => agent !== null);
    },
  };
}
