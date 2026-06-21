import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { asBoolean, asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import type {
  ClawithBridgeConfig,
  ClawithBridgeConnectionMode,
  ClawithBridgeLinkMode,
  ClawithBridgeMode,
  ClawithBridgeWriteBack,
} from "./types.js";

function readEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function normalizeMode(value: unknown): ClawithBridgeMode {
  return "sync";
}

function normalizeConnectionMode(value: unknown): ClawithBridgeConnectionMode {
  return asString(value, "bridge_wake").trim().toLowerCase() === "native_chat"
    ? "native_chat"
    : "bridge_wake";
}

function normalizeLinkMode(value: unknown): ClawithBridgeLinkMode {
  return asString(value, "auto_create").trim().toLowerCase() === "link_existing"
    ? "link_existing"
    : "auto_create";
}

function normalizeWriteBack(value: unknown): ClawithBridgeWriteBack {
  return asString(value, "issue_comment").trim().toLowerCase() === "run_log"
    ? "run_log"
    : "issue_comment";
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.floor(asNumber(value, fallback));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalString(value: unknown): string | null {
  const text = asString(value, "").trim();
  return text.length > 0 ? text : null;
}

export function readClawithBridgeConfig(
  rawConfig: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ClawithBridgeConfig {
  const config = parseObject(rawConfig);
  const envTimeout = env.CLAWITH_BRIDGE_TIMEOUT_SEC
    ? Number.parseInt(env.CLAWITH_BRIDGE_TIMEOUT_SEC, 10)
    : 120;

  return {
    enabled:
      readEnvBoolean(env.CLAWITH_BRIDGE_ENABLED, true) &&
      asBoolean(config.enabled, true),
    connectionMode: normalizeConnectionMode(config.connectionMode),
    baseUrl: asString(config.baseUrl, env.CLAWITH_BRIDGE_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    bridgeSecret: asString(config.bridgeSecret, env.CLAWITH_BRIDGE_SECRET ?? "").trim(),
    clawithConnectionId: readOptionalString(config.clawithConnectionId),
    clawithAuthToken: readOptionalString(config.clawithAuthToken) ?? readOptionalString(env.CLAWITH_AUTH_TOKEN),
    timeoutSec: readPositiveInteger(config.timeoutSec, Number.isFinite(envTimeout) ? envTimeout : 120),
    mode: normalizeMode(config.mode),
    linkMode: normalizeLinkMode(config.linkMode),
    clawithTenantId: readOptionalString(config.clawithTenantId),
    clawithAgentId: readOptionalString(config.clawithAgentId),
    writeBack: normalizeWriteBack(config.writeBack),
    issuer: asString(config.issuer, "paperclip").trim() || "paperclip",
    audience: asString(config.audience, "clawith-bridge").trim() || "clawith-bridge",
  };
}

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "enabled",
        label: "Enabled",
        type: "toggle",
        default: true,
        hint: "Turns this adapter on for the agent. CLAWITH_BRIDGE_ENABLED=false disables all Clawith Bridge runs.",
      },
      {
        key: "connectionMode",
        label: "Connection mode",
        type: "select",
        default: "bridge_wake",
        options: [
          { label: "Bridge wake (legacy)", value: "bridge_wake" },
          { label: "Native Clawith chat", value: "native_chat" },
        ],
        hint: "Native chat uses Clawith's existing web session and websocket chat APIs. Bridge wake keeps the legacy Bridge API path.",
      },
      {
        key: "linkMode",
        label: "Agent link",
        type: "select",
        default: "auto_create",
        options: [
          { label: "Auto-create in Clawith", value: "auto_create" },
          { label: "Link existing Clawith agent", value: "link_existing" },
        ],
        hint: "Auto-create keeps the previous behavior. Link existing lets you select an existing Clawith agent.",
        meta: {
          visibleWhen: { key: "connectionMode", value: "bridge_wake" },
        },
      },
      {
        key: "clawithAgentLink",
        label: "Clawith agent",
        type: "select",
        hint: "Select an existing Clawith agent from the configured Bridge.",
        options: [],
        group: "link",
        meta: {
          visibleWhen: { key: "connectionMode", value: "bridge_wake" },
          remoteOptions: { provider: "adapter", targetFields: ["clawithTenantId", "clawithAgentId"] },
        },
      },
      {
        key: "baseUrl",
        label: "Clawith URL",
        type: "text",
        default: process.env.CLAWITH_BRIDGE_BASE_URL ?? "http://localhost:8008",
        required: true,
        hint: "Clawith base URL. Native chat uses this host's existing /api and /ws endpoints.",
      },
      {
        key: "bridgeSecret",
        label: "Bridge secret",
        type: "text",
        required: true,
        hint: "Shared HS256 secret. Prefer CLAWITH_BRIDGE_SECRET for local development.",
        meta: {
          visibleWhen: { key: "connectionMode", value: "bridge_wake" },
        },
      },
      {
        key: "clawithConnectionId",
        label: "Clawith connection",
        type: "select",
        required: true,
        hint: "Connect Clawith, then select the connection Paperclip should use.",
        options: [],
        group: "native_chat",
        meta: {
          visibleWhen: { key: "connectionMode", value: "native_chat" },
          remoteOptions: { provider: "adapter", targetFields: ["baseUrl"] },
        },
      },
      {
        key: "nativeClawithAgentLink",
        label: "Clawith agent",
        type: "select",
        required: true,
        hint: "Select an existing Clawith agent from the connected Clawith account.",
        options: [],
        group: "native_chat",
        meta: {
          visibleWhen: { key: "connectionMode", value: "native_chat" },
          remoteOptions: { provider: "adapter", targetFields: ["clawithAgentId"] },
        },
      },
      {
        key: "timeoutSec",
        label: "Timeout seconds",
        type: "number",
        default: 120,
        hint: "Wake request timeout.",
      },
      {
        key: "mode",
        label: "Mode",
        type: "select",
        default: "sync",
        options: [
          { label: "Sync", value: "sync" },
        ],
      },
      {
        key: "writeBack",
        label: "Write-back",
        type: "select",
        default: "issue_comment",
        options: [
          { label: "Issue comment", value: "issue_comment" },
          { label: "Run log", value: "run_log" },
        ],
        hint: "Paperclip always stores the run log; issue_comment also lets the normal successful-run summary comment post the result.",
      },
    ],
  };
}
