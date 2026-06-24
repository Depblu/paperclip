import type { ReactNode } from "react";
import { MoreHorizontal, Play } from "lucide-react";
import { t as translate, useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { AgentIcon } from "@/components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

export type RoutineListProjectSummary = {
  name: string;
  color?: string | null;
};

export type RoutineListAgentSummary = {
  name: string;
  icon?: string | null;
};

export type RoutineListRowItem = {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  assigneeAgentId: string | null;
  lastRun?: {
    triggeredAt?: Date | string | null;
    status?: string | null;
  } | null;
};

type TranslateFn = typeof translate;

export function formatLastRunTimestamp(value: Date | string | null | undefined, t: TranslateFn = translate) {
  if (!value) return t("components.routinelist.never", { defaultValue: "Never" });
  return new Date(value).toLocaleString();
}

export function formatRoutineRunStatus(value: string | null | undefined, t: TranslateFn = translate) {
  if (!value) return null;
  switch (value) {
    case "queued":
      return t("components.routinelist.run_status_queued", { defaultValue: "queued" });
    case "running":
      return t("components.routinelist.run_status_running", { defaultValue: "running" });
    case "completed":
      return t("components.routinelist.run_status_completed", { defaultValue: "completed" });
    case "failed":
      return t("components.routinelist.run_status_failed", { defaultValue: "failed" });
    case "cancelled":
      return t("components.routinelist.run_status_cancelled", { defaultValue: "cancelled" });
    case "scheduled_retry":
      return t("components.routinelist.run_status_scheduled_retry", { defaultValue: "scheduled retry" });
    default:
      return value.replaceAll("_", " ");
  }
}

export function nextRoutineStatus(currentStatus: string, enabled: boolean) {
  if (currentStatus === "archived" && enabled) return "active";
  return enabled ? "active" : "paused";
}

export function RoutineListRow<TRoutine extends RoutineListRowItem>({
  routine,
  projectById,
  agentById,
  runningRoutineId,
  statusMutationRoutineId,
  href,
  configureLabel = "Edit",
  managedByLabel,
  secondaryDetails,
  runNowButton = false,
  disableRunNow = false,
  disableToggle = false,
  hideArchiveAction = false,
  onRunNow,
  onToggleEnabled,
  onToggleArchived,
}: {
  routine: TRoutine;
  projectById: Map<string, RoutineListProjectSummary>;
  agentById: Map<string, RoutineListAgentSummary>;
  runningRoutineId: string | null;
  statusMutationRoutineId: string | null;
  href: string;
  configureLabel?: string;
  managedByLabel?: string | null;
  secondaryDetails?: ReactNode;
  runNowButton?: boolean;
  disableRunNow?: boolean;
  disableToggle?: boolean;
  hideArchiveAction?: boolean;
  onRunNow: (routine: TRoutine) => void;
  onToggleEnabled: (routine: TRoutine, enabled: boolean) => void;
  onToggleArchived?: (routine: TRoutine) => void;
}) {
  const { t } = useTranslation();
  const enabled = routine.status === "active";
  const isArchived = routine.status === "archived";
  const isStatusPending = statusMutationRoutineId === routine.id;
  const project = routine.projectId ? projectById.get(routine.projectId) ?? null : null;
  const agent = routine.assigneeAgentId ? agentById.get(routine.assigneeAgentId) ?? null : null;
  const isDraft = !isArchived && !routine.assigneeAgentId;
  const runDisabled = runningRoutineId === routine.id || isArchived || disableRunNow;
  const editLabel = configureLabel ?? t("components.routinelist.edit.action", { defaultValue: "Edit" });
  const runLabel = runningRoutineId === routine.id
    ? t("components.routinelist.running.action", { defaultValue: "Running..." })
    : t("components.routinelist.run_now.action", { defaultValue: "Run now" });

  return (
    <Link
      to={href}
      className="group flex flex-col gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-accent/50 last:border-b-0 sm:flex-row sm:items-center no-underline text-inherit"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{routine.title}</span>
          {(isArchived || routine.status === "paused" || isDraft) ? (
            <span className="text-xs text-muted-foreground">
              {isArchived
                ? t("components.routinelist.archived.status", { defaultValue: "archived" })
                : isDraft
                ? t("components.routinelist.draft.status", { defaultValue: "draft" })
                : t("components.routinelist.paused.status", { defaultValue: "paused" })}
            </span>
          ) : null}
          {managedByLabel ? (
            <span className="text-xs text-muted-foreground">{managedByLabel}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: project?.color ?? "#64748b" }}
            />
            <span>
              {routine.projectId
                ? (project?.name ?? t("components.routinelist.unknown_project", { defaultValue: "Unknown project" }))
                : t("components.routinelist.no_project", { defaultValue: "No project" })}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {agent?.icon ? <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>
              {routine.assigneeAgentId
                ? (agent?.name ?? t("components.routinelist.unknown_agent", { defaultValue: "Unknown agent" }))
                : t("components.routinelist.no_default_agent", { defaultValue: "No default agent" })}
            </span>
          </span>
          <span>
            {formatLastRunTimestamp(routine.lastRun?.triggeredAt, t)}
            {routine.lastRun ? ` · ${formatRoutineRunStatus(routine.lastRun.status, t)}` : ""}
          </span>
        </div>
        {secondaryDetails ? (
          <div className="text-xs text-muted-foreground">{secondaryDetails}</div>
        ) : null}
      </div>

      <div className="flex items-center gap-3" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        {runNowButton ? (
          <Button
            variant="outline"
            size="sm"
            disabled={runDisabled}
            onClick={() => onRunNow(routine)}
          >
            <Play className="h-3.5 w-3.5" />
            {runLabel}
          </Button>
        ) : null}

        <div className="flex items-center gap-3">
          <ToggleSwitch
            size="lg"
            checked={enabled}
            onCheckedChange={() => onToggleEnabled(routine, enabled)}
            disabled={isStatusPending || isArchived || disableToggle}
            aria-label={enabled
              ? t("components.routinelist.disable_routine.attr_aria-label", { title: routine.title, defaultValue: "Disable {{title}}" })
              : t("components.routinelist.enable_routine.attr_aria-label", { title: routine.title, defaultValue: "Enable {{title}}" })}
          />
          <span className="w-12 text-xs text-muted-foreground">
            {isArchived
              ? t("components.routinelist.archived.label", { defaultValue: "Archived" })
              : isDraft
              ? t("components.routinelist.draft.label", { defaultValue: "Draft" })
              : enabled
              ? t("components.routinelist.on.label", { defaultValue: "On" })
              : t("components.routinelist.off.label", { defaultValue: "Off" })}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("components.routinelist.more_actions_for.attr_aria-label", {
                title: routine.title,
                defaultValue: "More actions for {{title}}",
              })}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={href}>{editLabel}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={runDisabled}
              onClick={() => onRunNow(routine)}
            >
              {runLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggleEnabled(routine, enabled)}
              disabled={isStatusPending || isArchived || disableToggle}
            >
              {enabled
                ? t("components.routinelist.pause.action", { defaultValue: "Pause" })
                : t("components.routinelist.enable.action", { defaultValue: "Enable" })}
            </DropdownMenuItem>
            {!hideArchiveAction && onToggleArchived ? (
              <DropdownMenuItem
                onClick={() => onToggleArchived(routine)}
                disabled={isStatusPending}
              >
                {routine.status === "archived"
                  ? t("components.routinelist.restore.action", { defaultValue: "Restore" })
                  : t("components.routinelist.archive.action", { defaultValue: "Archive" })}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  );
}
