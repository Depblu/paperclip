export function formatMoney(cents: number, locale = "zh-CN") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function statusLabel(value: string | null | undefined) {
  if (!value) return "无";
  return statusLabels[value] ?? value.replaceAll("_", " ");
}

const statusLabels: Record<string, string> = {
  empty: "空闲",
  occupied: "已占用",
  reserved: "预留",
  offline: "离线",
  idle: "空闲",
  running: "运行中",
  paused: "已暂停",
  error: "异常",
  todo: "待办",
  in_progress: "进行中",
  blocked: "阻塞",
  in_review: "评审中",
  done: "已完成",
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
  cost_overrun: "成本超限",
  blocked_too_long: "阻塞过久",
  agent_error: "智能体异常",
  approval_pending: "审批待办",
};
