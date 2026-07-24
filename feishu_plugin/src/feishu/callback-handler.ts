import type { BridgeConfig, PaperclipApproval, PaperclipInteraction } from "../types.js";
import type { PaperclipClient, PaperclipClientError } from "../paperclip/client.js";
import type { ActionTokenService } from "../approvals/action-token.js";
import { buildVersionSnapshot, versionMatches } from "../approvals/action-token.js";
import { findCompanyConfig, isActionable, isAuthorizedApprover } from "../approvals/routing.js";
import { isInteractionResourceKey, parseInteractionResourceKey } from "../approvals/resource-key.js";
import { validateInteractionIdentityFromParts } from "../approvals/interaction-identity.js";
import { CallbackEventRepository, DeliveryRepository } from "../storage/repositories.js";
import type { CardActionEvent } from "../feishu/long-connection.js";
import type { TestApprovalSessions } from "../feishu/test-approval-sessions.js";
import { renderApprovalDetailCard, renderResultCard, renderConfirmationResultCard } from "../feishu/card-renderer.js";
import type { FeishuClientRegistry } from "../feishu/client-registry.js";
import { logger } from "../observability/logger.js";
import { incMetric, METRIC_NAMES } from "../observability/metrics.js";

export interface CallbackDeps {
  config: BridgeConfig;
  paperclip: PaperclipClient;
  feishuRegistry: FeishuClientRegistry;
  tokenService: ActionTokenService;
  deliveryRepo: DeliveryRepository;
  callbackRepo: CallbackEventRepository;
  testApprovalSessions?: TestApprovalSessions;
}

export class CallbackHandler {
  constructor(private deps: CallbackDeps) {}

  async handle(event: CardActionEvent): Promise<Record<string, unknown> | void> {
    incMetric(METRIC_NAMES.callbacks);
    const testResult = this.deps.testApprovalSessions?.handleAction(event);
    if (testResult?.matched) {
      if (testResult.cardContent) return this.cardResponse(testResult.cardContent);
      return testResult.response;
    }

    const { action, token, approval_id: approvalId } = event.actionValue;
    if (!action || !token || !approvalId) {
      return this.toast("无效的操作请求");
    }

    if (action === "view_details") {
      return this.handleViewDetails(event, token, approvalId);
    }

    if (this.deps.callbackRepo.exists(event.eventId)) {
      incMetric(METRIC_NAMES.callbackDuplicates);
      logger.info("duplicate callback", { eventId: event.eventId });
      return this.toast("该操作已处理");
    }

    this.deps.callbackRepo.insert({
      eventId: event.eventId,
      approvalId,
      companyId: "",
      operatorOpenId: event.operatorOpenId,
      operatorName: event.operatorName,
      action,
      decisionNote: null,
      resultStatus: "processing",
      resultMessage: null,
      paperclipStatus: null,
      versionMatched: 1,
      processedAt: new Date().toISOString(),
    });

    try {
      if (isInteractionResourceKey(approvalId)) {
        return await this.processInteractionAction(event, action, token, approvalId);
      }
      return await this.processAction(event, action, token, approvalId);
    } catch (err) {
      this.deps.callbackRepo.updateResult(event.eventId, "retryable_failed", String(err));
      logger.error("callback processing error", { eventId: event.eventId, error: String(err) });
      return this.toast("处理失败，请稍后重试");
    }
  }

  // --- Approval path (existing) ---

  private async processAction(
    event: CardActionEvent,
    action: string,
    token: string,
    approvalId: string,
  ) {
    const validation = this.deps.tokenService.validate(token);
    if (!validation.valid || !validation.record) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", validation.reason);
      return this.toast("操作凭证无效或已过期");
    }

    const rec = validation.record;
    if (!rec.allowedActions.includes(action)) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "action_not_allowed");
      return this.toast("不允许的操作");
    }

    if (rec.approvalId !== approvalId) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "approval_id_mismatch");
      return this.toast("不允许的操作");
    }

    if (rec.recipientOpenId !== event.operatorOpenId) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "operator_not_authorized");
      return this.toast("您不是该审批的授权审批人");
    }

    const company = findCompanyConfig(this.deps.config.companies, rec.companyId);
    if (!company) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "company_not_configured");
      return this.toast("公司未配置");
    }

    this.deps.callbackRepo.updateResult(event.eventId, "processing", undefined, undefined);

    let approval: PaperclipApproval;
    try {
      approval = await this.deps.paperclip.getApproval(approvalId);
    } catch (err) {
      this.deps.callbackRepo.updateResult(event.eventId, "retryable_failed", `read approval failed: ${err}`);
      return this.toast("读取审批状态失败，请重试");
    }

    if (["approved", "rejected", "cancelled"].includes(approval.status)) {
      this.deps.tokenService.consume(token);
      this.deps.callbackRepo.updateResult(event.eventId, "succeeded", "already_decided", approval.status);
      await this.updateAllCards(approvalId, approval.status, event.operatorName, rec.companyId);
      return this.toast(`该审批已处理（${approval.status}），请以 Paperclip 状态为准`);
    }

    if (approval.status === "revision_requested") {
      this.deps.tokenService.invalidate(token);
      this.deps.callbackRepo.updateResult(event.eventId, "succeeded", "revision_requested", approval.status);
      await this.updateAllCards(approvalId, approval.status, event.operatorName, rec.companyId);
      return this.toast("该审批已请求修改，当前卡片已失效");
    }

    const currentVersion = buildVersionSnapshot(approval.updatedAt, approval.payload);
    if (!versionMatches(currentVersion, rec.version)) {
      incMetric(METRIC_NAMES.versionMismatches);
      this.deps.tokenService.invalidate(token);
      this.deps.callbackRepo.updateResult(event.eventId, "version_mismatch", "version_changed", approval.status);
      logger.warn("version mismatch", { approvalId, expected: rec.version, actual: currentVersion });
      return this.toast("审批内容已更新，当前卡片已失效，请等待新卡片");
    }

    if (!isAuthorizedApprover(company, approval.type, event.operatorOpenId)) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "not_authorized_approver");
      return this.toast("您不是该审批的授权审批人");
    }

    return this.executeDecision(event, action, token, approvalId, approval, rec.companyId);
  }

  private async handleViewDetails(
    event: CardActionEvent,
    token: string,
    approvalId: string,
  ) {
    const validation = this.deps.tokenService.validate(token);
    if (!validation.valid || !validation.record) {
      return this.toast("操作凭证无效或已过期");
    }
    const rec = validation.record;
    if (!rec.allowedActions.includes("view_details")) {
      return this.toast("不允许的操作");
    }
    if (rec.approvalId !== approvalId) {
      return this.toast("不允许的操作");
    }
    if (rec.recipientOpenId !== event.operatorOpenId) {
      return this.toast("您不是该审批的授权审批人");
    }
    const company = findCompanyConfig(this.deps.config.companies, rec.companyId);
    if (!company) {
      return this.toast("公司未配置");
    }

    let approval: PaperclipApproval;
    try {
      approval = await this.deps.paperclip.getApproval(approvalId);
    } catch (err) {
      logger.warn("view_details: read approval failed", { approvalId, error: String(err) });
      return this.toast("读取审批详情失败，请重试");
    }

    if (!isAuthorizedApprover(company, approval.type, event.operatorOpenId)) {
      return this.toast("您不是该审批的授权审批人");
    }

    let issues: Awaited<ReturnType<PaperclipClient["getApprovalIssues"]>> = [];
    try {
      issues = await this.deps.paperclip.getApprovalIssues(approvalId);
    } catch (err) {
      logger.warn("view_details: read issues failed, degrading to empty", {
        approvalId, error: String(err),
      });
    }

    let comments: Awaited<ReturnType<PaperclipClient["getApprovalComments"]>> = [];
    try {
      comments = await this.deps.paperclip.getApprovalComments(approvalId);
    } catch (err) {
      logger.warn("view_details: read comments failed, degrading to empty", {
        approvalId, error: String(err),
      });
    }

    const card = renderApprovalDetailCard(approval, issues, comments, token, isActionable(approval.type));
    return this.cardResponse(card);
  }

  private async executeDecision(
    event: CardActionEvent,
    action: string,
    token: string,
    approvalId: string,
    approval: PaperclipApproval,
    companyId: string,
  ) {
    incMetric(METRIC_NAMES.decisionRequests);
    const decisionNote = `通过飞书完成审批；审批人：${event.operatorName}；操作：${action}。`;

    try {
      const result = action === "approve"
        ? await this.deps.paperclip.approve(approvalId, decisionNote)
        : await this.deps.paperclip.reject(approvalId, decisionNote);

      this.deps.tokenService.consume(token);
      this.deps.callbackRepo.updateResult(event.eventId, "succeeded", undefined, result.status);
      await this.updateAllCards(approvalId, result.status, event.operatorName, companyId, decisionNote);
      logger.info("decision committed", { approvalId, action, status: result.status });
      return this.toast(action === "approve" ? "已同意" : "已拒绝");
    } catch (err) {
      return this.handleDecisionError(event, action, token, approvalId, companyId, err);
    }
  }

  private async handleDecisionError(
    event: CardActionEvent,
    action: string,
    token: string,
    approvalId: string,
    companyId: string,
    err: unknown,
  ) {
    incMetric(METRIC_NAMES.decisionFailures);
    const clientErr = err as PaperclipClientError;

    if (clientErr.statusCode >= 500 || clientErr.statusCode === 0) {
      try {
        const current = await this.deps.paperclip.getApproval(approvalId);
        const targetStatus = action === "approve" ? "approved" : "rejected";
        if (current.status === targetStatus) {
          incMetric(METRIC_NAMES.decisionCommittedUnknown);
          this.deps.tokenService.consume(token);
          this.deps.callbackRepo.updateResult(
            event.eventId, "decision_committed_side_effect_unknown",
            "5xx but approval reached target state", current.status,
          );
          logger.error("ALERT: decision committed but side effects unknown", {
            approvalId, action, targetStatus,
          });
          await this.updateAllCards(approvalId, current.status, event.operatorName, companyId);
          return this.toast(action === "approve" ? "已同意" : "已拒绝");
        }
      } catch {
        // re-read also failed
      }
      this.deps.callbackRepo.updateResult(event.eventId, "retryable_failed", String(err));
      return this.toast("处理失败，请稍后重试");
    }

    this.deps.tokenService.consume(token);
    this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", String(err));
    return this.toast("操作被拒绝，请以 Paperclip 状态为准");
  }

  // --- Interaction path ---

  private async processInteractionAction(
    event: CardActionEvent,
    action: string,
    token: string,
    resourceKey: string,
  ) {
    const parts = parseInteractionResourceKey(resourceKey);
    if (!parts) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "invalid_resource_key");
      return this.toast("无效的操作请求");
    }

    const validation = this.deps.tokenService.validate(token);
    if (!validation.valid || !validation.record) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", validation.reason);
      return this.toast("操作凭证无效或已过期");
    }

    const rec = validation.record;
    if (!rec.allowedActions.includes(action)) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "action_not_allowed");
      return this.toast("不允许的操作");
    }

    if (rec.approvalId !== resourceKey) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "resource_key_mismatch");
      return this.toast("不允许的操作");
    }

    if (rec.recipientOpenId !== event.operatorOpenId) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "operator_not_authorized");
      return this.toast("您不是该确认请求的授权审批人");
    }

    const company = findCompanyConfig(this.deps.config.companies, rec.companyId);
    if (!company) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "company_not_configured");
      return this.toast("公司未配置");
    }

    let interaction: PaperclipInteraction | null;
    try {
      interaction = await this.deps.paperclip.findInteraction(parts.issueId, parts.interactionId);
    } catch (err) {
      this.deps.callbackRepo.updateResult(event.eventId, "retryable_failed", `read interaction failed: ${err}`);
      return this.toast("读取确认请求状态失败，请重试");
    }

    if (!interaction) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "interaction_not_found");
      return this.toast("确认请求不存在");
    }

    // Identity validation: interaction must match resource key and token company
    const identityError = validateInteractionIdentityFromParts(interaction, parts, rec.companyId);
    if (identityError) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", identityError);
      return this.toast("确认请求身份校验失败");
    }

    if (["accepted", "rejected", "cancelled", "expired", "failed"].includes(interaction.status)) {
      this.deps.tokenService.consume(token);
      this.deps.callbackRepo.updateResult(event.eventId, "succeeded", "already_decided", interaction.status);
      await this.updateInteractionCards(resourceKey, interaction, event.operatorName, rec.companyId);
      return this.toast(`该确认请求已处理（${interaction.status}），请以 Paperclip 状态为准`);
    }

    const currentVersion = buildVersionSnapshot(interaction.updatedAt, interaction.payload);
    if (!versionMatches(currentVersion, rec.version)) {
      incMetric(METRIC_NAMES.versionMismatches);
      this.deps.tokenService.invalidate(token);
      this.deps.callbackRepo.updateResult(event.eventId, "version_mismatch", "version_changed", interaction.status);
      logger.warn("interaction version mismatch", {
        resourceKey, expected: rec.version, actual: currentVersion,
      });
      return this.toast("确认请求内容已更新，当前卡片已失效，请等待新卡片");
    }

    if (!isAuthorizedApprover(company, "request_confirmation", event.operatorOpenId)) {
      this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", "not_authorized_approver");
      return this.toast("您不是该确认请求的授权审批人");
    }

    return this.executeInteractionDecision(event, action, token, parts, resourceKey, interaction, rec.companyId);
  }

  private async executeInteractionDecision(
    event: CardActionEvent,
    action: string,
    token: string,
    parts: { issueId: string; interactionId: string },
    resourceKey: string,
    interaction: PaperclipInteraction,
    companyId: string,
  ) {
    incMetric(METRIC_NAMES.interactionDecisionRequests);
    const reason = action === "reject"
      ? `通过飞书拒绝；审批人：${event.operatorName}。`
      : undefined;

    try {
      const result = action === "accept"
        ? await this.deps.paperclip.acceptInteraction(parts.issueId, parts.interactionId)
        : await this.deps.paperclip.rejectInteraction(parts.issueId, parts.interactionId, reason);

      this.deps.tokenService.consume(token);
      this.deps.callbackRepo.updateResult(event.eventId, "succeeded", undefined, result.status);
      await this.updateInteractionCards(resourceKey, result, event.operatorName, companyId, reason);
      logger.info("interaction decision committed", {
        resourceKey, action, status: result.status,
      });
      return this.toast(action === "accept" ? "已同意" : "已拒绝");
    } catch (err) {
      return this.handleInteractionDecisionError(event, action, token, parts, resourceKey, companyId, err);
    }
  }

  private async handleInteractionDecisionError(
    event: CardActionEvent,
    action: string,
    token: string,
    parts: { issueId: string; interactionId: string },
    resourceKey: string,
    companyId: string,
    err: unknown,
  ) {
    incMetric(METRIC_NAMES.interactionDecisionFailures);
    const clientErr = err as PaperclipClientError;

    if (clientErr.statusCode >= 500 || clientErr.statusCode === 0) {
      try {
        const current = await this.deps.paperclip.findInteraction(parts.issueId, parts.interactionId);
        const targetStatus = action === "accept" ? "accepted" : "rejected";
        if (current && current.status === targetStatus) {
          incMetric(METRIC_NAMES.interactionDecisionCommittedUnknown);
          this.deps.tokenService.consume(token);
          this.deps.callbackRepo.updateResult(
            event.eventId, "decision_committed_side_effect_unknown",
            "5xx but interaction reached target state", current.status,
          );
          logger.error("ALERT: interaction decision committed but side effects unknown", {
            resourceKey, action, targetStatus,
          });
          await this.updateInteractionCards(resourceKey, current, event.operatorName, companyId);
          return this.toast(action === "accept" ? "已同意" : "已拒绝");
        }
      } catch {
        // re-read also failed
      }
      this.deps.callbackRepo.updateResult(event.eventId, "retryable_failed", String(err));
      return this.toast("处理失败，请稍后重试");
    }

    this.deps.tokenService.consume(token);
    this.deps.callbackRepo.updateResult(event.eventId, "permanent_failed", String(err));
    return this.toast("操作被拒绝，请以 Paperclip 状态为准");
  }

  // --- Shared helpers ---

  private async updateAllCards(
    approvalId: string,
    status: string,
    operatorName: string,
    companyId: string,
    decisionNote?: string,
  ) {
    const deliveries = this.deps.deliveryRepo.findActiveByApproval(approvalId);
    const approval = await this.deps.paperclip.getApproval(approvalId).catch(() => null);
    const approvalType = approval?.type ?? "unknown";
    const cardContent = renderResultCard(approvalType, status, operatorName, decisionNote);
    const feishu = this.deps.feishuRegistry.getForCompany(companyId);
    if (!feishu) {
      logger.warn("no feishu client for company, skipping card updates", { companyId, approvalId });
    }

    for (const d of deliveries) {
      if (!d.messageId || !feishu) continue;
      try {
        await feishu.updateInteractiveCard(d.messageId, cardContent);
      } catch (err) {
        logger.warn("card update failed during callback", {
          messageId: d.messageId, error: String(err),
        });
      }
    }
  }

  private async updateInteractionCards(
    resourceKey: string,
    interaction: PaperclipInteraction,
    operatorName: string,
    companyId: string,
    reason?: string,
  ) {
    const deliveries = this.deps.deliveryRepo.findActiveByApproval(resourceKey);
    const cardContent = renderConfirmationResultCard(interaction, interaction.status, operatorName, reason);
    const feishu = this.deps.feishuRegistry.getForCompany(companyId);
    if (!feishu) {
      logger.warn("no feishu client for company, skipping interaction card updates", { companyId, resourceKey });
    }

    for (const d of deliveries) {
      if (!d.messageId || !feishu) continue;
      try {
        await feishu.updateInteractiveCard(d.messageId, cardContent);
      } catch (err) {
        logger.warn("interaction card update failed during callback", {
          messageId: d.messageId, error: String(err),
        });
      }
    }
  }

  private cardResponse(cardContent: string): Record<string, unknown> {
    return {
      toast: { type: "info", content: "详情已展开" },
      card: { type: "raw", data: JSON.parse(cardContent) },
    };
  }

  private toast(text: string): Record<string, unknown> {
    return { toast: { type: "info", content: text } };
  }
}
