import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export { execute, buildIdempotencyKey, buildWakeRequest, mapBridgeResponseToResult } from "./execute.js";
export { testEnvironment } from "./test.js";
export { readClawithBridgeConfig, getConfigSchema } from "./config.js";
export { getConfigFieldOptions } from "./options.js";
export { signBridgeJwt } from "./jwt.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const clawithSessionId =
      readNonEmptyString(record.clawithSessionId) ?? readNonEmptyString(record.clawith_session_id);
    if (!clawithSessionId) return null;
    const connectionMode = readNonEmptyString(record.connectionMode) ?? readNonEmptyString(record.connection_mode);
    const clawithAgentId =
      readNonEmptyString(record.clawithAgentId) ?? readNonEmptyString(record.clawith_agent_id);
    return {
      ...(connectionMode ? { connectionMode } : {}),
      ...(clawithAgentId ? { clawithAgentId } : {}),
      clawithSessionId,
    };
  },
  serialize(params) {
    if (!params) return null;
    const clawithSessionId =
      readNonEmptyString(params.clawithSessionId) ?? readNonEmptyString(params.clawith_session_id);
    if (!clawithSessionId) return null;
    const connectionMode = readNonEmptyString(params.connectionMode) ?? readNonEmptyString(params.connection_mode);
    const clawithAgentId =
      readNonEmptyString(params.clawithAgentId) ?? readNonEmptyString(params.clawith_agent_id);
    return {
      ...(connectionMode ? { connectionMode } : {}),
      ...(clawithAgentId ? { clawithAgentId } : {}),
      clawithSessionId,
    };
  },
  getDisplayId(params) {
    if (!params) return null;
    return readNonEmptyString(params.clawithSessionId) ?? readNonEmptyString(params.clawith_session_id);
  },
};
