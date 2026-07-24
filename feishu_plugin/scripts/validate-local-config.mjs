#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";

const PLACEHOLDER_RE = /^REPLACE_WITH_/;
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const ROOT = resolve(SCRIPT_DIR, "..");

const args = process.argv.slice(2);
const examplesMode = args.includes("--examples");
const probeMode = args.includes("--probe-paperclip");

let errors = [];
function err(msg) { errors.push(msg); }

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function maskHost(url) {
  try { return new URL(url).host; } catch { return "<无效URL>"; }
}

function checkPositiveInt(label, value) {
  if (value === undefined || value === "") { err(`${label} 未配置`); return; }
  if (PLACEHOLDER_RE.test(value)) { err(`${label} 仍为占位符`); return; }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) err(`${label} 必须为正整数，当前值: ${value}`);
}

function checkUrl(label, value) {
  if (value === undefined || value === "") { err(`${label} 未配置`); return; }
  if (PLACEHOLDER_RE.test(value)) { err(`${label} 仍为占位符`); return; }
  try { new URL(value); } catch { err(`${label} 不是有效 URL: ${value}`); }
}

function validateEnv(vars, required) {
  for (const key of required) {
    const v = vars[key];
    if (v === undefined || v === "") err(`必填变量 ${key} 未配置`);
    else if (PLACEHOLDER_RE.test(v)) err(`${key} 仍为占位符，请填入真实值`);
  }
  checkUrl("PAPERCLIP_BASE_URL", vars.PAPERCLIP_BASE_URL);
  checkUrl("PAPERCLIP_PUBLIC_URL", vars.PAPERCLIP_PUBLIC_URL);

  const apiKey = vars.PAPERCLIP_API_KEY || "";
  if (apiKey && !PLACEHOLDER_RE.test(apiKey) && !apiKey.startsWith("pcp_board_")) {
    err("PAPERCLIP_API_KEY 应以 pcp_board_ 开头");
  }
  const appId = vars.FEISHU_APP_ID || "";
  if (appId && !PLACEHOLDER_RE.test(appId) && !appId.startsWith("cli_")) {
    err("FEISHU_APP_ID 应以 cli_ 开头");
  }

  for (const k of ["POLL_INTERVAL_MS","RECONCILIATION_INTERVAL_MS","SCAN_CONCURRENCY","REQUEST_TIMEOUT_MS","ACTION_TOKEN_TTL_MS"]) {
    if (vars[k] !== undefined && vars[k] !== "") checkPositiveInt(k, vars[k]);
  }

  if (vars.DOCUMENT_TUNNEL_AUTO_START !== undefined && vars.DOCUMENT_TUNNEL_AUTO_START !== "") {
    const normalized = vars.DOCUMENT_TUNNEL_AUTO_START.trim().toLowerCase();
    if (!["true", "false", "1", "0"].includes(normalized)) {
      err(`DOCUMENT_TUNNEL_AUTO_START 必须为 true/false/1/0，当前值: ${vars.DOCUMENT_TUNNEL_AUTO_START}`);
    }
  }
}

function validateCompanies(filePath) {
  if (!existsSync(filePath)) { err(`Company 配置文件不存在: ${filePath}`); return null; }
  let data;
  try { data = JSON.parse(readFileSync(filePath, "utf-8")); }
  catch (e) { err(`Company 配置 JSON 解析失败: ${e.message}`); return null; }

  if (!Array.isArray(data.companies) || data.companies.length === 0) {
    err("companies 数组不能为空"); return null;
  }
  for (const c of data.companies) {
    if (!c.companyId || PLACEHOLDER_RE.test(c.companyId)) {
      err(`companyId 缺失或仍为占位符`);
    }
    if (!Array.isArray(c.defaultApprovers)) {
      err(`Company ${c.companyId}: defaultApprovers 必须为数组`);
    }
    if (c.routing && typeof c.routing === "object") {
      for (const [type, route] of Object.entries(c.routing)) {
        if (!route.approvers || !Array.isArray(route.approvers) || route.approvers.length === 0) {
          err(`路由 ${type}: approvers 不能为空`);
          continue;
        }
        for (const a of route.approvers) {
          if (!a.openId || PLACEHOLDER_RE.test(a.openId)) err(`路由 ${type}: 审批人 openId 缺失或为占位符`);
          if (!a.name || PLACEHOLDER_RE.test(a.name)) err(`路由 ${type}: 审批人 name 缺失或为占位符`);
        }
      }
    }
  }
  return data;
}

function checkSqliteDir(sqlitePath) {
  const dir = dirname(resolve(ROOT, sqlitePath));
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch {
    err(`SQLite 目录不可写: ${dir}`);
  }
}

function printSummary(vars, companiesData) {
  console.log("\n=== 配置摘要（脱敏） ===");
  console.log(`PAPERCLIP_BASE_URL host: ${maskHost(vars.PAPERCLIP_BASE_URL || "")}`);
  console.log(`PAPERCLIP_PUBLIC_URL host: ${maskHost(vars.PAPERCLIP_PUBLIC_URL || "")}`);
  console.log(`PAPERCLIP_API_KEY: ${vars.PAPERCLIP_API_KEY && !PLACEHOLDER_RE.test(vars.PAPERCLIP_API_KEY) ? "已配置" : "未配置/占位符"}`);
  console.log(`FEISHU_APP_ID: ${vars.FEISHU_APP_ID && !PLACEHOLDER_RE.test(vars.FEISHU_APP_ID) ? "已配置" : "未配置/占位符"}`);
  console.log(`FEISHU_APP_SECRET: ${vars.FEISHU_APP_SECRET && !PLACEHOLDER_RE.test(vars.FEISHU_APP_SECRET) ? "已配置" : "未配置/占位符"}`);
  if (companiesData) {
    console.log(`Company 数量: ${companiesData.companies.length}`);
    for (const c of companiesData.companies) {
      const types = c.routing ? Object.keys(c.routing) : [];
      const approverCount = c.routing
        ? Object.values(c.routing).reduce((n, r) => n + (r.approvers?.length || 0), 0)
        : 0;
      console.log(`  Company ${c.companyId?.slice(0, 8) ?? "?"}... 路由: [${types.join(", ")}] 审批人: ${approverCount}`);
    }
  }
  console.log("========================\n");
}

async function probePaperclip(vars, companiesData) {
  const base = vars.PAPERCLIP_BASE_URL;
  const key = vars.PAPERCLIP_API_KEY;
  console.log("=== Paperclip 探测 ===");
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10000) });
    console.log(`/api/health: HTTP ${res.status} ${res.ok ? "✓" : "✗"}`);
  } catch (e) {
    console.log(`/api/health: 请求失败 (${e.message})`);
  }
  if (companiesData) {
    for (const c of companiesData.companies) {
      try {
        const res = await fetch(`${base}/api/companies/${c.companyId}/approvals?status=pending`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
        console.log(`Company ${c.companyId?.slice(0, 8)}... pending approvals: HTTP ${res.status} ${res.ok ? "✓" : "✗"}`);
      } catch (e) {
        console.log(`Company ${c.companyId?.slice(0, 8)}... pending approvals: 请求失败 (${e.message})`);
      }
    }
  }
  console.log("======================\n");
}

async function main() {
  if (examplesMode) {
    const envExample = resolve(ROOT, ".env.example");
    const companiesExample = resolve(ROOT, "config/companies.example.json");
    if (!existsSync(envExample)) { err(".env.example 不存在"); }
    else {
      const vars = parseEnvFile(envExample);
      const required = ["PAPERCLIP_BASE_URL","PAPERCLIP_API_KEY","FEISHU_APP_ID","FEISHU_APP_SECRET","BRIDGE_COMPANIES_CONFIG"];
      for (const k of required) {
        if (vars[k] === undefined) err(`.env.example 缺少 ${k}`);
      }
    }
    if (!existsSync(companiesExample)) { err("config/companies.example.json 不存在"); }
    else {
      try {
        const data = JSON.parse(readFileSync(companiesExample, "utf-8"));
        if (!Array.isArray(data.companies) || data.companies.length === 0) err("示例 companies 数组为空");
        else {
          const c = data.companies[0];
          if (!c.companyId) err("示例缺少 companyId");
          if (!c.routing || typeof c.routing !== "object") err("示例缺少 routing");
        }
      } catch (e) { err(`示例 JSON 解析失败: ${e.message}`); }
    }
    if (errors.length > 0) {
      console.error("示例文件校验失败:");
      for (const e of errors) console.error(`  ✗ ${e}`);
      process.exit(1);
    }
    console.log("✓ 示例文件结构校验通过");
    process.exit(0);
  }

  const envLocalPath = resolve(ROOT, ".env.local");
  if (!existsSync(envLocalPath)) { err(".env.local 不存在，请先从 .env.example 复制"); }

  let vars = {};
  if (errors.length === 0) vars = parseEnvFile(envLocalPath);

  const required = ["PAPERCLIP_BASE_URL","PAPERCLIP_PUBLIC_URL","PAPERCLIP_API_KEY","FEISHU_APP_ID","FEISHU_APP_SECRET","BRIDGE_COMPANIES_CONFIG"];
  validateEnv(vars, required);

  const companiesPath = resolve(ROOT, vars.BRIDGE_COMPANIES_CONFIG || "./config/companies.local.json");
  const companiesData = validateCompanies(companiesPath);

  if (vars.SQLITE_PATH) checkSqliteDir(vars.SQLITE_PATH);
  else checkSqliteDir("./data/bridge.db");

  if (errors.length > 0) {
    console.error("配置校验失败，请修正以下问题:");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  printSummary(vars, companiesData);
  console.log("✓ 配置校验通过");

  if (probeMode) await probePaperclip(vars, companiesData);
}

main();
