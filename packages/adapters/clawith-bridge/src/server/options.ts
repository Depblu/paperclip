import type {
  AdapterConfigRemoteOptionsContext,
  AdapterConfigRemoteOptionsResult,
} from "@paperclipai/adapter-utils";
import { readClawithBridgeConfig } from "./config.js";
import { signBridgeJwt } from "./jwt.js";

interface ClawithAgentOption {
  tenant_id?: unknown;
  tenant_name?: unknown;
  agent_id?: unknown;
  agent_name?: unknown;
  status?: unknown;
}

interface NativeAgentOption {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  creator_username?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function linkOptionsUrl(baseUrl: string): string {
  return `${baseUrl}/api/bridge/agents/link-options`;
}

function nativeAgentsUrl(baseUrl: string): string {
  return `${baseUrl}/api/agents/`;
}

function readNativeAgents(body: unknown): NativeAgentOption[] {
  if (Array.isArray(body)) return body as NativeAgentOption[];
  if (!body || typeof body !== "object") return [];
  const record = body as { agents?: unknown; items?: unknown; data?: unknown };
  if (Array.isArray(record.agents)) return record.agents as NativeAgentOption[];
  if (Array.isArray(record.items)) return record.items as NativeAgentOption[];
  if (Array.isArray(record.data)) return record.data as NativeAgentOption[];
  return [];
}

async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `Clawith options returned HTTP ${res.status}`;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return fallback;
  try {
    const body = JSON.parse(text) as { detail?: unknown; error?: unknown; message?: unknown };
    return asString(body.detail) ?? asString(body.error) ?? asString(body.message) ?? fallback;
  } catch {
    return text;
  }
}

export async function getConfigFieldOptions(
  ctx: AdapterConfigRemoteOptionsContext,
): Promise<AdapterConfigRemoteOptionsResult> {
  if (ctx.fieldKey !== "clawithAgentLink" && ctx.fieldKey !== "nativeClawithAgentLink") return { options: [] };

  const config = readClawithBridgeConfig(ctx.config);
  if (ctx.fieldKey === "nativeClawithAgentLink") {
    if (config.connectionMode !== "native_chat") return { options: [] };
    if (!config.baseUrl || !config.clawithAuthToken) return { options: [] };

    const res = await fetch(nativeAgentsUrl(config.baseUrl), {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.clawithAuthToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res));
    }
    const agents = readNativeAgents(await res.json());
    return {
      options: agents
        .map((agent) => {
          const agentId = asString(agent.id);
          if (!agentId) return null;
          const agentName = asString(agent.name) ?? agentId;
          const creatorName = asString(agent.creator_username);
          const status = asString(agent.status);
          return {
            label: agentName,
            value: agentId,
            ...(creatorName ? { group: creatorName } : {}),
            ...(status ? { description: status } : {}),
            setConfig: {
              clawithAgentId: agentId,
            },
          };
        })
        .filter((option): option is NonNullable<typeof option> => option !== null),
    };
  }

  if (config.connectionMode === "native_chat") return { options: [] };
  if (!config.baseUrl || !config.bridgeSecret) return { options: [] };

  const agentId = "config-options";
  const runId = "config-options";
  const token = signBridgeJwt({
    secret: config.bridgeSecret,
    issuer: config.issuer,
    audience: config.audience,
    subject: agentId,
    companyId: ctx.companyId,
    agentId,
    issueId: null,
    runId,
  });
  const res = await fetch(linkOptionsUrl(config.baseUrl), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "x-paperclip-run-id": runId,
      "x-idempotency-key": `${ctx.companyId}:${agentId}:link-options`,
      "x-request-id": "config-options",
    },
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  const body = await res.json() as { agents?: unknown };
  const agents = Array.isArray(body.agents) ? body.agents as ClawithAgentOption[] : [];
  return {
    options: agents
      .map((agent) => {
        const tenantId = asString(agent.tenant_id);
        const agentIdValue = asString(agent.agent_id);
        if (!tenantId || !agentIdValue) return null;
        const agentName = asString(agent.agent_name) ?? agentIdValue;
        const tenantName = asString(agent.tenant_name) ?? tenantId;
        const status = asString(agent.status);
        return {
          label: `${agentName} (${tenantName})`,
          value: `${tenantId}:${agentIdValue}`,
          group: tenantName,
          description: status,
          setConfig: {
            clawithTenantId: tenantId,
            clawithAgentId: agentIdValue,
          },
        };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null),
  };
}
