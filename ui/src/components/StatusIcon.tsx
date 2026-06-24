import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { TFunction } from "i18next";
import type { IssueBlockerAttention } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { issueStatusIcon, issueStatusIconDefault } from "../lib/status-colors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

function statusLabel(status: string, t: TFunction): string {
  switch (status) {
    case "backlog": return t("components.statusicon.backlog.status_label", { defaultValue: "Backlog" });
    case "todo": return t("components.statusicon.todo.status_label", { defaultValue: "Todo" });
    case "in_progress": return t("components.statusicon.in_progress.status_label", { defaultValue: "In progress" });
    case "in_review": return t("components.statusicon.in_review.status_label", { defaultValue: "In review" });
    case "done": return t("components.statusicon.done.status_label", { defaultValue: "Done" });
    case "cancelled": return t("components.statusicon.cancelled.status_label", { defaultValue: "Cancelled" });
    case "blocked": return t("components.statusicon.blocked.status_label", { defaultValue: "Blocked" });
    default: return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

interface StatusIconProps {
  status: string;
  blockerAttention?: IssueBlockerAttention | null;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
}

function blockedAttentionLabel(blockerAttention: IssueBlockerAttention | null | undefined, t: TFunction) {
  if (!blockerAttention || blockerAttention.state === "none") return t("components.statusicon.blocked.status_label", { defaultValue: "Blocked" });

  if (blockerAttention.reason === "active_child") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("components.statusicon.blocked_waiting_on_subtask_id.label", {
        defaultValue: "Blocked · waiting on active sub-task {{identifier}}",
        identifier: blockerAttention.sampleBlockerIdentifier,
      });
    }
    if (count === 1) return t("components.statusicon.blocked_waiting_on_one_subtask.label", { defaultValue: "Blocked · waiting on 1 active sub-task" });
    return t("components.statusicon.blocked_waiting_on_subtasks.label", {
      defaultValue: "Blocked · waiting on {{count}} active sub-tasks",
      count,
    });
  }

  if (blockerAttention.reason === "active_dependency") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("components.statusicon.blocked_covered_by_dependency_id.label", {
        defaultValue: "Blocked · covered by active dependency {{identifier}}",
        identifier: blockerAttention.sampleBlockerIdentifier,
      });
    }
    if (count === 1) return t("components.statusicon.blocked_covered_by_one_dependency.label", { defaultValue: "Blocked · covered by 1 active dependency" });
    return t("components.statusicon.blocked_covered_by_dependencies.label", {
      defaultValue: "Blocked · covered by {{count}} active dependencies",
      count,
    });
  }

  if (blockerAttention.reason === "stalled_review") {
    const count = blockerAttention.stalledBlockerCount;
    const leaf = blockerAttention.sampleStalledBlockerIdentifier ?? blockerAttention.sampleBlockerIdentifier;
    if (count === 1 && leaf) return t("components.statusicon.blocked_review_stalled_on.label", {
      defaultValue: "Blocked · review stalled on {{identifier}}",
      identifier: leaf,
    });
    if (count === 1) return t("components.statusicon.blocked_review_stalled_one.label", { defaultValue: "Blocked · review stalled with no clear next step" });
    return t("components.statusicon.blocked_reviews_stalled.label", {
      defaultValue: "Blocked · {{count}} reviews stalled with no clear next step",
      count,
    });
  }

  if (blockerAttention.reason === "attention_required") {
    const count = blockerAttention.attentionBlockerCount || blockerAttention.unresolvedBlockerCount;
    const attentionCopy = count === 1
      ? t("components.statusicon.one_blocker_needs_attention.label", { defaultValue: "1 blocker needs attention" })
      : t("components.statusicon.blockers_need_attention.label", {
        defaultValue: "{{count}} blockers need attention",
        count,
      });
    const coveredCount = blockerAttention.coveredBlockerCount;
    if (coveredCount > 0) {
      return t("components.statusicon.blocked_attention_with_covered.label", {
        defaultValue: "Blocked · {{attention}}; {{count}} covered by active work",
        attention: attentionCopy,
        count: coveredCount,
      });
    }
    return t("components.statusicon.blocked_attention.label", {
      defaultValue: "Blocked · {{attention}}",
      attention: attentionCopy,
    });
  }

  return t("components.statusicon.blocked.status_label", { defaultValue: "Blocked" });
}

export function StatusIcon({ status, blockerAttention, onChange, className, showLabel }: StatusIconProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isCoveredBlocked = status === "blocked" && blockerAttention?.state === "covered";
  const isStalledBlocked = status === "blocked" && blockerAttention?.state === "stalled";
  const isAttentionBlocked = status === "blocked" && blockerAttention?.state === "needs_attention";
  const hasCoveredBlockedWork = isAttentionBlocked && (blockerAttention?.coveredBlockerCount ?? 0) > 0;
  const colorClass = isCoveredBlocked
    ? "text-cyan-600 border-cyan-600 dark:text-cyan-400 dark:border-cyan-400"
    : isStalledBlocked
      ? "text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400"
      : issueStatusIcon[status] ?? issueStatusIconDefault;
  const isDone = status === "done";
  const ariaLabel = status === "blocked" ? blockedAttentionLabel(blockerAttention, t) : statusLabel(status, t);
  const blockerAttentionState = isCoveredBlocked
    ? "covered"
    : isStalledBlocked
      ? "stalled"
      : isAttentionBlocked
        ? "needs_attention"
        : undefined;

  const circle = (
    <span
      className={cn(
        "relative inline-flex h-4 w-4 rounded-full border-2 shrink-0",
        colorClass,
        onChange && !showLabel && "cursor-pointer",
        className
      )}
      data-blocker-attention-state={blockerAttentionState}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {isDone && (
        <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-current" />
      )}
      {isCoveredBlocked && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-current" />
      )}
      {hasCoveredBlockedWork && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-cyan-600 dark:bg-cyan-400" />
      )}
      {isStalledBlocked && (
        <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-current" />
      )}
    </span>
  );

  if (!onChange) return showLabel ? <span className="inline-flex items-center gap-1.5">{circle}<span className="text-sm">{statusLabel(status, t)}</span></span> : circle;

  const trigger = showLabel ? (
    <button className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {circle}
      <span className="text-sm">{statusLabel(status, t)}</span>
    </button>
  ) : circle;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} />
            {statusLabel(s, t)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
