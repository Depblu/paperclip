import type {
  PaperclipApproval,
  PaperclipApprovalWithMeta,
  PaperclipComment,
  PaperclipIssue,
  PaperclipInteraction,
  PaperclipIssueListItem,
  VersionSnapshot,
} from "../types.js";
import type { TestApprovalResult } from "./test-approval-sessions.js";
import { isActionable } from "../approvals/routing.js";

const TYPE_LABELS: Record<string, string> = {
  hire_agent: "招聘 Agent",
  approve_ceo_strategy: "CEO 策略审批",
  budget_override_required: "预算超限",
  request_board_approval: "Board 审批请求",
};

const MAX_FIELD_LEN = 200;
const MAX_PAYLOAD_LEN = 800;
const MAX_LIST_ITEMS = 5;

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
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

function viewDetailsButton(token: string, approvalId: string): Record<string, unknown> {
  return {
    tag: "button",
    text: { tag: "plain_text", content: "查看详情" },
    type: "default",
    value: { action: "view_details", token, approval_id: approvalId },
  };
}

function payloadBlock(payload: Record<string, unknown>): string {
  let json: string;
  try {
    json = JSON.stringify(payload, null, 2) ?? "{}";
  } catch {
    json = "（payload 无法序列化）";
  }
  return truncate(json, MAX_PAYLOAD_LEN);
}

function issuesBlock(issues: PaperclipIssue[]): string {
  if (issues.length === 0) return "无关联 Issue";
  const lines = issues.slice(0, MAX_LIST_ITEMS).map(
    (issue) => `- ${issue.identifier ?? issue.id}: ${truncate(issue.title, MAX_FIELD_LEN)}`,
  );
  if (issues.length > MAX_LIST_ITEMS) {
    lines.push(`…（另有 ${issues.length - MAX_LIST_ITEMS} 条未显示）`);
  }
  return lines.join("\n");
}

function commentsBlock(comments: PaperclipComment[]): string {
  if (comments.length === 0) return "无评论";
  const lines = comments.slice(0, MAX_LIST_ITEMS).map(
    (comment) => `- ${comment.createdAt}: ${truncate(comment.body, MAX_FIELD_LEN)}`,
  );
  if (comments.length > MAX_LIST_ITEMS) {
    lines.push(`…（另有 ${comments.length - MAX_LIST_ITEMS} 条未显示）`);
  }
  return lines.join("\n");
}

export function renderApprovalCard(
  approval: PaperclipApprovalWithMeta,
  _version: VersionSnapshot,
  actionToken: string,
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

  elements.push({ tag: "hr" });

  if (!actionable) {
    elements.push({
      tag: "markdown",
      content: `⚠️ **${typeLabel(approval.type)}** 不支持飞书决策，请在 Paperclip 中处理；可在下方查看只读详情。`,
    });
    elements.push({
      tag: "action",
      actions: [viewDetailsButton(actionToken, approval.id)],
    });
  } else {
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
        viewDetailsButton(actionToken, approval.id),
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

export function renderApprovalDetailCard(
  approval: PaperclipApproval,
  issues: PaperclipIssue[],
  comments: PaperclipComment[],
  actionToken: string,
  actionable: boolean,
): string {
  const elements: Record<string, unknown>[] = [
    {
      tag: "markdown",
      content: [
        `**类型**: ${typeLabel(approval.type)}`,
        `**ID**: ${approval.id}`,
        `**状态**: ${approval.status}`,
        `**创建时间**: ${approval.createdAt}`,
        `**更新时间**: ${approval.updatedAt}`,
      ].join("\n"),
    },
    { tag: "hr" },
    { tag: "markdown", content: `**Payload**\n\`\`\`json\n${payloadBlock(approval.payload)}\n\`\`\`` },
    { tag: "hr" },
    { tag: "markdown", content: `**关联 Issue**\n${issuesBlock(issues)}` },
    { tag: "hr" },
    { tag: "markdown", content: `**评论**\n${commentsBlock(comments)}` },
    { tag: "hr" },
  ];

  if (actionable) {
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
      ],
    });
  } else {
    elements.push({
      tag: "markdown",
      content: `⚠️ **${typeLabel(approval.type)}** 不支持飞书决策，请在 Paperclip 中处理。`,
    });
  }

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: actionable ? "blue" : "orange",
      title: { tag: "plain_text", content: `审批详情: ${typeLabel(approval.type)}` },
    },
    elements,
  });
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
          viewDetailsButton(actionToken, sessionId),
        ],
      },
    ],
  });
}

export function renderTestApprovalDetailCard(
  session: TestApprovalResult,
  actionToken: string,
): string {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: `测试详情: ${typeLabel(session.type)}` },
    },
    elements: [
      {
        tag: "markdown",
        content: [
          `**类型**: ${typeLabel(session.type)}`,
          `**测试会话**: ${session.sessionId}`,
          `**状态**: ${session.status}`,
          `**创建时间**: ${session.createdAt}`,
          `**到期时间**: ${session.expiresAt}`,
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
            value: { action: "approve", token: actionToken, approval_id: session.sessionId },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "拒绝" },
            type: "danger",
            value: { action: "reject", token: actionToken, approval_id: session.sessionId },
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

// --- Interaction confirmation cards ---

function confirmationPayload(interaction: PaperclipInteraction): {
  prompt: string;
  acceptLabel: string;
  rejectLabel: string;
  detailsMarkdown: string | null;
  target: string | null;
} {
  const p = interaction.payload as Record<string, unknown>;
  const prompt = typeof p.prompt === "string" ? p.prompt : "确认请求";
  const acceptLabel = typeof p.acceptLabel === "string" && p.acceptLabel ? p.acceptLabel : "同意";
  const rejectLabel = typeof p.rejectLabel === "string" && p.rejectLabel ? p.rejectLabel : "拒绝";
  const detailsMarkdown = typeof p.detailsMarkdown === "string" ? p.detailsMarkdown : null;
  let target: string | null = null;
  if (p.target && typeof p.target === "object") {
    const t = p.target as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof t.label === "string" && t.label) parts.push(t.label);
    if (typeof t.key === "string" && t.key) parts.push(t.key);
    if (typeof t.revisionNumber === "number") parts.push(`rev ${t.revisionNumber}`);
    if (parts.length > 0) {
      target = parts.join(" · ");
    } else if (typeof t.type === "string") {
      target = t.type;
    }
  }
  return { prompt, acceptLabel, rejectLabel, detailsMarkdown, target };
}

export function renderConfirmationCard(
  interaction: PaperclipInteraction,
  actionToken: string,
  issue?: PaperclipIssueListItem,
): string {
  const { prompt, acceptLabel, rejectLabel, detailsMarkdown, target } = confirmationPayload(interaction);
  const resourceKey = `interaction:${interaction.issueId}:${interaction.id}`;
  const elements: Record<string, unknown>[] = [];

  const issueDisplay = issue?.identifier ?? issue?.id ?? interaction.issueId.slice(0, 8);
  const issueTitle = issue?.title ? ` — ${truncate(issue.title, MAX_FIELD_LEN)}` : "";

  elements.push({
    tag: "markdown",
    content: [
      `**Issue**: ${issueDisplay}${issueTitle}`,
      `**Interaction ID**: ${interaction.id.slice(0, 8)}`,
      `**状态**: ${interaction.status}`,
      target ? `**Target**: ${target}` : null,
    ].filter(Boolean).join("\n"),
  });

  elements.push({ tag: "hr" });

  elements.push({
    tag: "markdown",
    content: `**确认请求**\n${truncate(prompt, MAX_FIELD_LEN)}`,
  });

  if (detailsMarkdown) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "markdown",
      content: `**详情**\n${truncate(detailsMarkdown, MAX_PAYLOAD_LEN)}`,
    });
  }

  elements.push({ tag: "hr" });

  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: acceptLabel },
        type: "success",
        value: { action: "accept", token: actionToken, approval_id: resourceKey },
      },
      {
        tag: "button",
        text: { tag: "plain_text", content: rejectLabel },
        type: "danger",
        value: { action: "reject", token: actionToken, approval_id: resourceKey },
      },
    ],
  });

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: interaction.title ?? "确认请求" },
    },
    elements,
  };
  return JSON.stringify(card);
}

export function renderConfirmationResultCard(
  interaction: PaperclipInteraction | null,
  status: string,
  operatorName?: string,
  reason?: string,
): string {
  const colorMap: Record<string, string> = {
    accepted: "green",
    rejected: "red",
    cancelled: "grey",
    expired: "grey",
    failed: "red",
  };
  const statusLabels: Record<string, string> = {
    accepted: "已同意",
    rejected: "已拒绝",
    cancelled: "已取消",
    expired: "已过期",
    failed: "已失败",
  };

  const lines: string[] = [`**结果**: ${statusLabels[status] ?? status}`];
  if (operatorName) lines.push(`**操作人**: ${operatorName}`);
  if (reason) lines.push(`**原因**: ${reason}`);

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: colorMap[status] ?? "grey",
      title: { tag: "plain_text", content: interaction?.title ?? "确认请求" },
    },
    elements: [{ tag: "markdown", content: lines.join("\n") }],
  });
}
