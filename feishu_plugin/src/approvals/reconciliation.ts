import type { BridgeConfig, PaperclipApproval, PaperclipInteraction, VersionSnapshot } from "../types.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import type { ActionTokenService } from "./action-token.js";
import { buildVersionSnapshot, versionMatches } from "./action-token.js";
import { isInteractionResourceKey, parseInteractionResourceKey } from "./resource-key.js";
import { validateInteractionIdentityFromParts } from "./interaction-identity.js";
import type { DeliveryRepository } from "../storage/repositories.js";
import { renderResultCard, renderConfirmationResultCard } from "../feishu/card-renderer.js";
import { logger } from "../observability/logger.js";
import { incMetric, METRIC_NAMES } from "../observability/metrics.js";

export interface ReconciliationDeps {
  config: BridgeConfig;
  paperclip: PaperclipClient;
  feishuRegistry: FeishuClientRegistry;
  tokenService: ActionTokenService;
  deliveryRepo: DeliveryRepository;
}

export class Reconciliation {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private deps: ReconciliationDeps) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.reconcile(), this.deps.config.reconciliationIntervalMs);
    logger.info("reconciliation started", { intervalMs: this.deps.config.reconciliationIntervalMs });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      const activeDeliveries = this.deps.deliveryRepo.findActivePending();
      const byResource = new Map<string, typeof activeDeliveries>();
      for (const d of activeDeliveries) {
        const list = byResource.get(d.approvalId) ?? [];
        list.push(d);
        byResource.set(d.approvalId, list);
      }

      for (const [resourceKey, deliveries] of byResource) {
        if (isInteractionResourceKey(resourceKey)) {
          await this.reconcileInteraction(resourceKey, deliveries);
        } else {
          await this.reconcileApproval(resourceKey, deliveries);
        }
      }
    } catch (err) {
      logger.warn("reconciliation cycle error", { error: String(err) });
    } finally {
      this.running = false;
    }
  }

  private async reconcileApproval(
    approvalId: string,
    deliveries: { messageId: string | null; approvalType: string; approvalUpdatedAt: string; payloadHash: string; companyId: string }[],
  ) {
    let approval: PaperclipApproval;
    try {
      approval = await this.deps.paperclip.getApproval(approvalId);
    } catch {
      return;
    }

    const companyId = deliveries[0]?.companyId ?? "";
    const currentVersion: VersionSnapshot = buildVersionSnapshot(approval.updatedAt, approval.payload);

    if (["approved", "rejected", "cancelled"].includes(approval.status)) {
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(approvalId);
      const cardContent = renderResultCard(approvalsType(deliveries), approval.status);
      const allUpdated = await this.updateCards(deliveries, cardContent, companyId);
      if (allUpdated) {
        this.deps.deliveryRepo.setStatus(approvalId, "superseded");
      }
      return;
    }

    if (approval.status === "revision_requested") {
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(approvalId);
      const cardContent = renderResultCard(approvalsType(deliveries), "revision_requested");
      const allUpdated = await this.updateCards(deliveries, cardContent, companyId);
      if (allUpdated) {
        this.deps.deliveryRepo.setStatus(approvalId, "superseded");
      }
      return;
    }

    const boundVersion: VersionSnapshot = {
      approvalUpdatedAt: deliveries[0].approvalUpdatedAt,
      payloadHash: deliveries[0].payloadHash,
    };

    if (!versionMatches(currentVersion, boundVersion)) {
      incMetric(METRIC_NAMES.versionMismatches);
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(approvalId, currentVersion);
      this.deps.deliveryRepo.supersedeByApproval(approvalId, currentVersion);
      logger.info("reconciliation: version mismatch, superseded old deliveries", {
        approvalId, old: boundVersion, current: currentVersion,
      });
    }
  }

  private async reconcileInteraction(
    resourceKey: string,
    deliveries: { messageId: string | null; approvalType: string; approvalUpdatedAt: string; payloadHash: string; companyId: string }[],
  ) {
    const parts = parseInteractionResourceKey(resourceKey);
    if (!parts) {
      logger.warn("reconciliation: invalid interaction resource key", { resourceKey });
      return;
    }

    let interaction: PaperclipInteraction | null;
    try {
      interaction = await this.deps.paperclip.findInteraction(parts.issueId, parts.interactionId);
    } catch {
      return;
    }

    const companyId = deliveries[0]?.companyId ?? "";

    if (!interaction) {
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(resourceKey);
      this.deps.deliveryRepo.setStatus(resourceKey, "superseded");
      logger.info("reconciliation: interaction not found, superseded", { resourceKey });
      return;
    }

    // Identity validation: interaction must match resource key and company
    const identityError = validateInteractionIdentityFromParts(interaction, parts, companyId);
    if (identityError) {
      logger.warn("reconciliation: interaction identity mismatch, skipping", {
        resourceKey, companyId, reason: identityError,
      });
      return;
    }

    const currentVersion: VersionSnapshot = buildVersionSnapshot(interaction.updatedAt, interaction.payload);

    if (["accepted", "rejected", "cancelled", "expired", "failed"].includes(interaction.status)) {
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(resourceKey);
      const cardContent = renderConfirmationResultCard(interaction, interaction.status);
      const allUpdated = await this.updateCards(deliveries, cardContent, companyId);
      if (allUpdated) {
        this.deps.deliveryRepo.setStatus(resourceKey, "superseded");
      }
      return;
    }

    const boundVersion: VersionSnapshot = {
      approvalUpdatedAt: deliveries[0].approvalUpdatedAt,
      payloadHash: deliveries[0].payloadHash,
    };

    if (!versionMatches(currentVersion, boundVersion)) {
      incMetric(METRIC_NAMES.versionMismatches);
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(resourceKey, currentVersion);
      this.deps.deliveryRepo.supersedeByApproval(resourceKey, currentVersion);
      logger.info("reconciliation: interaction version mismatch, superseded old deliveries", {
        resourceKey, old: boundVersion, current: currentVersion,
      });
    }
  }

  /**
   * Updates all delivered cards. Returns true only if every card with a
   * messageId was updated successfully AND a feishu client was available.
   */
  private async updateCards(
    deliveries: { messageId: string | null }[],
    cardContent: string,
    companyId: string,
  ): Promise<boolean> {
    const feishu = this.deps.feishuRegistry.getForCompany(companyId);
    if (!feishu) {
      logger.warn("no feishu client for company, skipping reconciliation card updates", { companyId });
      return false;
    }
    let allOk = true;
    for (const d of deliveries) {
      if (!d.messageId) continue;
      try {
        await feishu.updateInteractiveCard(d.messageId, cardContent);
      } catch (err) {
        allOk = false;
        logger.warn("reconciliation card update failed", {
          messageId: d.messageId, error: String(err),
        });
      }
    }
    return allOk;
  }
}

function approvalsType(deliveries: { approvalType: string }[]): string {
  return deliveries[0]?.approvalType ?? "unknown";
}
