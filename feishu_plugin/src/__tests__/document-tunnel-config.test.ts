import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../config/store.js";
import { loadConfig } from "../config/index.js";

const ENV_KEYS = [
  "PAPERCLIP_BASE_URL",
  "PAPERCLIP_API_KEY",
  "PAPERCLIP_PUBLIC_URL",
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "BRIDGE_COMPANIES_CONFIG",
  "DOCUMENT_TUNNEL_AUTO_START",
];

let savedEnv: Record<string, string | undefined>;
let tempDir: string;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  tempDir = mkdtempSync(join(tmpdir(), "tunnel-config-"));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(tempDir, { recursive: true, force: true });
});

function setEnvMode(autoStart?: string): void {
  process.env.PAPERCLIP_BASE_URL = "http://localhost:3100";
  process.env.PAPERCLIP_API_KEY = "pcp_board_test";
  process.env.FEISHU_APP_ID = "cli_test";
  process.env.FEISHU_APP_SECRET = "secret";
  const companiesPath = join(tempDir, "companies.json");
  writeFileSync(
    companiesPath,
    JSON.stringify({
      companies: [{ companyId: "co-1", defaultApprovers: [], routing: {} }],
    }),
    "utf-8",
  );
  process.env.BRIDGE_COMPANIES_CONFIG = companiesPath;
  if (autoStart === undefined) delete process.env.DOCUMENT_TUNNEL_AUTO_START;
  else process.env.DOCUMENT_TUNNEL_AUTO_START = autoStart;
}

describe("document tunnel config", () => {
  it("ConfigStore defaults documentTunnelAutoStart to false in a fresh directory", () => {
    const dir = join(tempDir, "store-fresh");
    const store = new ConfigStore(dir);
    expect(store.getGlobal().documentTunnelAutoStart).toBe(false);
  });

  it("ConfigStore persists documentTunnelAutoStart=true across instances", () => {
    const dir = join(tempDir, "store-save");
    const store = new ConfigStore(dir);
    store.saveGlobal({ ...store.getGlobal(), documentTunnelAutoStart: true });
    const reloaded = new ConfigStore(dir);
    expect(reloaded.getGlobal().documentTunnelAutoStart).toBe(true);
  });

  it.each([
    ["true", true],
    ["1", true],
    ["false", false],
    ["0", false],
    ["TRUE", true],
    [" false ", false],
  ] as const)("env loadConfig parses DOCUMENT_TUNNEL_AUTO_START=%s as %s", (raw, expected) => {
    setEnvMode(raw);
    expect(loadConfig().documentTunnelAutoStart).toBe(expected);
  });

  it("env loadConfig defaults to false when DOCUMENT_TUNNEL_AUTO_START is unset", () => {
    setEnvMode(undefined);
    expect(loadConfig().documentTunnelAutoStart).toBe(false);
  });

  it("env loadConfig throws on an invalid DOCUMENT_TUNNEL_AUTO_START", () => {
    setEnvMode("yes");
    expect(() => loadConfig()).toThrow(/DOCUMENT_TUNNEL_AUTO_START/);
  });
});
