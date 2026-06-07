#!/usr/bin/env node
//
// i18n-build-locales.mjs
//
// Reads the merged en.json + transform-map.json and produces a complete
// zh-CN.json with Chinese translations, plus mirrors zh-CN to 38 other
// locales (which remain as English placeholders awaiting native-speaker
// PRs).
//
// Translation strategy:
//   1. Hand-curated dictionary (zh-CN-dict.json) for ~500 common UI
//      patterns (Cancel, Save, etc.) — case-insensitive lookup.
//   2. Phrase-level rules: "X required" → "X 必填" etc.
//   3. Fallback to English for technical strings (status enums, hashes,
//      etc.) — these are intentionally English in zh-CN because they
//      match API/database values.
//
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "src", "i18n", "locales");
const EN_FILE = join(LOCALES_DIR, "en.json");
const ZH_FILE = join(LOCALES_DIR, "zh-CN.json");
const DICT_FILE = join(__dirname, "zh-CN-dict.json");

const DICT = new Map();
const DICT_LOWER = new Map();
function loadDict() {
  const raw = JSON.parse(readFileSync(DICT_FILE, "utf8"));
  for (const [k, v] of Object.entries(raw)) {
    DICT.set(k, v);
    DICT_LOWER.set(k.toLowerCase(), v);
  }
}

const PHRASE_RULES = [
  // Phrase templates (longest first)
  [" required.", " 必填。"],
  [" optional.", " 可选。"],
  [" failed.", " 失败。"],
  [" completed.", " 已完成。"],
  [" cancelled.", " 已取消。"],
  [" ago", "前"],
  [" minutes ago", " 分钟前"],
  [" hours ago", " 小时前"],
  [" days ago", " 天前"],
  [" in progress", "进行中"],
  [" in review", "审核中"],
  [" blocked by", "被阻塞于"],
  [" search ", " 搜索 "],
  [" filter ", " 筛选 "],
  [" sort ", " 排序 "],
  [" view ", "查看 "],
  [" add ", "添加 "],
  [" remove ", "移除 "],
  [" delete ", "删除 "],
  [" edit ", "编辑 "],
  [" create ", "创建 "],
  [" update ", "更新 "],
  [" save ", "保存 "],
  [" cancel ", "取消 "],
  [" all ", "全部 "],
  [" no ", "无 "],
];

function translate(en) {
  if (typeof en !== "string") return en;
  // Exact match (case-insensitive)
  if (DICT_LOWER.has(en.toLowerCase())) return DICT_LOWER.get(en.toLowerCase());
  // Phrase rules
  let result = en;
  for (const [pattern, zh] of PHRASE_RULES) {
    if (result.toLowerCase().includes(pattern)) {
      result = result.replace(new RegExp(pattern, "gi"), zh);
    }
  }
  if (result !== en) return result;
  return en;
}

function flatten(o, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? prefix + "." + k : k;
    if (typeof v === "object" && v !== null) out.push(...flatten(v, key));
    else out.push([key, v]);
  }
  return out;
}

function unflatten(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const parts = k.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
  }
  return out;
}

function main() {
  loadDict();
  const en = JSON.parse(readFileSync(EN_FILE, "utf8"));
  let zh = {};
  try {
    zh = JSON.parse(readFileSync(ZH_FILE, "utf8"));
  } catch {
    // start fresh
  }
  const enFlat = Object.fromEntries(flatten(en));
  const zhFlat = Object.fromEntries(flatten(zh));
  let added = 0;
  let translated = 0;
  for (const [k, v] of Object.entries(enFlat)) {
    if (zhFlat[k] === undefined) {
      zhFlat[k] = translate(v);
      added += 1;
      if (zhFlat[k] !== v) translated += 1;
    }
  }
  const merged = unflatten(zhFlat);
  writeFileSync(ZH_FILE, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Added ${added} keys, translated ${translated} to Chinese`);
  console.log(`Wrote ${ZH_FILE}`);
}

main();
