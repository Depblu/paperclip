import type { PaperclipInteraction } from "../types.js";
import type { InteractionResourceKeyParts } from "../types.js";

/**
 * Validates that an interaction fetched from Core matches the expected
 * identity derived from the scan context, token, or resource key.
 * Returns null if valid, or a reason string if mismatched.
 */
export function validateInteractionIdentity(
  interaction: PaperclipInteraction,
  expected: {
    companyId: string;
    issueId: string;
    interactionId: string;
  },
): string | null {
  if (interaction.id !== expected.interactionId) {
    return `interaction_id_mismatch: got ${interaction.id}, expected ${expected.interactionId}`;
  }
  if (interaction.issueId !== expected.issueId) {
    return `issue_id_mismatch: got ${interaction.issueId}, expected ${expected.issueId}`;
  }
  if (interaction.companyId !== expected.companyId) {
    return `company_id_mismatch: got ${interaction.companyId}, expected ${expected.companyId}`;
  }
  if (interaction.kind !== "request_confirmation") {
    return `kind_mismatch: got ${interaction.kind}, expected request_confirmation`;
  }
  return null;
}

/**
 * Validates identity using parsed resource key parts.
 */
export function validateInteractionIdentityFromParts(
  interaction: PaperclipInteraction,
  parts: InteractionResourceKeyParts,
  companyId: string,
): string | null {
  return validateInteractionIdentity(interaction, {
    companyId,
    issueId: parts.issueId,
    interactionId: parts.interactionId,
  });
}
