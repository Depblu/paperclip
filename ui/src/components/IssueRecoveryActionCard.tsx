import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import type { TFunction } from "i18next";
import type {
  Agent,
  IssueRecoveryAction,
  IssueRecoveryActionKind,
  IssueRecoveryActionOutcome,
  IssueRecoveryActionStatus,
} from "@paperclipai/shared";
import { Eye, OctagonAlert, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { agentUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  deriveRecoveryDisplayState,
  type RecoveryDisplayState,
} from "@/lib/recovery-display";

export type RecoveryCardCardState = RecoveryDisplayState;
export const deriveRecoveryCardState = deriveRecoveryDisplayState;

export type RecoveryResolveOutcome =
  | "todo"
  | "done"
  | "in_review"
  | "false_positive_done"
  | "false_positive_in_review";

export interface IssueRecoveryActionCardProps {
  action: IssueRecoveryAction;
  agentMap?: ReadonlyMap<string, Agent>;
  /** Preferred state hint (e.g. observe_only when watchdog tone is requested). Falls back to derived state. */
  forcedState?: RecoveryCardCardState;
  /** Optional click handler for resolve menu actions. If omitted, the buttons are not rendered. */
  onResolve?: (outcome: RecoveryResolveOutcome) => void;
  /** Whether the viewer can run destructive board-only actions (e.g. false-positive dismissal). */
  canFalsePositive?: boolean;
  className?: string;
}

const KIND_LABEL_DEFAULTS: Record<IssueRecoveryActionKind, string> = {
  missing_disposition: "Missing Disposition",
  stranded_assigned_issue: "Stranded Task",
  workspace_validation: "Workspace Validation",
  active_run_watchdog: "Active Watchdog",
  issue_graph_liveness: "Graph Liveness",
};

const KIND_HEADLINE: Record<IssueRecoveryActionKind, string> = {
  missing_disposition: "This task's run finished, but no next step was chosen.",
  stranded_assigned_issue:
    "Paperclip retried this task's last run and it still has no live execution path.",
  workspace_validation:
    "Paperclip stopped this run because the task's git workspace could not be validated.",
  active_run_watchdog:
    "The active run has been silent. Recovery is observing without interrupting it.",
  issue_graph_liveness:
    "Paperclip detected this task lost a live action path. A recovery owner needs to act.",
};

function kindLabel(kind: IssueRecoveryActionKind, t: TFunction): string {
  const defaults = KIND_LABEL_DEFAULTS[kind] ?? kind.replaceAll("_", " ");
  return t(`components.issuerecoveryactioncard.kind_label_${kind}`, { defaultValue: defaults });
}

const STATE_TONE: Record<RecoveryCardCardState, {
  containerClass: string;
  iconWrapClass: string;
  iconClass: string;
  labelClass: string;
  Icon: typeof TriangleAlert;
  divider: string;
}> = {
  needed: {
    containerClass:
      "border-amber-300/70 bg-amber-50/85 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    iconWrapClass: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    iconClass: "text-amber-700 dark:text-amber-300",
    labelClass: "text-amber-900 dark:text-amber-200",
    Icon: TriangleAlert,
    divider: "border-amber-300/60 dark:border-amber-500/30",
  },
  in_progress: {
    containerClass:
      "border-sky-300/70 bg-sky-50/80 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100",
    iconWrapClass: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
    iconClass: "text-sky-700 dark:text-sky-300",
    labelClass: "text-sky-900 dark:text-sky-200",
    Icon: RefreshCw,
    divider: "border-sky-300/60 dark:border-sky-500/30",
  },
  observe_only: {
    containerClass:
      "border-border bg-muted/40 text-foreground dark:bg-muted/20",
    iconWrapClass: "bg-muted text-foreground/70",
    iconClass: "text-muted-foreground",
    labelClass: "text-muted-foreground",
    Icon: Eye,
    divider: "border-border/70",
  },
  escalated: {
    containerClass:
      "border-red-400/60 bg-red-50/85 text-red-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100",
    iconWrapClass: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
    iconClass: "text-red-700 dark:text-red-300",
    labelClass: "text-red-900 dark:text-red-200",
    Icon: OctagonAlert,
    divider: "border-red-400/50 dark:border-red-500/30",
  },
  resolved: {
    containerClass:
      "border-emerald-300/70 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    iconWrapClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
    iconClass: "text-emerald-700 dark:text-emerald-300",
    labelClass: "text-emerald-900 dark:text-emerald-200",
    Icon: Sparkles,
    divider: "border-emerald-300/60 dark:border-emerald-500/30",
  },
};

function cardStateLabel(state: RecoveryCardCardState, t: TFunction): string {
  switch (state) {
    case "needed": return t("components.issuerecoveryactioncard.recovery_needed.state_label", { defaultValue: "RECOVERY NEEDED" });
    case "in_progress": return t("components.issuerecoveryactioncard.recovery_in_progress.state_label", { defaultValue: "RECOVERY IN PROGRESS" });
    case "observe_only": return t("components.issuerecoveryactioncard.observing_active_run.state_label", { defaultValue: "OBSERVING ACTIVE RUN" });
    case "escalated": return t("components.issuerecoveryactioncard.recovery_escalated.state_label", { defaultValue: "RECOVERY ESCALATED" });
    case "resolved": return t("components.issuerecoveryactioncard.recovery_resolved.state_label", { defaultValue: "RECOVERY RESOLVED" });
  }
}

function cardStateAriaLabel(state: RecoveryCardCardState, t: TFunction): string {
  switch (state) {
    case "needed": return t("components.issuerecoveryactioncard.recovery_needed.aria_label", { defaultValue: "recovery needed" });
    case "in_progress": return t("components.issuerecoveryactioncard.recovery_in_progress.aria_label", { defaultValue: "recovery in progress" });
    case "observe_only": return t("components.issuerecoveryactioncard.observing_active_run.aria_label", { defaultValue: "observing active run" });
    case "escalated": return t("components.issuerecoveryactioncard.recovery_escalated.aria_label", { defaultValue: "recovery escalated" });
    case "resolved": return t("components.issuerecoveryactioncard.recovery_resolved.aria_label", { defaultValue: "recovery resolved" });
  }
}

const OUTCOME_LABEL: Record<IssueRecoveryActionOutcome, string> = {
  restored: "restored",
  delegated: "delegated to follow-up",
  false_positive: "false positive",
  blocked: "blocked",
  escalated: "escalated",
  cancelled: "cancelled",
};

function outcomeLabel(outcome: IssueRecoveryActionOutcome, t: TFunction): string {
  const defaults = OUTCOME_LABEL[outcome] ?? outcome;
  return t(`components.issuerecoveryactioncard.outcome_${outcome}`, { defaultValue: defaults });
}

function kindHeadline(kind: IssueRecoveryActionKind, t: TFunction): string {
  const defaults = KIND_HEADLINE[kind] ?? KIND_HEADLINE.missing_disposition;
  return t(`components.issuerecoveryactioncard.kind_headline_${kind}`, { defaultValue: defaults });
}

function readEvidenceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}…` : trimmed;
}

function pickEvidenceSummary(action: IssueRecoveryAction): string | null {
  const evidence = action.evidence ?? {};
  const candidates = [
    "summary",
    "detectedProgressSummary",
    "missingDisposition",
    "retryReason",
    "latestRunErrorCode",
    "latestRunStatus",
    "latestIssueStatus",
  ] as const;
  for (const key of candidates) {
    const next = readEvidenceString(evidence[key]);
    if (next) return next;
  }
  return null;
}

function readEvidenceRunId(action: IssueRecoveryAction, key: "sourceRunId" | "correctiveRunId" | "latestRunId") {
  const evidence = action.evidence ?? {};
  const next = readEvidenceString(evidence[key]);
  return next;
}

function readWakePolicySummary(action: IssueRecoveryAction, t: TFunction): string | null {
  const policy = action.wakePolicy;
  if (!policy) return null;
  const type = readEvidenceString(policy.type);
  if (!type) return null;
  if (type === "wake_owner") return t("components.issuerecoveryactioncard.corrective_wake_queued.policy_summary", { defaultValue: "Corrective wake queued" });
  if (type === "board_escalation") return t("components.issuerecoveryactioncard.escalated_to_board.policy_summary", { defaultValue: "Escalated to board" });
  if (type === "manual") return t("components.issuerecoveryactioncard.manual.policy_summary", { defaultValue: "Manual" });
  if (type === "manual_repair_required") return t("components.issuerecoveryactioncard.manual_repair_required.policy_summary", { defaultValue: "Manual repair required" });
  if (type === "monitor") {
    const interval = readEvidenceString(policy.intervalLabel);
    return interval
      ? t("components.issuerecoveryactioncard.monitor_scheduled_with_interval.policy_summary", {
        defaultValue: "Monitor scheduled · {{interval}}",
        interval,
      })
      : t("components.issuerecoveryactioncard.monitor_scheduled.policy_summary", { defaultValue: "Monitor scheduled" });
  }
  return type.replaceAll("_", " ");
}

function formatTimeShort(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const now = Date.now();
    const diffMs = date.getTime() - now;
    const absMin = Math.round(Math.abs(diffMs) / 60_000);
    if (absMin < 60) {
      return diffMs >= 0 ? `in ${absMin}m` : `${absMin}m ago`;
    }
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function shortenRunId(runId: string | null | undefined) {
  if (!runId) return null;
  if (runId.length <= 12) return runId;
  return runId.slice(0, 8);
}

function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
const { t } = useTranslation();

  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0 px-3 py-1.5 text-xs sm:px-4">
      <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-foreground/90">{children}</dd>
    </div>
  );
}

function MissingValue() {
const { t } = useTranslation();

  return <span className="text-muted-foreground">—</span>;
}

function AgentLink({
  agentId,
  agentMap,
  fallback,
}: {
  agentId: string | null | undefined;
  agentMap?: ReadonlyMap<string, Agent>;
  fallback?: string | null;
}) {
const { t } = useTranslation();

  if (!agentId) {
    return fallback ? <span>{fallback}</span> : <MissingValue />;
  }
  const agent = agentMap?.get(agentId);
  const label = agent?.name ?? `agent ${agentId.slice(0, 8)}`;
  if (agent) {
    return (
      <Link
        to={agentUrl(agent)}
        className="rounded-sm font-medium underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span className="font-medium">{label}</span>;
}

function RunChip({
  runId,
  agentId,
  status,
}: {
  runId: string | null;
  agentId: string | null | undefined;
  status?: string | null;
}) {
const { t } = useTranslation();

  if (!runId) return <MissingValue />;
  const short = shortenRunId(runId);
  const inner = (
    <>
      <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
        {t("components.issuerecoveryactioncard.run.jsx-text", { defaultValue: "\n        run " })}{short}
      </code>
      {status ? (
        <span className="font-sans text-[11px] text-muted-foreground">{status}</span>
      ) : null}
    </>
  );
  if (agentId) {
    return (
      <Link
        to={`/agents/${agentId}/runs/${runId}`}
        className="inline-flex items-center gap-2 rounded-sm underline-offset-2 hover:underline"
      >
        {inner}
      </Link>
    );
  }
  return <span className="inline-flex items-center gap-2">{inner}</span>;
}

const RESOLVE_OPTIONS: Array<{
  outcome: RecoveryResolveOutcome;
  destructive?: boolean;
  boardOnly?: boolean;
}> = [
  {
    outcome: "todo",
  },
  {
    outcome: "done",
  },
  {
    outcome: "in_review",
  },
  {
    outcome: "false_positive_done",
    destructive: true,
    boardOnly: true,
  },
  {
    outcome: "false_positive_in_review",
    destructive: true,
    boardOnly: true,
  },
];

function resolveOptionLabel(outcome: RecoveryResolveOutcome, t: TFunction): string {
  switch (outcome) {
    case "todo": return t("components.issuerecoveryactioncard.try_again.resolve_label", { defaultValue: "Try again" });
    case "done": return t("components.issuerecoveryactioncard.mark_task_done.resolve_label", { defaultValue: "Mark task done" });
    case "in_review": return t("components.issuerecoveryactioncard.send_for_review.resolve_label", { defaultValue: "Send for review" });
    case "false_positive_done": return t("components.issuerecoveryactioncard.false_positive_done.resolve_label", { defaultValue: "False positive, done" });
    case "false_positive_in_review": return t("components.issuerecoveryactioncard.false_positive_review.resolve_label", { defaultValue: "False positive, review" });
  }
}

function resolveOptionDescription(outcome: RecoveryResolveOutcome, t: TFunction): string {
  switch (outcome) {
    case "todo": return t("components.issuerecoveryactioncard.try_again.resolve_description", { defaultValue: "Dismiss recovery and return the source task to todo." });
    case "done": return t("components.issuerecoveryactioncard.mark_task_done.resolve_description", { defaultValue: "Restore by recording the requested work as complete." });
    case "in_review": return t("components.issuerecoveryactioncard.send_for_review.resolve_description", { defaultValue: "Hand off to a reviewer with a real review path." });
    case "false_positive_done": return t("components.issuerecoveryactioncard.false_positive_done.resolve_description", { defaultValue: "Dismiss recovery and mark the source task complete." });
    case "false_positive_in_review": return t("components.issuerecoveryactioncard.false_positive_review.resolve_description", { defaultValue: "Dismiss recovery and send the source task for review." });
  }
}

export function IssueRecoveryActionCard({
  action,
  agentMap,
  forcedState,
  onResolve,
  canFalsePositive = false,
  className,
}: IssueRecoveryActionCardProps) {
const { t } = useTranslation();

  const cardState: RecoveryCardCardState = forcedState ?? deriveRecoveryCardState(action);
  const tone = STATE_TONE[cardState];
  const ToneIcon = tone.Icon;

  const headline = useMemo(() => {
    if (cardState === "resolved" && action.outcome) {
      return t("components.issuerecoveryactioncard.recovery_resolved_as", {
        outcome: outcomeLabel(action.outcome, t),
        defaultValue: "Recovery resolved as {{outcome}}.",
      });
    }
    return kindHeadline(action.kind, t);
  }, [action.kind, action.outcome, cardState, t]);

  const wakeSummary = readWakePolicySummary(action, t);
  const evidenceSummary = pickEvidenceSummary(action);
  const sourceRunId = readEvidenceRunId(action, "sourceRunId") ?? readEvidenceRunId(action, "latestRunId");
  const correctiveRunId = readEvidenceRunId(action, "correctiveRunId");
  const showAttempt = action.attemptCount > 1 && action.maxAttempts !== null;
  const showTimeoutInline = (() => {
    if (!action.timeoutAt) return false;
    try {
      const date = action.timeoutAt instanceof Date ? action.timeoutAt : new Date(action.timeoutAt);
      const diffMs = date.getTime() - Date.now();
      return diffMs > 0 && diffMs < 60 * 60 * 1000;
    } catch {
      return false;
    }
  })();
  const updatedAtLabel = formatTimeShort(action.updatedAt);

  const ariaState = cardStateAriaLabel(cardState, t);

  const showResolveActions = onResolve !== undefined && cardState !== "resolved";
  const visibleResolveOptions = RESOLVE_OPTIONS.filter((option) => {
    if (option.boardOnly && !canFalsePositive) return false;
    return true;
  });

  return (
    <section
      role="status"
      aria-label={t("components.issuerecoveryactioncard.recovery_action_state.attr_aria-label", {
        defaultValue: "Recovery action: {{state}}",
        state: ariaState,
      })}
      data-recovery-state={cardState}
      data-recovery-kind={action.kind}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border text-sm shadow-[0_1px_0_rgba(15,23,42,0.02)]",
        tone.containerClass,
        className,
      )}
    >
      <header className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tone.iconWrapClass,
          )}
          aria-hidden
        >
          <ToneIcon className={cn("h-4 w-4", tone.iconClass)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <span className={tone.labelClass}>{cardStateLabel(cardState, t)}</span>
            <span className="text-muted-foreground/60" aria-hidden>·</span>
            <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px] tracking-normal text-muted-foreground">
              {kindLabel(action.kind, t)}
            </code>
            {updatedAtLabel ? (
              <>
                <span className="text-muted-foreground/60" aria-hidden>·</span>
                <span className="font-medium normal-case tracking-normal text-muted-foreground">
                  {updatedAtLabel}
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] leading-6">{headline}</p>
        </div>
      </header>
      <dl className={cn("border-t bg-background/40 dark:bg-background/20", tone.divider)}>
        <MetadataRow label={t("components.issuerecoveryactioncard.owner.attr_label", { defaultValue: "Owner" })}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {action.ownerType === "agent" && action.ownerAgentId ? (
              <>
                <span className="text-muted-foreground">{t("components.issuerecoveryactioncard.recovery.jsx-text", { defaultValue: "Recovery:" })}</span>
                <AgentLink agentId={action.ownerAgentId} agentMap={agentMap} />
              </>
            ) : action.ownerType === "board" ? (
              <span className="font-medium">{t("components.issuerecoveryactioncard.board.jsx-text", { defaultValue: "Board" })}</span>
            ) : action.ownerType === "user" && action.ownerUserId ? (
              <span className="font-medium">{t("components.issuerecoveryactioncard.user.jsx-text", { defaultValue: "user " })}{action.ownerUserId.slice(0, 6)}</span>
            ) : action.ownerType === "system" ? (
              <span className="font-medium">{t("components.issuerecoveryactioncard.system.jsx-text", { defaultValue: "System" })}</span>
            ) : (
              <span className="text-muted-foreground">{t("components.issuerecoveryactioncard.unassigned_pick_one_to_wake_them.jsx-text", { defaultValue: "unassigned — pick one to wake them" })}</span>
            )}
            {action.returnOwnerAgentId ? (
              <>
                <span className="text-muted-foreground">{t("components.issuerecoveryactioncard.returns_to.jsx-text", { defaultValue: "→ Returns to:" })}</span>
                <AgentLink agentId={action.returnOwnerAgentId} agentMap={agentMap} />
              </>
            ) : null}
          </span>
        </MetadataRow>
        <MetadataRow label={t("components.issuerecoveryactioncard.source_run.attr_label", { defaultValue: "Source run" })}>
          <RunChip runId={sourceRunId} agentId={action.previousOwnerAgentId} />
        </MetadataRow>
        {correctiveRunId ? (
          <MetadataRow label={t("components.issuerecoveryactioncard.corrective_run.attr_label", { defaultValue: "Corrective run" })}>
            <RunChip runId={correctiveRunId} agentId={action.previousOwnerAgentId} />
          </MetadataRow>
        ) : null}
        <MetadataRow label={t("components.issuerecoveryactioncard.evidence.attr_label", { defaultValue: "Evidence" })}>
          {evidenceSummary ? (
            <span className="break-words font-mono text-[11px] text-foreground/80">{evidenceSummary}</span>
          ) : (
            <MissingValue />
          )}
        </MetadataRow>
        <MetadataRow label={t("components.issuerecoveryactioncard.next_action.attr_label", { defaultValue: "Next action" })}>
          {action.nextAction ? <span>{action.nextAction}</span> : <MissingValue />}
        </MetadataRow>
        <MetadataRow label={t("components.issuerecoveryactioncard.wake.attr_label", { defaultValue: "Wake" })}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {wakeSummary ? <span>{wakeSummary}</span> : <MissingValue />}
            {showAttempt ? (
              <span className="rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("components.issuerecoveryactioncard.attempt.jsx-text", { defaultValue: "\n                attempt " })}{action.attemptCount} {t("components.issuerecoveryactioncard.of.jsx-text", { defaultValue: " of " })}{action.maxAttempts}
              </span>
            ) : null}
            {showTimeoutInline ? (
              <span className="rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("components.issuerecoveryactioncard.times_out.jsx-text", { defaultValue: "\n                Times out " })}{formatTimeShort(action.timeoutAt) ?? "soon"}
              </span>
            ) : null}
          </span>
        </MetadataRow>
        {cardState === "resolved" && action.outcome ? (
          <MetadataRow label={t("components.issuerecoveryactioncard.resolution.attr_label", { defaultValue: "Resolution" })}>
            <span className={cn("font-medium", tone.labelClass)}>
              {t("components.issuerecoveryactioncard.resolved_as.jsx-text", { defaultValue: "\n              Resolved as " })}{outcomeLabel(action.outcome, t)}
              {action.resolvedAt ? ` · ${formatTimeShort(action.resolvedAt) ?? ""}` : ""}
            </span>
          </MetadataRow>
        ) : null}
      </dl>
      {showResolveActions ? (
        <div className={cn("flex flex-wrap items-center gap-2 border-t px-3 py-2.5 sm:px-4", tone.divider)}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="default"
                data-testid="recovery-action-resolve-trigger"
                aria-label={t("components.issuerecoveryactioncard.resolve_recovery.attr_aria-label", { defaultValue: "Resolve recovery" })}
              >
                {t("components.issuerecoveryactioncard.resolve.jsx-text", { defaultValue: "\n                Resolve…\n              " })}</Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-72 p-1.5"
            >
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("components.issuerecoveryactioncard.resolve_recovery.jsx-text", { defaultValue: "\n                Resolve recovery\n              " })}</div>
              <div className="flex flex-col">
                {visibleResolveOptions.map((option) => (
                  <button
                    key={option.outcome}
                    type="button"
                    onClick={() => onResolve?.(option.outcome)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      option.destructive ? "text-destructive" : null,
                    )}
                  >
                    <span className="font-medium leading-5">{resolveOptionLabel(option.outcome, t)}</span>
                    <span className="text-[11px] leading-4 text-muted-foreground">{resolveOptionDescription(option.outcome, t)}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {cardState === "observe_only" ? (
            <span className="text-[11px] text-muted-foreground">
              {t("components.issuerecoveryactioncard.recovery_is_observing_without_in.jsx-text", { defaultValue: "\n              Recovery is observing without interrupting the live run.\n            " })}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {t("components.issuerecoveryactioncard.the_card_stays_open_until_an_exp.jsx-text", { defaultValue: "\n              The card stays open until an explicit decision is recorded.\n            " })}</span>
          )}
        </div>
      ) : null}
    </section>
  );
}

export type { IssueRecoveryActionStatus };

export default IssueRecoveryActionCard;
