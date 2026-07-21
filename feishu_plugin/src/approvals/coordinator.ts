import type { BridgeConfig, PaperclipApproval, PaperclipApprovalWithMeta, VersionSnapshot } from "../types.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import { ActionTokenService, buildVersionSnapshot } from "./action-token.js";
import { findCompanyConfig, isActionable, resolveApprovers } from "./routing.js";
import { renderApprovalCard } from "../feishu/card-renderer.js";
import type { DeliveryRepository } from "../storage/repositories.js";
import { logger } from "../observability/logger.js";
import { incMetric, METRIC_NAMES } from "../observability/metrics.js";

export interface CoordinatorDeps {
  config: BridgeConfig;
  paperclip: PaperclipClient;
  feishuRegistry: FeishuClientRegistry;
  tokenService: ActionTokenService;
  deliveryRepo: DeliveryRepository;
}

export class ApprovalCoordinator {
  constructor(private deps: CoordinatorDeps) {}

  async handleDiscovered(approval: PaperclipApproval, companyId: string): Promise<void> {
    const company = findCompanyConfig(this.deps.config.companies, companyId);
    if (!company) return;

    const version = buildVersionSnapshot(approval.updatedAt, approval.payload);
    const approvers = resolveApprovers(company, approval.type);
    if (approvers.length === 0) {
      logger.warn("no approvers configured", { approvalId: approval.id, companyId, type: approval.type });
      return;
    }

    this.deps.deliveryRepo.supersedeByApproval(approval.id, version);
    this.deps.tokenService.invalidateByApproval(approval.id, version);

    let meta: PaperclipApprovalWithMeta = approval;
    try {
      const issues = await this.deps.paperclip.getApprovalIssues(approval.id);
      meta = { ...approval, issues };
    } catch {
      logger.debug("failed to fetch issues", { approvalId: approval.id });
    }

    const actionable = isActionable(approval.type);
    const detailUrl = `${this.deps.config.paperclipPublicUrl}/companies/${companyId}/approvals/${approval.id}`;

    for (const approver of approvers) {
      if (this.deps.deliveryRepo.hasDelivered(approval.id, approver.openId, version)) {
        continue;
      }
      await this.deliverCard(meta, version, approver, companyId, actionable, detailUrl);
    }
  }

  private async deliverCard(
    approval: PaperclipApprovalWithMeta,
    version: VersionSnapshot,
    approver: { openId: string; name: string },
    companyId: string,
    actionable: boolean,
    detailUrl: string,
  ) {
    const allowedActions = actionable ? ["approve", "reject"] : [];
    const token = this.deps.tokenService.generate(
      approval.id, companyId, approver.openId, allowedActions, version,
    );

    const cardContent = renderApprovalCard(approval, version, token, detailUrl);

    this.deps.deliveryRepo.upsert({
      approvalId: approval.id,
      companyId,
      approvalType: approval.type,
      approvalStatus: approval.status,
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
        approvalId: approval.id,
        companyId,
        approvalType: approval.type,
        approvalStatus: approval.status,
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
      incMetric(METRIC_NAMES.cardsSent);
      logger.info("card sent", {
        approvalId: approval.id, recipient: approver.name, messageId: ref.messageId,
      });
    } catch (err) {
      incMetric(METRIC_NAMES.cardSendFailures);
      this.deps.deliveryRepo.upsert({
        approvalId: approval.id,
        companyId,
        approvalType: approval.type,
        approvalStatus: approval.status,
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
      logger.warn("card send failed", {
        approvalId: approval.id, recipient: approver.name, error: String(err),
      });
    }
  }
}
