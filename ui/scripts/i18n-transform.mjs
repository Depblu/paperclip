#!/usr/bin/env node
//
// i18n-transform.mjs
//
// Codemod for ui/src tsx files. Walks the AST via TypeScript and
// replaces every user-visible string literal (JSX text nodes, JSX
// attribute values for placeholder/aria-label/title/alt, and JSX
// expression string children) with a t() call. Imports useTranslation
// from "@/i18n" if not already present.
//
// Records the mapping to ui/i18n-extract/transform-map.json for
// downstream translation generation.
//
// Usage: node ui/scripts/i18n-transform.mjs
//
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, relative, basename } from "node:path";
import ts from "typescript";

const ROOT = join(process.cwd(), "ui", "src");
const SKIP_DIRS = new Set(["i18n", "fixtures", "__tests__"]);
const OUT_DIR = join(process.cwd(), "ui", "i18n-extract");
const OUT_MAP = join(OUT_DIR, "transform-map.json");

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

const SKIP_REGEX = [
  /^(class|className|id|name|type|href|src|role|data-[a-z-]+|key|ref|target|rel|to|method|action|value|defaultValue|size|variant|color|width|height|min|max|step|cite|datetime|crossOrigin|referrerPolicy|loading|decoding|fetchPriority|as|inputMode|autoComplete|autoCorrect|autoCapitalize|spellCheck|enterKeyHint|tabIndex|contentEditable|draggable|hidden|inert|popover|popoverTarget|popoverTargetAction|form|formAction|formEncType|formMethod|formNoValidate|formTarget|srcSet|srcDoc|sandbox|allow|allowFullScreen|allowPaymentRequest|allowTransparency|controls|loop|muted|playsInline|poster|disablePictureInPicture|disableRemotePlayback)$/i,
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
  /^PAP-/, // issue identifiers
  /^[A-Z]+_[A-Z_]+$/, // enum-like
  /^in_progress$|^todo$|^blocked$|^done$|^cancelled$/,
  /^\s*$/,
];

function shouldSkipValue(value) {
  if (typeof value !== "string") return true;
  if (value.length < 2 || value.length > 500) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return true;
  for (const re of SKIP_REGEX) if (re.test(trimmed)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) && !/\.stories\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function deriveNamespaceKey(filePath, value, kind) {
  const rel = relative(ROOT, filePath).replaceAll("\\", "/");
  const stem = rel.replace(/\.tsx$/, "");
  const parts = stem.split("/");
  const fileName = parts[parts.length - 1];
  const safeName = fileName
    .replace(/\.tsx$/, "")
    .replace(/[-_]/g, "_")
    .toLowerCase();
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const prefix = parts[0] === "components" ? "components" : parts[0] === "pages" ? "pages" : parts[0] === "context" ? "context" : parts[0] === "hooks" ? "hooks" : "misc";
  // Include the kind (jsx-text vs attr:title vs attr:aria-label etc.)
  // in the slug so that the same English value in different positions
  // (e.g. `title="Sort"` and `<span>Sort: ...</span>`) do not collide
  // on the same key.
  const kindTag = kind.replace(":", "_");
  return `${prefix}.${safeName}.${slug}.${kindTag}`;
}

function transformFile(filePath, collector) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const replacements = [];
  const needsUseTranslation = { value: false };

  function recordReplacement(node, value, kind) {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const key = deriveNamespaceKey(filePath, value, kind);
    replacements.push({ start, end, value, key, kind });
    collector.push({
      key,
      value,
      file: relative(process.cwd(), filePath),
      kind,
    });
    needsUseTranslation.value = true;
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.text;
      // Preserve leading/trailing whitespace in the defaultValue so that
      // the rendered output keeps the original gaps. The leading space
      // after a JSX open tag and the trailing space before a closing
      // tag or expression are both meaningful in JSX.
      const leadingMatch = text.match(/^\s*/) || ["", ""];
      const trailingMatch = text.match(/\s*$/) || ["", ""];
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (trimmed && !shouldSkipValue(trimmed)) {
        // Reconstruct: keep leading and trailing whitespace exactly as-is,
        // so the rendered DOM has the same spaces the original had.
        const preserved = leadingMatch[0] + trimmed + trailingMatch[0];
        recordReplacement(node, preserved, "jsx-text");
      }
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (!TRANSLATABLE_ATTRS.has(name)) {
        ts.forEachChild(node, visit);
        return;
      }
      const init = node.initializer;
      if (init && ts.isStringLiteral(init) && !shouldSkipValue(init.text)) {
        recordReplacement(init, init.text, `attr:${name}`);
      }
      return;
    }
    if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      if (parent && ts.isJsxExpression(parent) && !shouldSkipValue(node.text)) {
        recordReplacement(node, node.text, "jsx-expr");
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (replacements.length === 0) {
    return { changed: false };
  }

  let newSource = source;
  // Apply replacements in reverse order to keep offsets valid
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    if (r.kind === "jsx-text") {
      // Replace with JSX expression child
      const replacement = `{t("${r.key}", { defaultValue: ${JSON.stringify(r.value)} })}`;
      newSource = newSource.slice(0, r.start) + replacement + newSource.slice(r.end);
    } else if (r.kind.startsWith("attr:")) {
      // Replace string with JSX expression containing t()
      const replacement = `{t("${r.key}", { defaultValue: ${JSON.stringify(r.value)} })}`;
      newSource = newSource.slice(0, r.start) + replacement + newSource.slice(r.end);
    } else if (r.kind === "jsx-expr") {
      // Already inside {}, just wrap value
      const replacement = `t("${r.key}", { defaultValue: ${JSON.stringify(r.value)} })`;
      newSource = newSource.slice(0, r.start) + replacement + newSource.slice(r.end);
    }
  }

  // Ensure useTranslation import and `const { t } = useTranslation()` assignment
  if (needsUseTranslation.value) {
    newSource = injectUseTranslation(newSource, true);
  }

  writeFileSync(filePath, newSource, "utf8");
  return { changed: true, count: replacements.length };
}

function injectUseTranslation(source, needsTAssignment) {
  let out = source;
  // Check if useTranslation is already imported from any source
  const hasUseTranslationImport = /import\s*\{[^}]*\buseTranslation\b[^}]*\}\s*from\s*["'][^"']+["']/.test(out);
  if (hasUseTranslationImport) {
    // Already has useTranslation imported. Don't add another.
    // Just ensure the const { t } = useTranslation() is in each component.
  } else if (/from\s+["']@\/i18n["']/.test(out)) {
    out = out.replace(
      /import\s*\{([^}]*)\}\s*from\s*(["'])@\/i18n\2\s*;?/,
      (m, names, q) => {
        return `import { ${names.trim()}, useTranslation } from ${q}@/i18n${q};`;
      },
    );
  } else {
    const importMatch = out.match(/^import\s.*?;(\r?\n)/m);
    if (importMatch) {
      const insertAt = importMatch.index + importMatch[0].length;
      out =
        out.slice(0, insertAt) +
        `import { useTranslation } from "@/i18n";\n` +
        out.slice(insertAt);
    } else {
      out = `import { useTranslation } from "@/i18n";\n` + out;
    }
  }

  if (needsTAssignment) {
    out = injectTAssignment(out);
  }
  return out;
}

function injectTAssignment(source) {
  // Find each top-level / exported function component and ensure it has
  // const { t } = useTranslation() inside.
  const sf = ts.createSourceFile(
    "x.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const edits = [];

  function isCapitalized(s) {
    return typeof s === "string" && /^[A-Z]/.test(s);
  }

  function isJsxLikeBody(node) {
    if (!node) return false;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      return true;
    }
    // Unwrap parens: `(  <jsx/>  )` or `(  ({...})  )`
    if (ts.isParenthesizedExpression(node)) {
      const inner = node.expression;
      if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
        return true;
      }
    }
    return false;
  }

  function tryInjectBlock(body) {
    if (!body || !ts.isBlock(body)) return;
    const bodyText = body.getText(sf);
    if (/useTranslation\s*\(/.test(bodyText)) return;
    const openBrace = body.getStart(sf) + 1;
    const between = source.slice(openBrace, openBrace + 200);
    const m = between.match(/^(\s*\n)/);
    const indent = m ? m[1] : "\n  ";
    edits.push({
      start: openBrace,
      end: openBrace,
      insert: `${indent}const { t } = useTranslation();\n`,
    });
  }

  function buildBlockBodyInjection(arrowNode) {
    // Convert `() => <jsx/>` into `() => { const { t } = useTranslation(); return <jsx/>; }`
    // by replacing ONLY the body (after `=>`), not the parameters.
    const bodyNode = arrowNode.body;
    if (!bodyNode) return null;
    const bodyStart = bodyNode.getStart(sf);
    const bodyEnd = bodyNode.getEnd();
    const bodyText = source.slice(bodyStart, bodyEnd);
    const lineStart = source.lastIndexOf("\n", bodyStart) + 1;
    const lineIndent = (source.slice(lineStart, bodyStart).match(/^(\s*)/) || ["", ""])[1] + "  ";
    // If the body is a parenthesized expression, unwrap it.
    let inner = bodyText;
    if (inner.startsWith("(") && inner.endsWith(")")) {
      inner = inner.slice(1, -1);
    }
    const replacement =
      `{\n${lineIndent}const { t } = useTranslation();\n${lineIndent}return (${inner.trim()});\n${lineIndent.slice(2)}}`;
    return { start: bodyStart, end: bodyEnd, replacement };
  }

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && isCapitalized(node.name.text)) {
      tryInjectBlock(node.body);
    }
    if (ts.isVariableDeclaration(node) && isCapitalized(node.name.getText(sf))) {
      const init = node.initializer;
      if (init) {
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          if (ts.isBlock(init.body)) {
            tryInjectBlock(init.body);
          } else if (isJsxLikeBody(init.body)) {
            // Convert JSX expression body `() => <jsx/>` into
            // `() => { const { t } = useTranslation(); return <jsx/>; }`
            const built = buildBlockBodyInjection(init);
            if (built) edits.push(built);
          }
          // Skip plain object/array expressions — they're data, not components.
        } else if (ts.isCallExpression(init)) {
          const inner = init.arguments[0];
          if (inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))) {
            if (ts.isBlock(inner.body)) {
              tryInjectBlock(inner.body);
            } else if (isJsxLikeBody(inner.body)) {
              const built = buildBlockBodyInjection(inner);
              if (built) edits.push(built);
            }
            // Skip plain expressions here too.
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (edits.length === 0) return source;
  // Sort by start, then dedupe by start
  edits.sort((a, b) => b.start - a.start);
  const seen = new Set();
  for (const e of edits) {
    if (seen.has(e.start)) continue;
    seen.add(e.start);
    if (e.insert) {
      source = source.slice(0, e.start) + e.insert + source.slice(e.end);
    } else {
      source = source.slice(0, e.start) + e.replacement + source.slice(e.end);
    }
  }
  return source;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = walk(ROOT);
  const collector = [];
  let totalChanged = 0;
  let totalReplacements = 0;
  for (const file of files) {
    try {
      const result = transformFile(file, collector);
      if (result.changed) {
        totalChanged += 1;
        totalReplacements += result.count;
        console.log(`  transformed ${relative(process.cwd(), file)} (${result.count} replacements)`);
      }
    } catch (err) {
      console.error(`  ERROR in ${relative(process.cwd(), file)}: ${err.message}`);
    }
  }
  // Dedupe collector by key, keeping first occurrence's value
  const byKey = new Map();
  for (const item of collector) {
    if (!byKey.has(item.key)) byKey.set(item.key, item);
  }
  writeFileSync(
    OUT_MAP,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        filesChanged: totalChanged,
        replacements: totalReplacements,
        uniqueKeys: byKey.size,
        items: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
      },
      null,
      2,
    ),
  );
  console.log(`\nTransformed ${totalChanged} files, ${totalReplacements} replacements, ${byKey.size} unique keys`);
  console.log(`Wrote ${relative(process.cwd(), OUT_MAP)}`);
}

main();
