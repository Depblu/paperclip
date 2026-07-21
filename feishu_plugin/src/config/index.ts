import { readFileSync } from "node:fs";
import type { BridgeConfig, CompanyConfig } from "../types.js";

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${key}`);
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${key}: ${v}`);
  return n;
}

function loadCompanies(): CompanyConfig[] {
  const raw = env("BRIDGE_COMPANIES_CONFIG");
  const data = JSON.parse(readFileSync(raw, "utf-8")) as { companies: CompanyConfig[] };
  if (!Array.isArray(data.companies) || data.companies.length === 0) {
    throw new Error("BRIDGE_COMPANIES_CONFIG must contain a non-empty companies array");
  }
  for (const c of data.companies) {
    if (!c.companyId) throw new Error("Each company must have companyId");
    if (!Array.isArray(c.defaultApprovers)) throw new Error(`Company ${c.companyId}: defaultApprovers must be array`);
    c.routing ??= {};
  }
  return data.companies;
}

export function loadConfig(): BridgeConfig {
  return {
    paperclipBaseUrl: env("PAPERCLIP_BASE_URL"),
    paperclipApiKey: env("PAPERCLIP_API_KEY"),
    paperclipPublicUrl: env("PAPERCLIP_PUBLIC_URL", env("PAPERCLIP_BASE_URL")),
    feishuAppId: env("FEISHU_APP_ID"),
    feishuAppSecret: env("FEISHU_APP_SECRET"),
    pollIntervalMs: envInt("POLL_INTERVAL_MS", 5000),
    reconciliationIntervalMs: envInt("RECONCILIATION_INTERVAL_MS", 60000),
    scanConcurrency: envInt("SCAN_CONCURRENCY", 4),
    requestTimeoutMs: envInt("REQUEST_TIMEOUT_MS", 10000),
    sqlitePath: env("SQLITE_PATH", "./data/bridge.db"),
    actionTokenTtlMs: envInt("ACTION_TOKEN_TTL_MS", 24 * 60 * 60 * 1000),
    companies: loadCompanies(),
  };
}
