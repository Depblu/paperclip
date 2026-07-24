export interface ApprovalTypeMeta {
  label: string;
  hint: string;
  canFeishu: boolean;
}

export const APPROVAL_TYPE_META: Record<string, ApprovalTypeMeta> = {
  hire_agent: { label: "招聘 Agent", hint: "支持飞书直接 approve/reject", canFeishu: true },
  approve_ceo_strategy: { label: "CEO 战略审批", hint: "支持飞书直接 approve/reject", canFeishu: true },
  request_board_approval: { label: "Board 审批", hint: "支持飞书直接 approve/reject", canFeishu: true },
  budget_override_required: { label: "预算超限处理", hint: "仅通知，需跳转 Paperclip 操作", canFeishu: false },
  request_confirmation: { label: "确认请求（Interaction）", hint: "支持飞书直接 accept/reject，通过 Issue Interaction API", canFeishu: true },
};
