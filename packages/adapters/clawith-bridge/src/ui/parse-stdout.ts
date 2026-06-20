import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseClawithBridgeStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[clawith-bridge]")) {
    return [{ kind: "system", ts, text: trimmed.replace(/^\[clawith-bridge\]\s*/, "") }];
  }
  return [{ kind: "assistant", ts, text: line }];
}
