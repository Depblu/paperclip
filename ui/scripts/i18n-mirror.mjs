#!/usr/bin/env node
/**
 * i18n-mirror.mjs
 *
 * Reads ui/src/i18n/locales/en.json and writes the same shape to all
 * non-Chinese locale files in ui/src/i18n/locales/ (e.g. ar.json, ja.json,
 * de.json, zh-TW.json) using the English values as placeholders.
 *
 * This guarantees every registered locale file passes locale-validation
 * without forcing a real translation for the 38 non-zh-CN languages.
 * Native-speaker translations can be added language-by-language in
 * follow-up PRs.
 *
 * Usage: node ui/scripts/i18n-mirror.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const LOCALES_DIR = join(process.cwd(), "ui", "src", "i18n", "locales");
const EN_FILE = join(LOCALES_DIR, "en.json");
const SKIP = new Set(["en.json", "zh-CN.json"]);

function main() {
  const en = JSON.parse(readFileSync(EN_FILE, "utf8"));
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json") && !SKIP.has(f));
  let written = 0;
  for (const file of files) {
    const target = join(LOCALES_DIR, file);
    writeFileSync(target, JSON.stringify(en, null, 2) + "\n", "utf8");
    written += 1;
  }
  console.log(`Mirrored en.json to ${written} locale files.`);
}

main();
