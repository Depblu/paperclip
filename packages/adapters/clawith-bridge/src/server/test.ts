import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { readClawithBridgeConfig } from "./config.js";
import { signBridgeJwt } from "./jwt.js";
import { getConfigFieldOptions } from "./options.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function bridgeLinkCheckUrl(baseUrl: string): string {
  return `${baseUrl}/api/bridge/agents/link-check`;
}

function nativeSessionsUrl(baseUrl: string, agentId: string): string {
  return `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/sessions?scope=mine`;
}

async function readLinkCheckResponse(res: Response): Promise<{ tenantId: string | null; agentId: string | null }> {
  try {
    const body = await res.json() as { clawith_tenant_id?: unknown; clawith_agent_id?: unknown };
    return {
      tenantId: typeof body.clawith_tenant_id === "string" ? body.clawith_tenant_id : null,
      agentId: typeof body.clawith_agent_id === "string" ? body.clawith_agent_id : null,
    };
  } catch {
    return { tenantId: null, agentId: null };
  }
}

async function readHealthResponse(res: Response): Promise<{ bridgeEnabled: boolean | null; secretConfigured: boolean | null }> {
  try {
    const body = await res.json() as { bridge_enabled?: unknown; secret_configured?: unknown };
    return {
      bridgeEnabled: typeof body.bridge_enabled === "boolean" ? body.bridge_enabled : null,
      secretConfigured: typeof body.secret_configured === "boolean" ? body.secret_configured : null,
    };
  } catch {
    return { bridgeEnabled: null, secretConfigured: null };
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = readClawithBridgeConfig(ctx.config);

  if (!config.enabled) {
    checks.push({
      code: "clawith_bridge_disabled",
      level: "error",
      message: "Clawith Bridge adapter is disabled.",
      hint: "Set enabled=true and CLAWITH_BRIDGE_ENABLED=true before running this agent.",
    });
  }

  if (!config.baseUrl) {
    checks.push({
      code: "clawith_bridge_base_url_missing",
      level: "error",
      message: "Clawith Bridge requires a base URL.",
      hint: "Set adapterConfig.baseUrl or CLAWITH_BRIDGE_BASE_URL.",
    });
  }

  let baseUrl: URL | null = null;
  if (config.baseUrl) {
    try {
      baseUrl = new URL(config.baseUrl);
    } catch {
      checks.push({
        code: "clawith_bridge_base_url_invalid",
        level: "error",
        message: `Invalid Clawith Bridge URL: ${config.baseUrl}`,
      });
    }
  }

  if (baseUrl && baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    checks.push({
      code: "clawith_bridge_base_url_protocol",
      level: "error",
      message: `Unsupported Clawith Bridge URL protocol: ${baseUrl.protocol}`,
      hint: "Use http:// or https://.",
    });
  }

  if (config.connectionMode === "native_chat") {
    if (!config.clawithAuthToken) {
      checks.push({
        code: "clawith_native_chat_token_missing",
        level: "error",
        message: "Clawith native chat requires a connected Clawith account.",
        hint: "Connect or reconnect Clawith in this adapter configuration.",
      });
    } else {
      checks.push({
        code: "clawith_native_chat_token_configured",
        level: "info",
        message: "Clawith connection token is available.",
      });
    }

    if (!config.clawithAgentId) {
      checks.push({
        code: "clawith_native_chat_agent_id_missing",
        level: "error",
        message: "Clawith native chat requires an existing Clawith agent ID.",
      });
    }

    if (
      baseUrl &&
      (baseUrl.protocol === "http:" || baseUrl.protocol === "https:") &&
      config.clawithAuthToken &&
      config.clawithAgentId
    ) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(nativeSessionsUrl(config.baseUrl, config.clawithAgentId), {
          method: "GET",
          headers: { authorization: `Bearer ${config.clawithAuthToken}` },
          signal: controller.signal,
        });
        checks.push({
          code: res.ok ? "clawith_native_chat_sessions_ok" : "clawith_native_chat_sessions_failed",
          level: res.ok ? "info" : "error",
          message: res.ok
            ? "Clawith native session API is reachable for the selected agent."
            : `Clawith native session API returned HTTP ${res.status}.`,
        });
      } catch (err) {
        checks.push({
          code: "clawith_native_chat_sessions_failed",
          level: "warn",
          message: err instanceof Error ? err.message : "Clawith native session probe failed",
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  if (!config.bridgeSecret) {
    checks.push({
      code: "clawith_bridge_secret_missing",
      level: "error",
      message: "Clawith Bridge requires a shared secret.",
      hint: "Set adapterConfig.bridgeSecret or CLAWITH_BRIDGE_SECRET.",
    });
  } else {
    checks.push({
      code: "clawith_bridge_secret_configured",
      level: "info",
      message: "Bridge secret is configured.",
    });
  }

  if (config.linkMode === "link_existing") {
    if (!config.clawithTenantId || !config.clawithAgentId) {
      checks.push({
        code: "clawith_bridge_agent_link_missing",
        level: "error",
        message: "Select a Clawith agent.",
      });
    }
  }

  if (baseUrl && (baseUrl.protocol === "http:" || baseUrl.protocol === "https:")) {
    const healthUrl = new URL("/api/bridge/health", baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(healthUrl, { method: "GET", signal: controller.signal });
      checks.push({
        code: res.ok ? "clawith_bridge_health_ok" : "clawith_bridge_health_unexpected_status",
        level: res.ok ? "info" : "warn",
        message: `Bridge health returned HTTP ${res.status}.`,
      });
      if (res.ok) {
        const health = await readHealthResponse(res);
        if (health.bridgeEnabled === false) {
          checks.push({
            code: "clawith_bridge_api_disabled",
            level: "error",
            message: "Clawith Bridge API is disabled.",
            hint: "Set BRIDGE_ENABLED=true in the Clawith backend environment and restart Clawith.",
          });
        }
        if (health.secretConfigured === false) {
          checks.push({
            code: "clawith_bridge_api_secret_missing",
            level: "error",
            message: "Clawith Bridge shared secret is not configured.",
            hint: "Set BRIDGE_SHARED_SECRET to match this adapter config and restart Clawith.",
          });
        }
      }
    } catch (err) {
      checks.push({
        code: "clawith_bridge_health_failed",
        level: "warn",
        message: err instanceof Error ? err.message : "Bridge health probe failed",
        hint: "This does not block saving the agent, but wake runs need network access to the Bridge.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (
    baseUrl &&
    (baseUrl.protocol === "http:" || baseUrl.protocol === "https:") &&
    config.bridgeSecret &&
    config.linkMode === "link_existing"
  ) {
    try {
      const result = await getConfigFieldOptions({
        companyId: ctx.companyId,
        adapterType: ctx.adapterType,
        fieldKey: "clawithAgentLink",
        config: { ...config },
      });
      checks.push({
        code: result.options.length > 0
          ? "clawith_bridge_link_options_ok"
          : "clawith_bridge_link_options_empty",
        level: result.options.length > 0 ? "info" : "warn",
        message: result.options.length > 0
          ? `Loaded ${result.options.length} Clawith agent option(s).`
          : "No existing Clawith agents were returned by Bridge.",
      });
    } catch (err) {
      checks.push({
        code: "clawith_bridge_link_options_failed",
        level: "error",
        message: err instanceof Error ? err.message : "Failed to load existing Clawith agents.",
      });
    }
  }

  if (
    baseUrl &&
    config.bridgeSecret &&
    config.linkMode === "link_existing" &&
    config.clawithTenantId &&
    config.clawithAgentId
  ) {
    const agentId = "environment-test";
    const runId = "environment-test";
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(bridgeLinkCheckUrl(config.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-paperclip-run-id": runId,
          "x-idempotency-key": `${ctx.companyId}:${agentId}:link-check`,
          "x-request-id": "environment-test",
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          agent_id: agentId,
          link_mode: config.linkMode,
          clawith_tenant_id: config.clawithTenantId,
          clawith_agent_id: config.clawithAgentId,
        }),
        signal: controller.signal,
      });
      const linkTarget = res.ok
        ? await readLinkCheckResponse(res)
        : { tenantId: null, agentId: null };
      checks.push({
        code: res.ok ? "clawith_bridge_link_target_ok" : "clawith_bridge_link_target_failed",
        level: res.ok ? "info" : "error",
        message: res.ok
          ? `Clawith link target is valid: ${linkTarget.agentId ?? config.clawithAgentId}.`
          : `Clawith link target check returned HTTP ${res.status}.`,
        detail: res.ok
          ? `clawith_tenant_id=${linkTarget.tenantId ?? config.clawithTenantId} clawith_agent_id=${linkTarget.agentId ?? config.clawithAgentId}`
          : null,
      });
    } catch (err) {
      checks.push({
        code: "clawith_bridge_link_target_failed",
        level: "warn",
        message: err instanceof Error ? err.message : "Clawith link target check failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
