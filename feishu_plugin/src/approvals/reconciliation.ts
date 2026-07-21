import type { BridgeConfig, PaperclipApproval, VersionSnapshot } from "../types.js";
import type { PaperclipClient } from "../paperclip/client.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import type { ActionTokenService } from "./action-token.js";
import { buildVersionSnapshot, versionMatches } from "./action-token.js";
import type { DeliveryRepository } from "../storage/repositories.js";
import { renderResultCard } from "../feishu/card-renderer.js";
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
      const byApproval = new Map<string, typeof activeDeliveries>();
      for (const d of activeDeliveries) {
        const list = byApproval.get(d.approvalId) ?? [];
        list.push(d);
        byApproval.set(d.approvalId, list);
      }

      for (const [approvalId, deliveries] of byApproval) {
        await this.reconcileApproval(approvalId, deliveries);
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
      await this.updateCards(deliveries, cardContent, companyId);
      this.deps.deliveryRepo.setStatus(approvalId, "superseded");
      return;
    }

    if (approval.status === "revision_requested") {
      incMetric(METRIC_NAMES.reconciliationRepairs);
      this.deps.tokenService.invalidateByApproval(approvalId);
      const cardContent = renderResultCard(approvalsType(deliveries), "revision_requested");
      await this.updateCards(deliveries, cardContent, companyId);
      this.deps.deliveryRepo.setStatus(approvalId, "superseded");
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

  private async updateCards(
    deliveries: { messageId: string | null }[],
    cardContent: string,
    companyId: string,
  ) {
    const feishu = this.deps.feishuRegistry.getForCompany(companyId);
    if (!feishu) {
      logger.warn("no feishu client for company, skipping reconciliation card updates", { companyId });
    }
    for (const d of deliveries) {
      if (!d.messageId || !feishu) continue;
      try {
        await feishu.updateInteractiveCard(d.messageId, cardContent);
      } catch (err) {
        logger.warn("reconciliation card update failed", {
          messageId: d.messageId, error: String(err),
        });
      }
    }
  }
}

function approvalsType(deliveries: { approvalType: string }[]): string {
  return deliveries[0]?.approvalType ?? "unknown";
}
