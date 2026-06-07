#!/usr/bin/env node
/**
 * i18n-extract.mjs
 *
 * Scans ui/src/**\/*.{ts,tsx} and harvests candidate user-visible string
 * literals: JSX text nodes plus placeholder=, aria-label=, title=, alt=
 * attribute values. Writes ui/src/i18n/en-key-catalog.json with one entry
 * per (file, line, key) plus a deduplicated value list.
 *
 * Skips technical strings via ui/scripts/i18n-skip.json (regex matchers
 * applied to the literal value). The skip list is intentionally
 * conservative: if a literal looks technical but ends up in en.json, the
 * locale-validation harness will still accept it.
 *
 * Usage: node ui/scripts/i18n-extract.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(process.cwd(), "ui", "src");
const OUT = join(process.cwd(), "ui", "src", "i18n", "en-key-catalog.json");
const SKIP_FILE = join(process.cwd(), "ui", "scripts", "i18n-skip.json");

/** Default skip patterns: technical strings we never want to translate. */
const DEFAULT_SKIP_PATTERNS = [
  /^(class|className|id|name|type|href|src|alt|role|data-[a-z-]+|key|ref|target|rel|to|method|action|value|defaultValue|size|variant|color|width|height|min|max|step|cite|datetime|crossOrigin|referrerPolicy|loading|decoding|fetchPriority|as|inputMode|autoComplete|autoCorrect|autoCapitalize|spellCheck|enterKeyHint|tabIndex|contentEditable|draggable|hidden|inert|popover|popoverTarget|popoverTargetAction|form|formAction|formEncType|formMethod|formNoValidate|formTarget|srcSet|srcDoc|sandbox|allow|allowFullScreen|allowPaymentRequest|allowTransparency|controls|loop|muted|playsInline|poster|disablePictureInPicture|disableRemotePlayback)$/,
  /^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/i,
  /^#[0-9a-f]{3,8}$/i,
  /^(rgb|rgba|hsl|hsla)\(/i,
  /^(light|dark|true|false|yes|no|on|off|left|right|top|bottom|center|start|end|middle|baseline|stretch|wrap|nowrap|auto|inherit|none|all|scroll|hidden|visible|block|inline|flex|grid|column|row|fit|cover|contain)$/i,
  /^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|ex|cm|mm|in|pt|pc)?$/,
  /^(https?:|mailto:|tel:)/i,
  /^\/[\w/-]*/,
  /^[A-Z_]+$/,
  /^\{[A-Z_][A-Z0-9_]*\}$/,
  /^\$[\w.]+$/,
  /^[{}[\]()`~!@#$%^&*+=|\\:;'"<>,.?/-]+$/,
  /^[a-z]+(_[a-z]+)+$/,
  /^["']{2}$/,
  /^\d+(\.\d+)?$/,
  /^\d{1,2}:\d{2}(:\d{2})?(\s?(am|pm|AM|PM))?$/,
  /^\d{4}-\d{2}-\d{2}(T.*)?$/,
];

/** Attribute whitelist. */
const A11Y_ATTRS = new Set([
  "placeholder",
  "aria-label",
  "title",
  "alt",
]);

/** JSX text node between > and <. */
const JSX_TEXT_RE = />([^<>{}]+)</g;

/** String attribute: name="literal" or name='literal' or name={`literal`}. */
const ATTR_VALUE_RE = /\b(placeholder|aria-label|title|alt)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;

/** Recursive directory walk. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function shouldSkip(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return true;
  if (trimmed.length < 2) return true;
  for (const re of DEFAULT_SKIP_PATTERNS) {
    if (re.test(trimmed)) return true;
  }
  return false;
}

function deriveKey(filePath, line, value) {
  const rel = relative(ROOT, filePath).replaceAll(sep, ".");
  const stem = rel.replace(/\.(ts|tsx)$/, "");
  const safeValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${stem}.L${line}.${safeValue}`;
}

function main() {
  const skipPatterns = DEFAULT_SKIP_PATTERNS;
  let skipOverrides = [];
  try {
    skipOverrides = JSON.parse(readFileSync(SKIP_FILE, "utf8"));
  } catch {}
  const allSkip = [...skipPatterns, ...skipOverrides.map((s) => new RegExp(s))];

  const files = walk(ROOT);
  const entries = [];
  const seenValues = new Map();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");

    // JSX text nodes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(JSX_TEXT_RE);
      for (const m of matches) {
        const value = m[1].trim();
        if (shouldSkip(value)) continue;
        if (allSkip.some((re) => re.test(value))) continue;
        const key = deriveKey(file, i + 1, value);
        if (!seenValues.has(value)) {
          seenValues.set(value, []);
        }
        seenValues.get(value).push({ file: relative(process.cwd(), file), line: i + 1, key });
      }
    }

    // A11y attributes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(ATTR_VALUE_RE);
      for (const m of matches) {
        const attr = m[1];
        const value = m[2] ?? m[3] ?? m[4] ?? "";
        if (shouldSkip(value)) continue;
        if (allSkip.some((re) => re.test(value))) continue;
        const key = deriveKey(file, i + 1, `${attr}_${value.slice(0, 30)}`);
        if (!seenValues.has(value)) {
          seenValues.set(value, []);
        }
        seenValues.get(value).push({ file: relative(process.cwd(), file), line: i + 1, key, attr });
      }
    }
  }

  // Build the catalog grouped by value (deduplicated).
  const dedup = [];
  for (const [value, occurrences] of seenValues) {
    dedup.push({
      value,
      count: occurrences.length,
      occurrences: occurrences.slice(0, 5), // cap for review
    });
  }
  dedup.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        uniqueCount: dedup.length,
        totalOccurrences: entries.length,
        entries: dedup,
      },
      null,
      2,
    ),
  );

  console.log(`Catalog: ${dedup.length} unique values, ${entries.length} raw occurrences`);
  console.log(`Wrote ${relative(process.cwd(), OUT)}`);
}

main();
