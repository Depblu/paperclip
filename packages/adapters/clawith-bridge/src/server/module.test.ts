import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { sessionCodec, testEnvironment } from "./index.js";
import { buildClawithBridgeConfig } from "../ui/build-config.js";
import { parseClawithBridgeStdoutLine } from "../ui/parse-stdout.js";

describe("clawith bridge adapter module", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips Clawith session params", () => {
    expect(sessionCodec.deserialize({ clawith_session_id: "session-1" })).toEqual({
      clawithSessionId: "session-1",
    });
    expect(sessionCodec.serialize({ clawithSessionId: "session-1" })).toEqual({
      clawithSessionId: "session-1",
    });
    expect(sessionCodec.getDisplayId?.({ clawithSessionId: "session-1" })).toBe("session-1");
    expect(sessionCodec.deserialize({})).toBeNull();
    expect(sessionCodec.serialize({ clawithSessionId: " " })).toBeNull();
  });

  it("builds adapter config from schema values", () => {
    const values: CreateConfigValues = {
      adapterType: "clawith_bridge",
      cwd: "",
      promptTemplate: "",
      model: "",
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      fastMode: false,
      dangerouslyBypassSandbox: false,
      command: "",
      args: "",
      extraArgs: "",
      envVars: "",
      envBindings: {},
      url: "",
      bootstrapPrompt: "",
      maxTurnsPerRun: 0,
      heartbeatEnabled: false,
      intervalSec: 0,
      adapterSchemaValues: {
        baseUrl: "http://localhost:8008",
        bridgeSecret: "dev-secret",
        timeoutSec: 120,
      },
    };

    expect(buildClawithBridgeConfig(values)).toEqual({
      baseUrl: "http://localhost:8008",
      bridgeSecret: "dev-secret",
      timeoutSec: 120,
    });
  });

  it("parses Bridge stdout into transcript entries", () => {
    expect(parseClawithBridgeStdoutLine("[clawith-bridge] wake accepted", "ts-1")).toEqual([
      { kind: "system", ts: "ts-1", text: "wake accepted" },
    ]);
    expect(parseClawithBridgeStdoutLine("final result", "ts-2")).toEqual([
      { kind: "assistant", ts: "ts-2", text: "final result" },
    ]);
    expect(parseClawithBridgeStdoutLine("   ", "ts-3")).toEqual([]);
  });

  it("reports environment errors for missing required config", async () => {
    const result = await testEnvironment({
      adapterType: "clawith_bridge",
      companyId: "company-1",
      config: {},
    });

    expect(result.status).toBe("fail");
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "clawith_bridge_base_url_missing",
        "clawith_bridge_secret_missing",
      ]),
    );
  });

  it("reports Bridge health probe success when reachable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await testEnvironment({
      adapterType: "clawith_bridge",
      companyId: "company-1",
      config: {
        baseUrl: "http://localhost:8008",
        bridgeSecret: "dev-secret",
      },
    });

    expect(result.status).toBe("pass");
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "clawith_bridge_secret_configured",
        "clawith_bridge_health_ok",
      ]),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:8008/api/bridge/health", expect.any(Object));
  });
});
