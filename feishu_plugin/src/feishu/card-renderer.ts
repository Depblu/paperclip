import type { PaperclipApprovalWithMeta, VersionSnapshot } from "../types.js";
import { isActionable } from "../approvals/routing.js";

const TYPE_LABELS: Record<string, string> = {
  hire_agent: "招聘 Agent",
  approve_ceo_strategy: "CEO 策略审批",
  budget_override_required: "预算超限",
  request_board_approval: "Board 审批请求",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function safeSummary(approval: PaperclipApprovalWithMeta): string {
  const parts: string[] = [];
  const p = approval.payload as Record<string, unknown>;
  if (typeof p.title === "string") parts.push(p.title);
  if (typeof p.description === "string") parts.push(p.description.slice(0, 200));
  if (typeof p.agentName === "string") parts.push(`Agent: ${p.agentName}`);
  if (typeof p.role === "string") parts.push(`Role: ${p.role}`);
  if (approval.issues && approval.issues.length > 0) {
    const issue = approval.issues[0];
    parts.push(`Issue: ${issue.identifier ?? issue.id} — ${issue.title}`);
  }
  return parts.length > 0 ? parts.join("\n") : "无可用摘要";
}

export function renderApprovalCard(
  approval: PaperclipApprovalWithMeta,
  _version: VersionSnapshot,
  actionToken: string,
  detailUrl: string,
): string {
  const actionable = isActionable(approval.type);
  const elements: Record<string, unknown>[] = [];

  elements.push({
    tag: "markdown",
    content: [
      `**类型**: ${typeLabel(approval.type)}`,
      `**ID**: ${approval.id.slice(0, 8)}`,
      `**状态**: ${approval.status}`,
      `**创建时间**: ${approval.createdAt}`,
    ].join("\n"),
  });

  elements.push({ tag: "hr" });

  elements.push({
    tag: "markdown",
    content: `**摘要**\n${safeSummary(approval)}`,
  });

  if (!actionable) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "markdown",
      content: `⚠️ **${typeLabel(approval.type)}** 不支持飞书操作，请前往 Paperclip 处理。`,
    });
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "前往 Paperclip 处理" },
          type: "primary",
          url: detailUrl,
        },
      ],
    });
  } else {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "同意" },
          type: "success",
          value: { action: "approve", token: actionToken, approval_id: approval.id },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "拒绝" },
          type: "danger",
          value: { action: "reject", token: actionToken, approval_id: approval.id },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "查看详情" },
          type: "default",
          url: detailUrl,
        },
      ],
    });
  }

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: actionable ? "blue" : "orange",
      title: { tag: "plain_text", content: `审批: ${typeLabel(approval.type)}` },
    },
    elements,
  };
  return JSON.stringify(card);
}

export function renderTestApprovalCard(
  approvalType: string,
  sessionId: string,
  actionToken: string,
): string {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: `连通性测试: ${typeLabel(approvalType)}` },
    },
    elements: [
      {
        tag: "markdown",
        content: [
          `**类型**: ${typeLabel(approvalType)}`,
          "**用途**: 验证 Feishu Bridge 与飞书卡片回调",
          "该操作仅返回测试结果，不会读取或修改 Paperclip 数据。",
        ].join("\n"),
      },
      { tag: "hr" },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "同意" },
            type: "success",
            value: { action: "approve", token: actionToken, approval_id: sessionId },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "拒绝" },
            type: "danger",
            value: { action: "reject", token: actionToken, approval_id: sessionId },
          },
        ],
      },
    ],
  });
}

export function renderResultCard(
  approvalType: string,
  status: string,
  operatorName?: string,
  decisionNote?: string,
): string {
  const colorMap: Record<string, string> = {
    approved: "green",
    rejected: "red",
    cancelled: "grey",
    revision_requested: "orange",
  };
  const statusLabels: Record<string, string> = {
    approved: "已同意",
    rejected: "已拒绝",
    cancelled: "已取消",
    revision_requested: "已请求修改",
  };

  const lines: string[] = [`**结果**: ${statusLabels[status] ?? status}`];
  if (operatorName) lines.push(`**操作人**: ${operatorName}`);
  if (decisionNote) lines.push(`**意见**: ${decisionNote}`);

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: colorMap[status] ?? "grey",
      title: { tag: "plain_text", content: `审批: ${typeLabel(approvalType)}` },
    },
    elements: [{ tag: "markdown", content: lines.join("\n") }],
  });
}
