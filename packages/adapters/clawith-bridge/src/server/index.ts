import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export { execute, buildIdempotencyKey, buildWakeRequest, mapBridgeResponseToResult } from "./execute.js";
export { testEnvironment } from "./test.js";
export { readClawithBridgeConfig, getConfigSchema } from "./config.js";
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
    return { clawithSessionId };
  },
  serialize(params) {
    if (!params) return null;
    const clawithSessionId =
      readNonEmptyString(params.clawithSessionId) ?? readNonEmptyString(params.clawith_session_id);
    return clawithSessionId ? { clawithSessionId } : null;
  },
  getDisplayId(params) {
    if (!params) return null;
    return readNonEmptyString(params.clawithSessionId) ?? readNonEmptyString(params.clawith_session_id);
  },
};
