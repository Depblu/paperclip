import pc from "picocolors";

export function printClawithBridgeStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;
  if (line.startsWith("[clawith-bridge]")) {
    console.log(pc.cyan(line));
    return;
  }
  console.log(debug ? pc.gray(line) : line);
}
