import type { BridgeConfig, PaperclipInteraction, PaperclipIssueListItem, VersionSnapshot } from "../types.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import { ActionTokenService, buildVersionSnapshot } from "./action-token.js";
import { buildInteractionResourceKey } from "./resource-key.js";
import { validateInteractionIdentity } from "./interaction-identity.js";
import { findCompanyConfig, resolveApprovers } from "./routing.js";
import { renderConfirmationCard } from "../feishu/card-renderer.js";
import type { DeliveryRepository } from "../storage/repositories.js";
import type { DocumentPreviewLinkService } from "../tunnel/document-preview-link.js";
import { logger } from "../observability/logger.js";
import { incMetric, METRIC_NAMES } from "../observability/metrics.js";

export interface InteractionCoordinatorDeps {
  config: BridgeConfig;
  feishuRegistry: FeishuClientRegistry;
  tokenService: ActionTokenService;
  deliveryRepo: DeliveryRepository;
  previewLinkService?: DocumentPreviewLinkService;
}

const ROUTING_KEY = "request_confirmation";

export class InteractionCoordinator {
  constructor(private deps: InteractionCoordinatorDeps) {}

  async handleDiscovered(
    interaction: PaperclipInteraction,
    companyId: string,
    issue: PaperclipIssueListItem,
  ): Promise<void> {
    const company = findCompanyConfig(this.deps.config.companies, companyId);
    if (!company) return;

    // Guard: issue.companyId must match scanned companyId when present
    if (issue.companyId && issue.companyId !== companyId) {
      logger.warn("issue companyId mismatch in coordinator", {
        interactionId: interaction.id, issueCompanyId: issue.companyId, scannedCompanyId: companyId,
      });
      return;
    }

    // Identity check: interaction must belong to scanned company/issue
    const identityError = validateInteractionIdentity(interaction, {
      companyId,
      issueId: issue.id,
      interactionId: interaction.id,
    });
    if (identityError) {
      logger.warn("interaction identity mismatch in coordinator", {
        interactionId: interaction.id, companyId, reason: identityError,
      });
      return;
    }

    const resourceKey = buildInteractionResourceKey(interaction.issueId, interaction.id);
    const version = buildVersionSnapshot(interaction.updatedAt, interaction.payload);
    const approvers = resolveApprovers(company, ROUTING_KEY);
    if (approvers.length === 0) {
      logger.warn("no approvers configured for request_confirmation", {
        interactionId: interaction.id, companyId,
      });
      return;
    }

    this.deps.deliveryRepo.supersedeByApproval(resourceKey, version);
    this.deps.tokenService.invalidateByApproval(resourceKey, version);

    for (const approver of approvers) {
      if (this.deps.deliveryRepo.hasDelivered(resourceKey, approver.openId, version)) {
        continue;
      }
      await this.deliverCard(interaction, resourceKey, version, approver, companyId, issue);
    }
  }

  private async deliverCard(
    interaction: PaperclipInteraction,
    resourceKey: string,
    version: VersionSnapshot,
    approver: { openId: string; name: string },
    companyId: string,
    issue: PaperclipIssueListItem,
  ) {
    const allowedActions = ["accept", "reject"];
    const token = this.deps.tokenService.generate(
      resourceKey, companyId, approver.openId, allowedActions, version,
    );

    const documentUrl = this.deps.previewLinkService
      ? this.deps.previewLinkService.buildLink(interaction, { companyId, issueId: issue.id })
      : null;

    const cardContent = renderConfirmationCard(interaction, token, issue, documentUrl);

    this.deps.deliveryRepo.upsert({
      approvalId: resourceKey,
      companyId,
      approvalType: ROUTING_KEY,
      approvalStatus: interaction.status,
      approvalUpdatedAt: version.approvalUpdatedAt,
      payloadHash: version.payloadHash,
      feishuTenantKey: "",
      recipientOpenId: approver.openId,
      recipientName: approver.name,
      messageId: null,
      cardId: null,
      deliveryStatus: "sending",
      attemptCount: 0,
      lastError: null,
      lastAttemptAt: new Date().toISOString(),
      sentAt: null,
    });

    try {
      const feishu = this.deps.feishuRegistry.getForCompany(companyId);
      if (!feishu) {
        throw new Error(`no feishu client for company ${companyId}`);
      }
      const ref = await feishu.sendInteractiveCard(approver.openId, cardContent);
      this.deps.deliveryRepo.upsert({
        approvalId: resourceKey,
        companyId,
        approvalType: ROUTING_KEY,
        approvalStatus: interaction.status,
        approvalUpdatedAt: version.approvalUpdatedAt,
        payloadHash: version.payloadHash,
        feishuTenantKey: "",
        recipientOpenId: approver.openId,
        recipientName: approver.name,
        messageId: ref.messageId,
        cardId: ref.cardId ?? null,
        deliveryStatus: "sent",
        attemptCount: 1,
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
      });
      incMetric(METRIC_NAMES.interactionCardsSent);
      logger.info("interaction card sent", {
        interactionId: interaction.id, recipient: approver.name, messageId: ref.messageId,
      });
    } catch (err) {
      incMetric(METRIC_NAMES.interactionCardSendFailures);
      this.deps.deliveryRepo.upsert({
        approvalId: resourceKey,
        companyId,
        approvalType: ROUTING_KEY,
        approvalStatus: interaction.status,
        approvalUpdatedAt: version.approvalUpdatedAt,
        payloadHash: version.payloadHash,
        feishuTenantKey: "",
        recipientOpenId: approver.openId,
        recipientName: approver.name,
        messageId: null,
        cardId: null,
        deliveryStatus: "failed",
        attemptCount: 1,
        lastError: String(err),
        lastAttemptAt: new Date().toISOString(),
        sentAt: null,
      });
      logger.warn("interaction card send failed", {
        interactionId: interaction.id, recipient: approver.name, error: String(err),
      });
    }
  }
}
