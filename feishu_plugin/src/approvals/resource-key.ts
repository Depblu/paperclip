import type { InteractionResourceKeyParts } from "../types.js";

const INTERACTION_PREFIX = "interaction:";

export function buildInteractionResourceKey(issueId: string, interactionId: string): string {
  return `${INTERACTION_PREFIX}${issueId}:${interactionId}`;
}

export function parseInteractionResourceKey(key: string): InteractionResourceKeyParts | null {
  if (!key.startsWith(INTERACTION_PREFIX)) return null;
  const rest = key.slice(INTERACTION_PREFIX.length);
  const sepIndex = rest.indexOf(":");
  if (sepIndex <= 0 || sepIndex >= rest.length - 1) return null;
  const issueId = rest.slice(0, sepIndex);
  const interactionId = rest.slice(sepIndex + 1);
  if (!issueId || !interactionId) return null;
  if (interactionId.includes(":")) return null;
  return { issueId, interactionId };
}

export function isInteractionResourceKey(key: string): boolean {
  return key.startsWith(INTERACTION_PREFIX);
}
