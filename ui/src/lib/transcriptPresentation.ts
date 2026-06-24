import { t as translate } from "@/i18n";

type TranscriptDensity = "comfortable" | "compact";
type TranslateFn = typeof translate;

type TranscriptActivity = {
  activityId?: string;
  name: string;
  status: "running" | "completed";
};

export interface ToolInputDetail {
  kind?: string;
  label: string;
  value: string;
  tone?: "default" | "code";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

function humanizeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stripWrappedShell(command: string): string {
  const trimmed = compactWhitespace(command);
  const shellWrapped = trimmed.match(/^(?:(?:\/bin\/)?(?:zsh|bash|sh)|cmd(?:\.exe)?(?:\s+\/d)?(?:\s+\/s)?(?:\s+\/c)?)\s+(?:-lc|\/c)\s+(.+)$/i);
  const inner = shellWrapped?.[1] ?? trimmed;
  const quoted = inner.match(/^(['"])([\s\S]*)\1$/);
  return compactWhitespace(quoted?.[2] ?? inner);
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizeRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return truncate(compactWhitespace(value), 120);
    }
  }
  return null;
}

function parseStructuredToolResult(result: string | undefined) {
  if (!result) return null;
  const lines = result.split(/\r?\n/);
  const metadata = new Map<string, string>();
  let bodyStartIndex = lines.findIndex((line) => line.trim() === "");
  if (bodyStartIndex === -1) bodyStartIndex = lines.length;

  for (let index = 0; index < bodyStartIndex; index += 1) {
    const match = lines[index]?.match(/^([a-z_]+):\s*(.+)$/i);
    if (match) {
      metadata.set(match[1].toLowerCase(), compactWhitespace(match[2]));
    }
  }

  const body = lines.slice(Math.min(bodyStartIndex + 1, lines.length))
    .map((line) => compactWhitespace(line))
    .filter(Boolean)
    .join("\n");

  return {
    command: metadata.get("command") ?? null,
    status: metadata.get("status") ?? null,
    exitCode: metadata.get("exit_code") ?? null,
    body,
  };
}

export function formatToolPayload(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return formatUnknown(value);
}

export function parseToolPayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function isCommandTool(name: string, input: unknown): boolean {
  if (name === "command_execution" || name === "shell" || name === "shellToolCall" || name === "bash") {
    return true;
  }
  if (typeof input === "string") {
    return /\b(?:bash|zsh|sh|cmd|powershell)\b/i.test(input);
  }
  const record = asRecord(input);
  return Boolean(record && (typeof record.command === "string" || typeof record.cmd === "string"));
}

export function displayToolName(name: string, input: unknown, t: TranslateFn = translate): string {
  if (isCommandTool(name, input)) return t("lib.transcriptpresentation.executing_command", { defaultValue: "Executing command" });
  return humanizeLabel(name);
}

export function summarizeToolInput(
  name: string,
  input: unknown,
  density: TranscriptDensity = "comfortable",
  t: TranslateFn = translate,
): string {
  const compactMax = density === "compact" ? 72 : 120;
  if (typeof input === "string") {
    const normalized = isCommandTool(name, input) ? stripWrappedShell(input) : compactWhitespace(input);
    return truncate(normalized, compactMax);
  }
  const record = asRecord(input);
  if (!record) {
    const serialized = compactWhitespace(formatUnknown(input));
    return serialized
      ? truncate(serialized, compactMax)
      : t("lib.transcriptpresentation.inspect_tool_input", { name, defaultValue: "Inspect {{name}} input" });
  }

  const command = typeof record.command === "string"
    ? record.command
    : typeof record.cmd === "string"
      ? record.cmd
      : null;
  const humanDescription =
    summarizeRecord(record, ["description", "summary", "reason", "goal", "intent", "action", "task"])
    ?? null;
  if (humanDescription) {
    return truncate(humanDescription, compactMax);
  }
  if (command && isCommandTool(name, record)) {
    return truncate(stripWrappedShell(command), compactMax);
  }

  const direct =
    summarizeRecord(record, ["path", "filePath", "file_path", "query", "url", "prompt", "message"])
    ?? summarizeRecord(record, ["pattern", "name", "title", "target", "tool", "command", "cmd"])
    ?? null;
  if (direct) return truncate(direct, compactMax);

  if (Array.isArray(record.paths) && record.paths.length > 0) {
    const first = record.paths.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (first) {
      return truncate(t("lib.transcriptpresentation.paths_starting_with", {
        count: record.paths.length,
        first,
        defaultValue: "{{count}} paths, starting with {{first}}",
      }), compactMax);
    }
  }

  const keys = Object.keys(record);
  if (keys.length === 0) return t("lib.transcriptpresentation.no_tool_input", { name, defaultValue: "No {{name}} input" });
  if (keys.length === 1) {
    return truncate(t("lib.transcriptpresentation.single_payload", {
      key: keys[0],
      defaultValue: "{{key}} payload",
    }), compactMax);
  }
  return truncate(t("lib.transcriptpresentation.fields_summary", {
    count: keys.length,
    fields: keys.slice(0, 3).join(", "),
    defaultValue: "{{count}} fields: {{fields}}",
  }), compactMax);
}

function readToolDetailValue(value: unknown, max = 200): string | null {
  if (typeof value === "string") {
    const normalized = compactWhitespace(value);
    return normalized ? truncate(normalized, max) : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function describeToolInput(name: string, input: unknown, t: TranslateFn = translate): ToolInputDetail[] {
  if (typeof input === "string") {
    const summary = compactWhitespace(isCommandTool(name, input) ? stripWrappedShell(input) : input);
    return summary ? [{
      kind: isCommandTool(name, input) ? "command" : "input",
      label: isCommandTool(name, input)
        ? t("lib.transcriptpresentation.command.detail_label", { defaultValue: "Command" })
        : t("lib.transcriptpresentation.input.detail_label", { defaultValue: "Input" }),
      value: truncate(summary, 200),
      tone: "code",
    }] : [];
  }

  const record = asRecord(input);
  if (!record) return [];

  const details: ToolInputDetail[] = [];
  const seen = new Set<string>();
  const pushDetail = (kind: string, label: string, value: string | null, tone: ToolInputDetail["tone"] = "default") => {
    if (!value) return;
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    details.push({ kind, label, value, tone });
  };

  pushDetail(
    "intent",
    t("lib.transcriptpresentation.intent.detail_label", { defaultValue: "Intent" }),
    summarizeRecord(record, ["description", "summary", "reason", "goal", "intent", "action", "task"]) ?? null,
  );
  pushDetail("path", t("lib.transcriptpresentation.path.detail_label", { defaultValue: "Path" }), readToolDetailValue(record.path) ?? readToolDetailValue(record.filePath) ?? readToolDetailValue(record.file_path));
  pushDetail("directory", t("lib.transcriptpresentation.directory.detail_label", { defaultValue: "Directory" }), readToolDetailValue(record.cwd));
  pushDetail("query", t("lib.transcriptpresentation.query.detail_label", { defaultValue: "Query" }), readToolDetailValue(record.query));
  pushDetail("target", t("lib.transcriptpresentation.target.detail_label", { defaultValue: "Target" }), readToolDetailValue(record.url) ?? readToolDetailValue(record.target));
  pushDetail("prompt", t("lib.transcriptpresentation.prompt.detail_label", { defaultValue: "Prompt" }), readToolDetailValue(record.prompt) ?? readToolDetailValue(record.message));
  pushDetail("pattern", t("lib.transcriptpresentation.pattern.detail_label", { defaultValue: "Pattern" }), readToolDetailValue(record.pattern));
  pushDetail("name", t("lib.transcriptpresentation.name.detail_label", { defaultValue: "Name" }), readToolDetailValue(record.name) ?? readToolDetailValue(record.title));

  if (Array.isArray(record.paths) && record.paths.length > 0) {
    const paths = record.paths
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 3)
      .join(", ");
    if (paths) {
      const suffix = record.paths.length > 3
        ? t("lib.transcriptpresentation.more_paths.suffix", {
          count: record.paths.length - 3,
          defaultValue: ", +{{count}} more",
        })
        : "";
      pushDetail("paths", t("lib.transcriptpresentation.paths.detail_label", { defaultValue: "Paths" }), `${paths}${suffix}`);
    }
  }

  const command = typeof record.command === "string"
    ? record.command
    : typeof record.cmd === "string"
      ? record.cmd
      : null;
  if (command && isCommandTool(name, record) && !details.some((detail) => detail.kind === "intent")) {
    pushDetail("command", t("lib.transcriptpresentation.command.detail_label", { defaultValue: "Command" }), truncate(stripWrappedShell(command), 200), "code");
  }

  return details;
}

export function summarizeToolResult(
  result: string | undefined,
  isError: boolean | undefined,
  density: TranscriptDensity = "comfortable",
  t: TranslateFn = translate,
): string {
  if (!result) {
    return isError
      ? t("lib.transcriptpresentation.tool_failed", { defaultValue: "Tool failed" })
      : t("lib.transcriptpresentation.waiting_for_result", { defaultValue: "Waiting for result" });
  }
  const structured = parseStructuredToolResult(result);
  if (structured) {
    if (structured.body) {
      return truncate(structured.body.split("\n")[0] ?? structured.body, density === "compact" ? 84 : 140);
    }
    if (structured.status === "completed") return t("lib.transcriptpresentation.completed", { defaultValue: "Completed" });
    if (structured.status === "failed" || structured.status === "error") {
      return structured.exitCode
        ? t("lib.transcriptpresentation.failed_with_exit_code", {
          exitCode: structured.exitCode,
          defaultValue: "Failed with exit code {{exitCode}}",
        })
        : t("lib.transcriptpresentation.failed", { defaultValue: "Failed" });
    }
  }
  const lines = result
    .split(/\r?\n/)
    .map((line) => compactWhitespace(line))
    .filter(Boolean);
  const firstLine = lines[0] ?? result;
  return truncate(firstLine, density === "compact" ? 84 : 140);
}

export function parseSystemActivity(text: string): TranscriptActivity | null {
  const match = text.match(/^item (started|completed):\s*([a-z0-9_-]+)(?:\s+\(id=([^)]+)\))?$/i);
  if (!match) return null;
  return {
    status: match[1].toLowerCase() === "started" ? "running" : "completed",
    name: humanizeLabel(match[2] ?? "Activity"),
    activityId: match[3] || undefined,
  };
}

export function shouldHideNiceModeStderr(text: string): boolean {
  const normalized = compactWhitespace(text).toLowerCase();
  return normalized.startsWith("[paperclip] skipping saved session resume");
}

export function summarizeNotice(text: string, max = 160): string {
  return truncate(compactWhitespace(text), max);
}
