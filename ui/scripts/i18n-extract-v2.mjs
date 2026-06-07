#!/usr/bin/env node
/**
 * i18n-extract-v2.mjs
 *
 * AST-based extractor using TypeScript's compiler API. Walks every
 * .tsx file under ui/src/ (excluding tests, stories, fixtures) and
 * harvests:
 *   - JSX text nodes (literal children between > and <)
 *   - JSX attribute string values: placeholder, aria-label, title, alt
 *
 * Skips:
 *   - string literals that are part of `className`, `href`, `id`, `data-*`,
 *     `name`, `type`, `role`, `value`, `defaultValue`, `variant`, `size`,
 *     `color`, `width`, `height`, `min`, `max`, `step`, `cite`, `key`,
 *     `ref`, `target`, `rel`, `to`, `method`, `action`, `src`, `srcSet`,
 *     `as`, `inputMode`, `autoComplete`, etc. (technical / structural)
 *   - strings that match a denylist of clearly-non-translatable values
 *   - strings inside test files
 *   - dynamic expressions / template strings
 *
 * Output: ui/src/i18n/en-key-catalog.json with full list of strings
 * and their (file, line) occurrence locations. Then a second pass
 * generates a stable key per string and writes en.json + zh-CN.json.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(process.cwd(), "ui", "src");
const OUT_CATALOG = join(process.cwd(), "ui", "i18n-extract", "en-key-catalog.json");
const SOURCE = "i18n-extract-v2";

const TRANSLATABLE_ATTRS = new Set([
  "placeholder",
  "aria-label",
  "title",
  "alt",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
]);

const SKIP_VALUES = new Set([
  "",
  "true",
  "false",
  "null",
  "undefined",
  "true",
  "false",
]);

const SKIP_REGEX = [
  /^(class|className|id|name|type|href|src|alt|role|data-[a-z-]+|key|ref|target|rel|to|method|action|value|defaultValue|size|variant|color|width|height|min|max|step|cite|datetime|crossOrigin|referrerPolicy|loading|decoding|fetchPriority|as|inputMode|autoComplete|autoCorrect|autoCapitalize|spellCheck|enterKeyHint|tabIndex|contentEditable|draggable|hidden|inert|popover|popoverTarget|popoverTargetAction|form|formAction|formEncType|formMethod|formNoValidate|formTarget|srcSet|srcDoc|sandbox|allow|allowFullScreen|allowPaymentRequest|allowTransparency|controls|loop|muted|playsInline|poster|disablePictureInPicture|disableRemotePlayback)$/i,
  /^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/i,
  /^(rgb|rgba|hsl|hsla)\(/i,
  /^(light|dark)$/i,
  /^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|ex|cm|mm|in|pt|pc)?$/,
  /^(https?:|mailto:|tel:)/i,
  /^\/[\w/-]*/,
  /^[A-Z_][A-Z0-9_]+$/,
  /^\{[A-Z_][A-Z0-9_]*\}$/,
  /^\$[\w.]+$/,
  /^[{}[\]()`~!@#$%^&*+=|\\:;'"<>,.?/-]+$/,
  /^[a-z]+(_[a-z]+)+$/,
  /^["']{2}$/,
  /^\d+(\.\d+)?$/,
  /^\d{1,2}:\d{2}(:\d{2})?(\s?(am|pm|AM|PM))?$/,
  /^\d{4}-\d{2}-\d{2}(T.*)?$/,
];

function shouldSkip(value) {
  if (typeof value !== "string") return true;
  if (SKIP_VALUES.has(value)) return true;
  if (value.length < 2 || value.length > 500) return true;
  for (const re of SKIP_REGEX) if (re.test(value)) return true;
  if (value.startsWith("$") && value.includes(".")) return true;
  return false;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) && !/\.stories\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function relativeKey(filePath) {
  const rel = relative(ROOT, filePath).replaceAll("\\", "/");
  const stem = rel.replace(/\.(ts|tsx)$/, "");
  const parts = stem.split("/");
  if (parts[0] === "components") return ["components", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "pages") return ["pages", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "context") return ["context", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "lib") return ["lib", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "hooks") return ["hooks", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "api") return ["api", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "plugins") return ["plugins", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "adapters") return ["adapters", ...parts.slice(1).map((p) => toCamel(p))];
  if (parts[0] === "fixtures") return ["fixtures", ...parts.slice(1).map((p) => toCamel(p))];
  return parts.map((p) => toCamel(p));
}

function toCamel(s) {
  const noExt = s.replace(/\.[^.]+$/, "");
  const parts = noExt.split(/[-_]/);
  return parts.map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join("");
}

function collectStrings(filePath) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const found = [];

  function visit(node) {
    // JSX text node
    if (ts.isJsxText(node)) {
      const text = node.text;
      if (text && !/^\s*$/.test(text)) {
        const trimmed = text.replace(/\s+/g, " ").trim();
        if (trimmed && !shouldSkip(trimmed)) {
          found.push({
            value: trimmed,
            loc: { line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 },
            kind: "jsx-text",
          });
        }
      }
    }
    // JSX attribute
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (!TRANSLATABLE_ATTRS.has(name)) {
        ts.forEachChild(node, visit);
        return;
      }
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) {
        const text = init.text;
        if (!shouldSkip(text)) {
          found.push({
            value: text,
            loc: { line: sourceFile.getLineAndCharacterOfPosition(init.getStart(sourceFile)).line + 1 },
            kind: `attr:${name}`,
          });
        }
      }
    }
    // String literal as JSX expression child
    if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      if (parent && ts.isJsxExpression(parent)) {
        const text = node.text;
        if (!shouldSkip(text)) {
          found.push({
            value: text,
            loc: { line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 },
            kind: "jsx-expr",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function main() {
  const files = walk(ROOT);
  const byValue = new Map();
  for (const file of files) {
    const items = collectStrings(file);
    for (const item of items) {
      if (!byValue.has(item.value)) {
        byValue.set(item.value, []);
      }
      byValue.get(item.value).push({
        file: relative(process.cwd(), file),
        line: item.loc.line,
        kind: item.kind,
      });
    }
  }

  const entries = [...byValue.entries()].map(([value, occurrences]) => ({
    value,
    count: occurrences.length,
    occurrences: occurrences.slice(0, 8),
  }));
  entries.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  writeFileSync(
    OUT_CATALOG,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: SOURCE,
        uniqueCount: entries.length,
        totalOccurrences: entries.reduce((s, e) => s + e.count, 0),
        entries,
      },
      null,
      2,
    ),
  );
  console.log(`[${SOURCE}] catalog: ${entries.length} unique values, ${entries.reduce((s, e) => s + e.count, 0)} occurrences`);
  console.log(`[${SOURCE}] wrote ${relative(process.cwd(), OUT_CATALOG)}`);
}

main();
