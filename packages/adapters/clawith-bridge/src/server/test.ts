import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { readClawithBridgeConfig } from "./config.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
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

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
