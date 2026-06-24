import type {
  WorkspaceCommandDefinition,
  WorkspaceRuntimeControlTarget,
  WorkspaceRuntimeService,
} from "@paperclipai/shared";
import {
  listWorkspaceCommandDefinitions,
  matchWorkspaceRuntimeServiceToCommand,
} from "@paperclipai/shared";
import { Activity, ExternalLink, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";

export type WorkspaceRuntimeAction = "start" | "stop" | "restart" | "run";

export type WorkspaceRuntimeControlRequest = WorkspaceRuntimeControlTarget & {
  action: WorkspaceRuntimeAction;
};

export type WorkspaceRuntimeControlItem = {
  key: string;
  title: string;
  kind: "service" | "job";
  statusLabel: string;
  lifecycle: "shared" | "ephemeral" | null;
  healthStatus: "unknown" | "healthy" | "unhealthy" | null;
  command: string | null;
  cwd: string | null;
  port: number | null;
  url: string | null;
  canStart: boolean;
  canRun: boolean;
  workspaceCommandId?: string | null;
  runtimeServiceId?: string | null;
  serviceIndex?: number | null;
  disabledReason?: string | null;
};

export type WorkspaceRuntimeControlSections = {
  services: WorkspaceRuntimeControlItem[];
  jobs: WorkspaceRuntimeControlItem[];
  otherServices: WorkspaceRuntimeControlItem[];
};

type LegacyWorkspaceRuntimeControlItem = WorkspaceRuntimeControlItem & {
  status?: string | null;
};

type WorkspaceRuntimeControlsProps = {
  sections: WorkspaceRuntimeControlSections;
  items?: never;
  isPending?: boolean;
  pendingRequest?: WorkspaceRuntimeControlRequest | null;
  serviceEmptyMessage?: string;
  jobEmptyMessage?: string;
  emptyMessage?: never;
  disabledHint?: string | null;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  className?: string;
  square?: boolean;
} | {
  sections?: never;
  items: LegacyWorkspaceRuntimeControlItem[];
  isPending?: boolean;
  pendingRequest?: WorkspaceRuntimeControlRequest | null;
  serviceEmptyMessage?: never;
  jobEmptyMessage?: never;
  emptyMessage?: string;
  disabledHint?: string | null;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  className?: string;
  square?: boolean;
};

export function hasRunningRuntimeServices(
  runtimeServices: Array<{ status: string }> | null | undefined,
) {
  return (runtimeServices ?? []).some((service) => service.status === "starting" || service.status === "running");
}

function buildServiceItem(
  command: WorkspaceCommandDefinition,
  runtimeService: WorkspaceRuntimeService | null,
  canStartServices: boolean,
): WorkspaceRuntimeControlItem {
  return {
    key: `command:${command.id}:${runtimeService?.id ?? "idle"}`,
    title: command.name,
    kind: "service",
    statusLabel: runtimeService?.status ?? "stopped",
    lifecycle: runtimeService?.lifecycle ?? command.lifecycle,
    healthStatus: runtimeService?.healthStatus ?? "unknown",
    command: runtimeService?.command ?? command.command,
    cwd: runtimeService?.cwd ?? command.cwd,
    port: runtimeService?.port ?? null,
    url: runtimeService?.url ?? null,
    canStart: canStartServices && !command.disabledReason,
    canRun: false,
    workspaceCommandId: command.id,
    runtimeServiceId: runtimeService?.id ?? null,
    serviceIndex: command.serviceIndex,
    disabledReason: command.disabledReason,
  };
}

function buildJobItem(
  command: WorkspaceCommandDefinition,
  canRunJobs: boolean,
): WorkspaceRuntimeControlItem {
  return {
    key: `command:${command.id}`,
    title: command.name,
    kind: "job",
    statusLabel: "run once",
    lifecycle: null,
    healthStatus: null,
    command: command.command,
    cwd: command.cwd,
    port: null,
    url: null,
    canStart: false,
    canRun: canRunJobs && !command.disabledReason && Boolean(command.command),
    workspaceCommandId: command.id,
    runtimeServiceId: null,
    serviceIndex: null,
    disabledReason: command.disabledReason ?? (!command.command ? "This job is missing a command." : null),
  };
}

export function buildWorkspaceRuntimeControlSections(input: {
  runtimeConfig: Record<string, unknown> | null | undefined;
  runtimeServices: WorkspaceRuntimeService[] | null | undefined;
  canStartServices: boolean;
  canRunJobs?: boolean;
}): WorkspaceRuntimeControlSections {
  const commands = listWorkspaceCommandDefinitions(input.runtimeConfig);
  const runtimeServices = [...(input.runtimeServices ?? [])];
  const matchedRuntimeServiceIds = new Set<string>();
  const services: WorkspaceRuntimeControlItem[] = [];
  const jobs: WorkspaceRuntimeControlItem[] = [];

  for (const command of commands) {
    if (command.kind === "job") {
      jobs.push(buildJobItem(command, input.canRunJobs ?? input.canStartServices));
      continue;
    }

    const runtimeService = matchWorkspaceRuntimeServiceToCommand(command, runtimeServices);
    if (runtimeService) matchedRuntimeServiceIds.add(runtimeService.id);
    services.push(buildServiceItem(command, runtimeService, input.canStartServices));
  }

  const otherServices = runtimeServices
    .filter((runtimeService) =>
      !matchedRuntimeServiceIds.has(runtimeService.id)
      && (runtimeService.status === "starting" || runtimeService.status === "running"))
    .map((runtimeService) => ({
      key: `runtime:${runtimeService.id}`,
      title: runtimeService.serviceName,
      kind: "service" as const,
      statusLabel: runtimeService.status,
      lifecycle: runtimeService.lifecycle,
      healthStatus: runtimeService.healthStatus,
      command: runtimeService.command ?? null,
      cwd: runtimeService.cwd ?? null,
      port: runtimeService.port ?? null,
      url: runtimeService.url ?? null,
      canStart: false,
      canRun: false,
      workspaceCommandId: null,
      runtimeServiceId: runtimeService.id,
      serviceIndex: runtimeService.configIndex ?? null,
      disabledReason: "This runtime service no longer matches a configured workspace command.",
    }));

  return {
    services,
    jobs,
    otherServices,
  };
}

export function buildWorkspaceRuntimeControlItems(input: {
  runtimeConfig: Record<string, unknown> | null | undefined;
  runtimeServices: WorkspaceRuntimeService[] | null | undefined;
  canStartServices: boolean;
  canRunJobs?: boolean;
}): LegacyWorkspaceRuntimeControlItem[] {
  return buildWorkspaceRuntimeControlSections(input).services.map((item) => ({
    ...item,
    status: item.statusLabel,
  }));
}

export function getRunningRuntimeServiceUrl(
  sections: WorkspaceRuntimeControlSections,
) {
  const runningService = [...sections.services, ...sections.otherServices].find(
    (item) => (item.statusLabel === "running" || item.statusLabel === "starting") && item.url,
  );
  return runningService?.url ?? null;
}

function requestMatchesPending(
  pendingRequest: WorkspaceRuntimeControlRequest | null | undefined,
  nextRequest: WorkspaceRuntimeControlRequest,
) {
  return pendingRequest?.action === nextRequest.action
    && (pendingRequest?.workspaceCommandId ?? null) === (nextRequest.workspaceCommandId ?? null)
    && (pendingRequest?.runtimeServiceId ?? null) === (nextRequest.runtimeServiceId ?? null)
    && (pendingRequest?.serviceIndex ?? null) === (nextRequest.serviceIndex ?? null);
}

function buildRequest(item: WorkspaceRuntimeControlItem, action: WorkspaceRuntimeAction): WorkspaceRuntimeControlRequest {
  return {
    action,
    workspaceCommandId: item.workspaceCommandId ?? null,
    runtimeServiceId: item.runtimeServiceId ?? null,
    serviceIndex: item.serviceIndex ?? null,
  };
}

function actionLabel(action: WorkspaceRuntimeAction, t: TFunction): string {
  if (action === "run") return t("components.workspaceruntimecontrols.run.jsx-text", { defaultValue: "Run" });
  if (action === "start") return t("components.workspaceruntimecontrols.start.jsx-text", { defaultValue: "Start" });
  if (action === "stop") return t("components.workspaceruntimecontrols.stop.jsx-text", { defaultValue: "Stop" });
  return t("components.workspaceruntimecontrols.restart.jsx-text", { defaultValue: "Restart" });
}

function localizedKind(kind: WorkspaceRuntimeControlItem["kind"], t: TFunction): string {
  return kind === "job"
    ? t("components.workspaceruntimecontrols.job.jsx-text", { defaultValue: "job" })
    : t("components.workspaceruntimecontrols.service.jsx-text", { defaultValue: "service" });
}

function localizedStatus(status: string, t: TFunction): string {
  const labels: Record<string, string> = {
    starting: t("components.workspaceruntimecontrols.status.starting", { defaultValue: "starting" }),
    running: t("components.workspaceruntimecontrols.status.running", { defaultValue: "running" }),
    stopped: t("components.workspaceruntimecontrols.status.stopped", { defaultValue: "stopped" }),
    failed: t("components.workspaceruntimecontrols.status.failed", { defaultValue: "failed" }),
    "run once": t("components.workspaceruntimecontrols.status.run_once", { defaultValue: "run once" }),
  };
  return labels[status] ?? status;
}

function localizedLifecycle(lifecycle: WorkspaceRuntimeControlItem["lifecycle"], t: TFunction): string | null {
  if (lifecycle === "shared") return t("components.workspaceruntimecontrols.lifecycle.shared", { defaultValue: "shared" });
  if (lifecycle === "ephemeral") return t("components.workspaceruntimecontrols.lifecycle.ephemeral", { defaultValue: "ephemeral" });
  return null;
}

function localizedHealthStatus(status: WorkspaceRuntimeControlItem["healthStatus"], t: TFunction): string | null {
  if (status === "healthy") return t("components.workspaceruntimecontrols.health.healthy", { defaultValue: "healthy" });
  if (status === "unhealthy") return t("components.workspaceruntimecontrols.health.unhealthy", { defaultValue: "unhealthy" });
  if (status === "unknown") return t("components.workspaceruntimecontrols.health.unknown", { defaultValue: "unknown" });
  return null;
}

function localizedDisabledReason(reason: string, t: TFunction): string {
  if (reason === "This job is missing a command.") {
    return t("components.workspaceruntimecontrols.this_job_is_missing_a_command.jsx-text", { defaultValue: "This job is missing a command." });
  }
  if (reason === "This runtime service no longer matches a configured workspace command.") {
    return t("components.workspaceruntimecontrols.this_runtime_service_no_longer.jsx-text", { defaultValue: "This runtime service no longer matches a configured workspace command." });
  }
  return reason;
}

function CommandActionButtons({
  item,
  isPending,
  pendingRequest,
  onAction,
  square,
}: {
  item: WorkspaceRuntimeControlItem;
  isPending: boolean;
  pendingRequest: WorkspaceRuntimeControlRequest | null | undefined;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  square?: boolean;
}) {
const { t } = useTranslation();

  const actions: WorkspaceRuntimeAction[] =
    item.kind === "job"
      ? ["run"]
      : item.statusLabel === "running" || item.statusLabel === "starting"
        ? ["stop", ...(item.canStart ? ["restart" as const] : [])]
        : ["start"];

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
      {actions.map((action) => {
        const request = buildRequest(item, action);
        const Icon = action === "stop" ? Square : action === "restart" ? RotateCcw : Play;
        const label = actionLabel(action, t);
        const showSpinner = isPending && requestMatchesPending(pendingRequest, request);
        const disabled =
          isPending
          || (action === "run" && !item.canRun)
          || ((action === "start" || action === "restart") && !item.canStart);

        return (
          <Button
            key={`${item.key}:${action}`}
            variant={action === "stop" ? "destructive" : action === "restart" ? "outline" : "default"}
            size="sm"
            className={cn(
              "w-full justify-start sm:w-auto",
              square ? "rounded-none" : null,
            )}
            disabled={disabled}
            onClick={() => onAction(request)}
          >
            {showSpinner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function CommandSection({
  title,
  description,
  items,
  emptyMessage,
  disabledHint,
  isPending,
  pendingRequest,
  onAction,
  square,
}: {
  title: string;
  description: string;
  items: WorkspaceRuntimeControlItem[];
  emptyMessage: string;
  disabledHint?: string | null;
  isPending: boolean;
  pendingRequest: WorkspaceRuntimeControlRequest | null | undefined;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  square?: boolean;
}) {
const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {items.length === 0 ? (
        <div className={cn("border border-dashed border-border/80 bg-background px-3 py-4 text-sm text-muted-foreground", square ? "rounded-none" : "rounded-xl")}>
          {emptyMessage}
          {disabledHint ? <p className="mt-2 text-xs">{disabledHint}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.key} className={cn("border border-border/80 bg-background px-3 py-3", square ? "rounded-none" : "rounded-xl")}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {localizedKind(item.kind, t)} · {localizedStatus(item.statusLabel, t)}
                      {item.lifecycle ? ` · ${localizedLifecycle(item.lifecycle, t)}` : ""}
                    </div>
                  </div>
                  <CommandActionButtons
                    item={item}
                    isPending={isPending}
                    pendingRequest={pendingRequest}
                    onAction={onAction}
                    square={square}
                  />
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      {item.url}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {item.port ? <div>{t("components.workspaceruntimecontrols.port.jsx-text", { defaultValue: "Port " })}{item.port}</div> : null}
                  {item.command ? <div className="break-all font-mono">{item.command}</div> : null}
                  {item.cwd ? <div className="break-all font-mono">{item.cwd}</div> : null}
                  {item.disabledReason ? <div>{localizedDisabledReason(item.disabledReason, t)}</div> : null}
                </div>
                {item.healthStatus && item.statusLabel !== "stopped" ? (
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px]",
                      item.healthStatus === "healthy"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : item.healthStatus === "unhealthy"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground",
                    )}>
                      {localizedHealthStatus(item.healthStatus, t)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceRuntimeControls({
  sections,
  items,
  isPending = false,
  pendingRequest = null,
  serviceEmptyMessage,
  jobEmptyMessage,
  emptyMessage,
  disabledHint = null,
  onAction,
  className,
  square,
}: WorkspaceRuntimeControlsProps) {
const { t } = useTranslation();

  const resolvedSections = sections ?? {
    services: (items ?? []).map((item) => ({
      ...item,
      statusLabel: item.statusLabel ?? item.status ?? "stopped",
    })),
    jobs: [],
    otherServices: [],
  };
  const resolvedServiceEmptyMessage = emptyMessage ?? serviceEmptyMessage ?? t("components.workspaceruntimecontrols.no_services_are_configured_for_t.jsx-text", { defaultValue: "No services are configured for this workspace." });
  const resolvedJobEmptyMessage = jobEmptyMessage ?? t("components.workspaceruntimecontrols.no_one_shot_jobs_are_configured.jsx-text", { defaultValue: "No one-shot jobs are configured for this workspace." });
  const runningCount = [...resolvedSections.services, ...resolvedSections.otherServices].filter(
    (item) => item.statusLabel === "running" || item.statusLabel === "starting",
  ).length;
  const visibleDisabledHint = runningCount > 0 || disabledHint === null ? null : disabledHint;

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn("border border-border/70 bg-background p-3", square ? "rounded-none" : "rounded-xl")}>
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("components.workspaceruntimecontrols.workspace_commands.jsx-text", { defaultValue: "Workspace commands" })}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                runningCount > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              {runningCount > 0
                ? t("components.workspaceruntimecontrols.services_running.jsx-text", { count: runningCount, defaultValue: "{{count}} services running" })
                : t("components.workspaceruntimecontrols.no_services_running.jsx-text", { defaultValue: "No services running" })}
            </span>
            <span className="text-xs text-muted-foreground">
              {resolvedSections.jobs.length > 0
                ? t("components.workspaceruntimecontrols.jobs_available_to_run_on_demand.jsx-text", { count: resolvedSections.jobs.length, defaultValue: "{{count}} job available to run on demand." })
                : t("components.workspaceruntimecontrols.each_command_can_be_controlled.jsx-text", { defaultValue: "Each command can be controlled independently." })}
            </span>
          </div>
          {visibleDisabledHint ? <p className="text-xs text-muted-foreground">{visibleDisabledHint}</p> : null}
        </div>
      </div>

      <CommandSection
        title={t("components.workspaceruntimecontrols.services.attr_title", { defaultValue: "Services" })}
        description={t("components.workspaceruntimecontrols.long_running_commands_that_pap.attr_description", { defaultValue: "Long-running commands that Paperclip can supervise for this workspace." })}
        items={resolvedSections.services}
        emptyMessage={resolvedServiceEmptyMessage}
        disabledHint={visibleDisabledHint}
        isPending={isPending}
        pendingRequest={pendingRequest}
        onAction={onAction}
        square={square}
      />

      <CommandSection
        title={t("components.workspaceruntimecontrols.jobs.attr_title", { defaultValue: "Jobs" })}
        description={t("components.workspaceruntimecontrols.one_shot_commands_that_run_now.attr_description", { defaultValue: "One-shot commands that run now and exit when they finish." })}
        items={resolvedSections.jobs}
        emptyMessage={resolvedJobEmptyMessage}
        isPending={isPending}
        pendingRequest={pendingRequest}
        onAction={onAction}
        square={square}
      />

      {resolvedSections.otherServices.length > 0 ? (
        <CommandSection
          title={t("components.workspaceruntimecontrols.untracked_services.attr_title", { defaultValue: "Untracked services" })}
          description={t("components.workspaceruntimecontrols.running_services_that_no_longe.attr_description", { defaultValue: "Running services that no longer match the current workspace command config." })}
          items={resolvedSections.otherServices}
          emptyMessage=""
          isPending={isPending}
          pendingRequest={pendingRequest}
          onAction={onAction}
          square={square}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceRuntimeQuickControls({
  sections,
  isPending = false,
  pendingRequest = null,
  onAction,
  square,
}: {
  sections: WorkspaceRuntimeControlSections;
  isPending?: boolean;
  pendingRequest?: WorkspaceRuntimeControlRequest | null;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  square?: boolean;
}) {
const { t } = useTranslation();

  const controlItems = sections.services.length > 0 ? sections.services : sections.otherServices;
  const serviceUrl = getRunningRuntimeServiceUrl(sections);

  if (controlItems.length === 0 && !serviceUrl) return null;

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
      {controlItems.length > 0 ? (
        <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {controlItems.map((item) => (
            <div key={item.key} className="flex min-w-0 flex-col gap-1 sm:items-end">
              {controlItems.length > 1 ? (
                <span className="truncate text-xs text-muted-foreground">{item.title}</span>
              ) : null}
              <CommandActionButtons
                item={item}
                isPending={isPending}
                pendingRequest={pendingRequest}
                onAction={onAction}
                square={square}
              />
            </div>
          ))}
        </div>
      ) : null}
      {serviceUrl ? (
        <a
          href={serviceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 self-start break-all text-xs text-muted-foreground hover:text-foreground hover:underline sm:self-end"
        >
          {serviceUrl}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : null}
    </div>
  );
}
