import type {
  DeliveryRecord,
  InteractionResourceKeyParts,
  PaperclipInteraction,
  PaperclipIssue,
  VersionSnapshot,
} from "../types.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import type { ActionTokenService } from "../approvals/action-token.js";
import { buildVersionSnapshot, versionMatches } from "../approvals/action-token.js";
import { parseInteractionResourceKey } from "../approvals/resource-key.js";
import { validateInteractionIdentityFromParts } from "../approvals/interaction-identity.js";
import type { DeliveryRepository } from "../storage/repositories.js";
import type { DocumentPreviewLinkService } from "./document-preview-link.js";
import { renderConfirmationCard } from "../feishu/card-renderer.js";
import { logger } from "../observability/logger.js";

const ROUTING_KEY = "request_confirmation";

export interface PendingInteractionCardRefresherDeps {
  paperclip: PaperclipClient;
  feishuRegistry: FeishuClientRegistry;
  tokenService: ActionTokenService;
  deliveryRepo: DeliveryRepository;
  previewLinkService?: DocumentPreviewLinkService;
}

export interface RefreshResult {
  updated: number;
  failed: number;
  skipped: number;
}

/**
 * Refreshes already-delivered request_confirmation cards that are still
 * pending, so that document preview links reflect the current tunnel URL.
 *
 * For each eligible delivered card it mints a fresh action token bound to the
 * recipient and current version, re-renders the confirmation card, and patches
 * the Feishu message in place. It never mutates delivery records and never
 * invalidates or consumes existing tokens.
 */
export class PendingInteractionCardRefresher {
  constructor(private deps: PendingInteractionCardRefresherDeps) {}

  async refreshAll(): Promise<RefreshResult> {
    const result: RefreshResult = { updated: 0, failed: 0, skipped: 0 };

    const active = this.deps.deliveryRepo.findActivePending();
    const confirmations = active.filter((d) => d.approvalType === ROUTING_KEY);

    const byResource = new Map<string, DeliveryRecord[]>();
    for (const d of confirmations) {
      const list = byResource.get(d.approvalId) ?? [];
      list.push(d);
      byResource.set(d.approvalId, list);
    }

    for (const [resourceKey, deliveries] of byResource) {
      await this.refreshGroup(resourceKey, deliveries, result);
    }

    return result;
  }

  private async refreshGroup(
    resourceKey: string,
    deliveries: DeliveryRecord[],
    result: RefreshResult,
  ): Promise<void> {
    const parts = parseInteractionResourceKey(resourceKey);
    if (!parts) {
      result.skipped += deliveries.length;
      return;
    }

    let interaction: PaperclipInteraction | null;
    try {
      interaction = await this.deps.paperclip.findInteraction(parts.issueId, parts.interactionId);
    } catch (err) {
      result.failed += deliveries.length;
      logger.warn("pending interaction card refresh failed", {
        resourceKey, error: String(err),
      });
      return;
    }
    if (!interaction) {
      result.skipped += deliveries.length;
      return;
    }

    let issue: PaperclipIssue | undefined;
    try {
      issue = await this.deps.paperclip.getIssue(parts.issueId);
    } catch (err) {
      result.failed += deliveries.length;
      logger.warn("pending interaction card refresh failed", {
        resourceKey, error: String(err),
      });
      return;
    }

    const currentVersion: VersionSnapshot = buildVersionSnapshot(interaction.updatedAt, interaction.payload);

    for (const delivery of deliveries) {
      try {
        await this.refreshOne(resourceKey, parts, interaction, issue, currentVersion, delivery, result);
      } catch (err) {
        result.failed += 1;
        logger.warn("pending interaction card refresh failed", {
          resourceKey, messageId: delivery.messageId, error: String(err),
        });
      }
    }
  }

  private async refreshOne(
    resourceKey: string,
    parts: InteractionResourceKeyParts,
    interaction: PaperclipInteraction,
    issue: PaperclipIssue | undefined,
    currentVersion: VersionSnapshot,
    delivery: DeliveryRecord,
    result: RefreshResult,
  ): Promise<void> {
    if (interaction.status !== "pending") {
      result.skipped += 1;
      return;
    }

    const identityError = validateInteractionIdentityFromParts(interaction, parts, delivery.companyId);
    if (identityError) {
      result.skipped += 1;
      return;
    }

    const boundVersion: VersionSnapshot = {
      approvalUpdatedAt: delivery.approvalUpdatedAt,
      payloadHash: delivery.payloadHash,
    };
    if (!versionMatches(currentVersion, boundVersion)) {
      result.skipped += 1;
      return;
    }

    if (!delivery.messageId) {
      result.skipped += 1;
      return;
    }

    const feishu = this.deps.feishuRegistry.getForCompany(delivery.companyId);
    if (!feishu) {
      result.skipped += 1;
      return;
    }

    const token = this.deps.tokenService.generate(
      resourceKey,
      delivery.companyId,
      delivery.recipientOpenId,
      ["accept", "reject"],
      currentVersion,
    );

    const documentUrl = this.deps.previewLinkService
      ? this.deps.previewLinkService.buildLink(interaction, {
          companyId: delivery.companyId,
          issueId: parts.issueId,
        })
      : null;

    const cardContent = renderConfirmationCard(interaction, token, issue, documentUrl);

    await feishu.updateInteractiveCard(delivery.messageId, cardContent);
    result.updated += 1;
  }
}
