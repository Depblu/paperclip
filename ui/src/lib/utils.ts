import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { deriveAgentUrlKey, deriveProjectUrlKey, normalizeProjectUrlKey, hasNonAsciiContent } from "@paperclipai/shared";
import type { BillingType, FinanceDirection, FinanceEventKind } from "@paperclipai/shared";
import i18n from "i18next";

type TranslateFn = typeof i18n.t;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Format a USD amount in cents. The "US$" prefix is intentional and
 * locale-independent so finance readers always see a clear currency
 * label; the digit grouping itself follows the active locale.
 */
export function formatCents(cents: number, locale: string = i18n.language ?? "en"): string {
  const formatted = (cents / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `US$${formatted}`;
}

export function formatNumber(n: number, locale: string = i18n.language ?? "en"): string {
  return n.toLocaleString(locale);
}

/**
 * Format a project's budget for the projects list view (IA Phase 4 — PAP-60).
 * Monthly budgets render a `/mo` suffix; lifetime budgets show the bare amount.
 */
export function formatProjectBudget(budget: { amountCents: number; windowKind: string }): string {
  const amount = formatCents(budget.amountCents);
  return budget.windowKind === "calendar_month_utc" ? `${amount}/mo` : amount;
}

export function formatDate(date: Date | string, locale: string = i18n.language ?? "en"): string {
  return new Date(date).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string, locale: string = i18n.language ?? "en"): string {
  return new Date(date).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(date: Date | string, locale: string = i18n.language ?? "en"): string {
  return new Date(date).toLocaleString(locale, {
    month: "short",
    day: "numeric",
  });
}

export function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) {
    return i18n.t("commonRelative.justNow", { defaultValue: "just now" });
  }
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return i18n.t("commonRelative.minutesAgo", { count: diffMin, defaultValue: `${diffMin}m ago` });
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) {
    return i18n.t("commonRelative.hoursAgo", { count: diffHr, defaultValue: `${diffHr}h ago` });
  }
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) {
    return i18n.t("commonRelative.daysAgo", { count: diffDay, defaultValue: `${diffDay}d ago` });
  }
  return formatDate(date);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Humanize a millisecond duration into a compact `1h 2m`, `45m 12s`, `12s` string. */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/** Map a raw provider slug to a display-friendly name. */
export function providerDisplayName(provider: string): string {
  const map: Record<string, string> = {
    anthropic: "Anthropic",
    aws_bedrock: "AWS Bedrock",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    chatgpt: "ChatGPT",
    google: "Google",
    cursor: "Cursor",
    jetbrains: "JetBrains AI",
  };
  return map[provider.toLowerCase()] ?? provider;
}

export function billingTypeDisplayName(billingType: BillingType, t: TranslateFn = i18n.t): string {
  const map: Record<BillingType, string> = {
    metered_api: t("lib.utils.billing_type_metered_api.label", { defaultValue: "Metered API" }),
    subscription_included: t("lib.utils.billing_type_subscription_included.label", { defaultValue: "Subscription" }),
    subscription_overage: t("lib.utils.billing_type_subscription_overage.label", { defaultValue: "Subscription overage" }),
    credits: t("lib.utils.billing_type_credits.label", { defaultValue: "Credits" }),
    fixed: t("lib.utils.billing_type_fixed.label", { defaultValue: "Fixed" }),
    unknown: t("lib.utils.billing_type_unknown.label", { defaultValue: "Unknown" }),
  };
  return map[billingType];
}

export function quotaSourceDisplayName(source: string): string {
  const map: Record<string, string> = {
    "anthropic-oauth": "Anthropic OAuth",
    "claude-cli": "Claude CLI",
    "bedrock": "AWS Bedrock",
    "codex-rpc": "Codex app server",
    "codex-wham": "ChatGPT WHAM",
  };
  return map[source] ?? source;
}

function coerceBillingType(value: unknown): BillingType | null {
  if (
    value === "metered_api" ||
    value === "subscription_included" ||
    value === "subscription_overage" ||
    value === "credits" ||
    value === "fixed" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function readRunCostUsd(payload: Record<string, unknown> | null): number {
  if (!payload) return 0;
  for (const key of ["costUsd", "cost_usd", "total_cost_usd"] as const) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

export function visibleRunCostUsd(
  usage: Record<string, unknown> | null,
  result: Record<string, unknown> | null = null,
): number {
  const billingType = coerceBillingType(usage?.billingType) ?? coerceBillingType(result?.billingType);
  if (billingType === "subscription_included") return 0;
  return readRunCostUsd(usage) || readRunCostUsd(result);
}

export function financeEventKindDisplayName(eventKind: FinanceEventKind, t: TranslateFn = i18n.t): string {
  const map: Record<FinanceEventKind, string> = {
    inference_charge: t("lib.utils.finance_event_kind_inference_charge.label", { defaultValue: "Inference charge" }),
    platform_fee: t("lib.utils.finance_event_kind_platform_fee.label", { defaultValue: "Platform fee" }),
    credit_purchase: t("lib.utils.finance_event_kind_credit_purchase.label", { defaultValue: "Credit purchase" }),
    credit_refund: t("lib.utils.finance_event_kind_credit_refund.label", { defaultValue: "Credit refund" }),
    credit_expiry: t("lib.utils.finance_event_kind_credit_expiry.label", { defaultValue: "Credit expiry" }),
    byok_fee: t("lib.utils.finance_event_kind_byok_fee.label", { defaultValue: "BYOK fee" }),
    gateway_overhead: t("lib.utils.finance_event_kind_gateway_overhead.label", { defaultValue: "Gateway overhead" }),
    log_storage_charge: t("lib.utils.finance_event_kind_log_storage_charge.label", { defaultValue: "Log storage" }),
    logpush_charge: t("lib.utils.finance_event_kind_logpush_charge.label", { defaultValue: "Logpush" }),
    provisioned_capacity_charge: t("lib.utils.finance_event_kind_provisioned_capacity_charge.label", { defaultValue: "Provisioned capacity" }),
    training_charge: t("lib.utils.finance_event_kind_training_charge.label", { defaultValue: "Training" }),
    custom_model_import_charge: t("lib.utils.finance_event_kind_custom_model_import_charge.label", { defaultValue: "Custom model import" }),
    custom_model_storage_charge: t("lib.utils.finance_event_kind_custom_model_storage_charge.label", { defaultValue: "Custom model storage" }),
    manual_adjustment: t("lib.utils.finance_event_kind_manual_adjustment.label", { defaultValue: "Manual adjustment" }),
  };
  return map[eventKind];
}

export function financeDirectionDisplayName(direction: FinanceDirection, t: TranslateFn = i18n.t): string {
  return direction === "credit"
    ? t("lib.utils.finance_direction_credit.label", { defaultValue: "Credit" })
    : t("lib.utils.finance_direction_debit.label", { defaultValue: "Debit" });
}

/** Build an issue URL using the human-readable identifier when available. */
export function issueUrl(issue: { id: string; identifier?: string | null }): string {
  return `/issues/${issue.identifier ?? issue.id}`;
}

/** Build an agent route URL using the short URL key when available. */
export function agentRouteRef(agent: { id: string; urlKey?: string | null; name?: string | null }): string {
  return agent.urlKey ?? deriveAgentUrlKey(agent.name, agent.id);
}

/** Build an agent URL using the short URL key when available. */
export function agentUrl(agent: { id: string; urlKey?: string | null; name?: string | null }): string {
  return `/agents/${agentRouteRef(agent)}`;
}

/** Build a project route reference, falling back to UUID when the derived key is ambiguous. */
export function projectRouteRef(project: { id: string; urlKey?: string | null; name?: string | null }): string {
  const key = project.urlKey ?? deriveProjectUrlKey(project.name, project.id);
  // Guard for rolling deploys or legacy data where the server returned a bare slug without UUID suffix.
  if (key === normalizeProjectUrlKey(project.name) && hasNonAsciiContent(project.name)) return project.id;
  return key;
}

/** Build a project URL using the short URL key when available. */
export function projectUrl(project: { id: string; urlKey?: string | null; name?: string | null }): string {
  return `/projects/${projectRouteRef(project)}`;
}

/** Build a project workspace URL scoped under its project. */
export function projectWorkspaceUrl(
  project: { id: string; urlKey?: string | null; name?: string | null },
  workspaceId: string,
): string {
  return `${projectUrl(project)}/workspaces/${workspaceId}`;
}
