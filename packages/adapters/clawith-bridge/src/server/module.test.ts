import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { getConfigFieldOptions, sessionCodec, testEnvironment } from "./index.js";
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      bridge_enabled: true,
      secret_configured: true,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

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

  it("reports missing selected Clawith agent without probing the target", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bridge_enabled: true,
        secret_configured: true,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [
          {
            tenant_id: "tenant-1",
            tenant_name: "Tenant One",
            agent_id: "agent-1",
            agent_name: "Support Agent",
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    const result = await testEnvironment({
      adapterType: "clawith_bridge",
      companyId: "company-1",
      config: {
        baseUrl: "http://localhost:8008",
        bridgeSecret: "dev-secret",
        linkMode: "link_existing",
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "clawith_bridge_agent_link_missing",
        "clawith_bridge_link_options_ok",
      ]),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("reports disabled Bridge API for link_existing options", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bridge_enabled: false,
        secret_configured: false,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Bridge API disabled" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }));

    const result = await testEnvironment({
      adapterType: "clawith_bridge",
      companyId: "company-1",
      config: {
        baseUrl: "http://localhost:8008",
        bridgeSecret: "dev-secret",
        linkMode: "link_existing",
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "clawith_bridge_api_disabled",
        "clawith_bridge_api_secret_missing",
        "clawith_bridge_link_options_failed",
      ]),
    );
    expect(result.checks.find((check) => check.code === "clawith_bridge_link_options_failed")?.message)
      .toBe("Bridge API disabled");
  });

  it("probes configured link_existing targets without creating a mapping", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bridge_enabled: true,
        secret_configured: true,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [
          {
            tenant_id: "cw-tenant-1",
            tenant_name: "Tenant One",
            agent_id: "cw-agent-1",
            agent_name: "Support Agent",
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "valid" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    const result = await testEnvironment({
      adapterType: "clawith_bridge",
      companyId: "company-1",
      config: {
        baseUrl: "http://localhost:8008",
        bridgeSecret: "dev-secret",
        linkMode: "link_existing",
        clawithTenantId: "cw-tenant-1",
        clawithAgentId: "cw-agent-1",
      },
    });

    expect(result.status).toBe("pass");
    expect(result.checks.map((check) => check.code)).toContain("clawith_bridge_link_target_ok");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:8008/api/bridge/agents/link-check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          company_id: "company-1",
          agent_id: "environment-test",
          link_mode: "link_existing",
          clawith_tenant_id: "cw-tenant-1",
          clawith_agent_id: "cw-agent-1",
        }),
      }),
    );
  });

  it("loads existing Clawith agents for the link dropdown", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      agents: [
        {
          tenant_id: "tenant-1",
          tenant_name: "Tenant One",
          agent_id: "agent-1",
          agent_name: "Support Agent",
          status: "idle",
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await getConfigFieldOptions({
      companyId: "company-1",
      adapterType: "clawith_bridge",
      fieldKey: "clawithAgentLink",
      config: {
        baseUrl: "http://localhost:8008",
        bridgeSecret: "dev-secret",
      },
    });

    expect(result.options).toEqual([
      {
        label: "Support Agent (Tenant One)",
        value: "tenant-1:agent-1",
        group: "Tenant One",
        description: "idle",
        setConfig: {
          clawithTenantId: "tenant-1",
          clawithAgentId: "agent-1",
        },
      },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8008/api/bridge/agents/link-options",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
