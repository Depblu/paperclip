import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, FlaskConical, Play, Search } from "lucide-react";
import type {
  IssueGraphLivenessAutoRecoveryPreview,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function issueHref(identifier: string | null, issueId: string) {
  if (!identifier) return `/issues/${issueId}`;
  const prefix = identifier.split("-")[0] || "PAP";
  return `/${prefix}/issues/${identifier}`;
}

function formatRecoveryState(state: string) {
  return state.replace(/_/g, " ");
}

function RecoveryPreviewDialog({
  preview,
  open,
  onOpenChange,
  onEnableOnly,
  onEnableAndRun,
  isPending,
}: {
  preview: IssueGraphLivenessAutoRecoveryPreview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnableOnly: () => void;
  onEnableAndRun: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();

  const count = preview?.recoverableFindings ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("pages.instanceexperimentalsettings.confirm_auto_recovery.jsx-text", { defaultValue: "Confirm auto-recovery" })}</DialogTitle>
          <DialogDescription>
            {preview
              ? t("pages.instanceexperimentalsettings.recovery_preview_summary.text", {
                count,
                hours: preview.lookbackHours,
                defaultValue: "{{count}} recovery tasks match the last {{hours}} hours.",
              })
              : t("pages.instanceexperimentalsettings.checking_recovery_candidates.text", { defaultValue: "Checking recovery candidates before enabling." })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(28rem,65vh)] space-y-3 overflow-y-auto pr-1">
          {preview && preview.items.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.no_recovery_tasks_would_be_creat.jsx-text", { defaultValue: "\n              No recovery tasks would be created right now. Auto-recovery can still run for future liveness incidents in this window.\n            " })}</div>
          ) : null}

          {preview?.items.map((item) => (
            <div key={item.incidentKey} className="rounded-md border border-border bg-card px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={issueHref(item.identifier, item.issueId)}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {item.identifier ?? item.issueId}
                </a>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {formatRecoveryState(item.state)}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                {t("pages.instanceexperimentalsettings.recovery_target.jsx-text", { defaultValue: "\n                Recovery target:" })}{" "}
                <a
                  href={issueHref(item.recoveryIdentifier, item.recoveryIssueId)}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {item.recoveryIdentifier ?? item.recoveryIssueId}
                </a>
              </div>
            </div>
          ))}
        </div>

        {preview && preview.skippedOutsideLookback > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("pages.instanceexperimentalsettings.skipped_outside_lookback.text", {
              count: preview.skippedOutsideLookback,
              defaultValue: "{{count}} current findings are outside the configured lookback and will not be touched.",
            })}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("pages.instanceexperimentalsettings.cancel.jsx-text", { defaultValue: "\n            Cancel\n          " })}</Button>
          <Button variant="outline" onClick={onEnableOnly} disabled={isPending || !preview}>
            {t("pages.instanceexperimentalsettings.enable_only.jsx-text", { defaultValue: "\n            Enable only\n          " })}</Button>
          <Button onClick={onEnableAndRun} disabled={isPending || !preview}>
            {count > 0
              ? t("pages.instanceexperimentalsettings.enable_and_create.jsx-text", { count, defaultValue: "Enable and create {{count}}" })
              : t("pages.instanceexperimentalsettings.enable.jsx-text", { defaultValue: "Enable" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InstanceExperimentalSettings() {
  const { t } = useTranslation();

  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [lookbackHoursDraft, setLookbackHoursDraft] = useState("24");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<IssueGraphLivenessAutoRecoveryPreview | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("pages.instanceexperimentalsettings.instance_settings.breadcrumb", { defaultValue: "Instance Settings" }) },
      { label: t("pages.instanceexperimentalsettings.experimental.breadcrumb", { defaultValue: "Experimental" }) },
    ]);
  }, [setBreadcrumbs, t]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onSuccess: async () => {
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update experimental settings.");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (lookbackHours: number) =>
      instanceSettingsApi.previewIssueGraphLivenessAutoRecovery({ lookbackHours }),
    onSuccess: (preview) => {
      setActionError(null);
      setPendingPreview(preview);
      setPreviewDialogOpen(true);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to preview recovery tasks.");
    },
  });

  const runRecoveryMutation = useMutation({
    mutationFn: async (lookbackHours: number) =>
      instanceSettingsApi.runIssueGraphLivenessAutoRecovery({ lookbackHours }),
    onSuccess: async () => {
      setActionError(null);
      setPreviewDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to create recovery tasks.");
    },
  });

  useEffect(() => {
    const next = experimentalQuery.data?.issueGraphLivenessAutoRecoveryLookbackHours;
    if (typeof next === "number") {
      setLookbackHoursDraft(String(next));
    }
  }, [experimentalQuery.data?.issueGraphLivenessAutoRecoveryLookbackHours]);

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("pages.instanceexperimentalsettings.loading_experimental_settings.jsx-text", { defaultValue: "Loading experimental settings..." })}</div>;
  }

  if (experimentalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {experimentalQuery.error instanceof Error
          ? experimentalQuery.error.message
          : "Failed to load experimental settings."}
      </div>
    );
  }

  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  const enableStreamlinedLeftNavigation =
    experimentalQuery.data?.enableStreamlinedLeftNavigation === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableCloudSync = experimentalQuery.data?.enableCloudSync === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  const enableIssueGraphLivenessAutoRecovery =
    experimentalQuery.data?.enableIssueGraphLivenessAutoRecovery === true;
  const lookbackHours =
    experimentalQuery.data?.issueGraphLivenessAutoRecoveryLookbackHours ?? 24;
  const parsedLookbackHours = Number.parseInt(lookbackHoursDraft, 10);
  const lookbackHoursIsValid =
    Number.isInteger(parsedLookbackHours) && parsedLookbackHours >= 1 && parsedLookbackHours <= 720;
  const recoveryActionPending =
    toggleMutation.isPending || previewMutation.isPending || runRecoveryMutation.isPending;

  function previewForEnable() {
    if (!lookbackHoursIsValid) {
      setActionError(t("pages.instanceexperimentalsettings.lookback_hours_invalid.error", { defaultValue: "Lookback hours must be a whole number from 1 to 720." }));
      return;
    }
    previewMutation.mutate(parsedLookbackHours);
  }

  function enableOnly() {
    if (!lookbackHoursIsValid) return;
    toggleMutation.mutate({
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
    }, {
      onSuccess: () => setPreviewDialogOpen(false),
    });
  }

  function enableAndRun() {
    if (!lookbackHoursIsValid) return;
    toggleMutation.mutate({
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
    }, {
      onSuccess: () => runRecoveryMutation.mutate(parsedLookbackHours),
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("pages.instanceexperimentalsettings.experimental.jsx-text", { defaultValue: "Experimental" })}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("pages.instanceexperimentalsettings.opt_into_features_that_are_still.jsx-text", { defaultValue: "\n          Opt into features that are still being evaluated before they become default behavior.\n        " })}</p>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.enable_environments.jsx-text", { defaultValue: "Enable Environments" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.show_environment_management_in_c.jsx-text", { defaultValue: "\n              Show environment management in company settings and allow project and agent environment assignment controls.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={enableEnvironments}
            onCheckedChange={() => toggleMutation.mutate({ enableEnvironments: !enableEnvironments })}
            disabled={toggleMutation.isPending}
            aria-label={t("pages.instanceexperimentalsettings.toggle_environments_experimental.attr_aria-label", { defaultValue: "Toggle environments experimental setting" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.enable_isolated_workspaces.jsx-text", { defaultValue: "Enable Isolated Workspaces" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.show_execution_workspace_control.jsx-text", { defaultValue: "\n              Show execution workspace controls in project configuration and allow isolated workspace behavior for new and existing task runs.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={enableIsolatedWorkspaces}
            onCheckedChange={() => toggleMutation.mutate({ enableIsolatedWorkspaces: !enableIsolatedWorkspaces })}
            disabled={toggleMutation.isPending}
            aria-label={t("pages.instanceexperimentalsettings.toggle_isolated_workspaces_exper.attr_aria-label", { defaultValue: "Toggle isolated workspaces experimental setting" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.streamlined_left_navigation_bar.jsx-text", { defaultValue: "Streamlined Left Navigation Bar" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.reduces_the_maximum_number_of_it.jsx-text", { defaultValue: "\n              Reduces the maximum number of items in the left navigation bar — nests Projects under Work with a dedicated Projects page, and shows only active agents (max 5 recently-active) in the sidebar.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={enableStreamlinedLeftNavigation}
            onCheckedChange={() =>
              toggleMutation.mutate({
                enableStreamlinedLeftNavigation: !enableStreamlinedLeftNavigation,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("pages.instanceexperimentalsettings.toggle_streamlined_left_navigati.attr_aria-label", { defaultValue: "Toggle streamlined left navigation experimental setting" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.task_plan_decomposition_panel.jsx-text", { defaultValue: "Task Plan Decomposition Panel" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.show_accepted_plan_decomposition.jsx-text", { defaultValue: "\n              Show accepted-plan decomposition history on task detail pages. Intended for debugging and validating subtask creation behavior while the presentation is still being refined.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={enableIssuePlanDecompositions}
            onCheckedChange={() =>
              toggleMutation.mutate({
                enableIssuePlanDecompositions: !enableIssuePlanDecompositions,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("pages.instanceexperimentalsettings.toggle_task_plan_decomposition_p.attr_aria-label", { defaultValue: "Toggle task plan decomposition panel experimental setting" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.cloud_sync.jsx-text", { defaultValue: "Cloud Sync" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.show_local_paperclip_cloud_upstr.jsx-text", { defaultValue: "\n              Show local Paperclip Cloud upstream connection, preview, push, retry, and activation review surfaces. Saved connections and run history are preserved when this is disabled.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={enableCloudSync}
            onCheckedChange={() => toggleMutation.mutate({ enableCloudSync: !enableCloudSync })}
            disabled={toggleMutation.isPending}
            aria-label={t("pages.instanceexperimentalsettings.toggle_cloud_sync_experimental_s.attr_aria-label", { defaultValue: "Toggle cloud sync experimental setting" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.auto_restart_dev_server_when_idl.jsx-text", { defaultValue: "Auto-Restart Dev Server When Idle" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instanceexperimentalsettings.in_pnpm_dev_once_wait_for_all_qu.jsx-text", { defaultValue: "\n              In `pnpm dev:once`, wait for all queued and running local agent runs to finish, then restart the server automatically when backend changes or migrations make the current boot stale.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={autoRestartDevServerWhenIdle}
            onCheckedChange={() => toggleMutation.mutate({ autoRestartDevServerWhenIdle: !autoRestartDevServerWhenIdle })}
            disabled={toggleMutation.isPending}
            aria-label={t("pages.instanceexperimentalsettings.toggle_guarded_dev_server_auto_r.attr_aria-label", { defaultValue: "Toggle guarded dev-server auto-restart" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold">{t("pages.instanceexperimentalsettings.auto_create_recovery_tasks.jsx-text", { defaultValue: "Auto-Create Recovery Tasks" })}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t("pages.instanceexperimentalsettings.let_the_heartbeat_scheduler_crea.jsx-text", { defaultValue: "\n                Let the heartbeat scheduler create recovery tasks for task dependency chains found inside the configured lookback window.\n              " })}</p>
            </div>
            <ToggleSwitch
              checked={enableIssueGraphLivenessAutoRecovery}
              onCheckedChange={() => {
                if (enableIssueGraphLivenessAutoRecovery) {
                  toggleMutation.mutate({ enableIssueGraphLivenessAutoRecovery: false });
                  return;
                }
                previewForEnable();
              }}
              disabled={recoveryActionPending}
              aria-label={t("pages.instanceexperimentalsettings.toggle_task_graph_liveness_auto_.attr_aria-label", { defaultValue: "Toggle task graph liveness auto-recovery" })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:items-end">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t("pages.instanceexperimentalsettings.lookback_hours.jsx-text", { defaultValue: "\n                Lookback hours\n              " })}</span>
              <Input
                type="number"
                min={1}
                max={720}
                step={1}
                value={lookbackHoursDraft}
                onChange={(event) => setLookbackHoursDraft(event.target.value)}
                aria-invalid={!lookbackHoursIsValid}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!lookbackHoursIsValid) {
                    setActionError(t("pages.instanceexperimentalsettings.lookback_hours_invalid.error", { defaultValue: "Lookback hours must be a whole number from 1 to 720." }));
                    return;
                  }
                  toggleMutation.mutate({
                    issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
                  });
                }}
                disabled={recoveryActionPending || parsedLookbackHours === lookbackHours}
              >
                {t("pages.instanceexperimentalsettings.save_hours.jsx-text", { defaultValue: "\n                Save hours\n              " })}</Button>
              <Button
                variant="outline"
                onClick={previewForEnable}
                disabled={recoveryActionPending}
              >
                <Search className="h-4 w-4" />
                {t("pages.instanceexperimentalsettings.preview.jsx-text", { defaultValue: "\n                Preview\n              " })}</Button>
              <Button
                onClick={() => {
                  if (!lookbackHoursIsValid) {
                    setActionError(t("pages.instanceexperimentalsettings.lookback_hours_invalid.error", { defaultValue: "Lookback hours must be a whole number from 1 to 720." }));
                    return;
                  }
                  runRecoveryMutation.mutate(parsedLookbackHours);
                }}
                disabled={recoveryActionPending || !enableIssueGraphLivenessAutoRecovery}
              >
                <Play className="h-4 w-4" />
                {t("pages.instanceexperimentalsettings.run_now.jsx-text", { defaultValue: "\n                Run now\n              " })}</Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("pages.instanceexperimentalsettings.current_window_last_hours.jsx-text", {
              count: lookbackHours,
              defaultValue: "Current window: last {{count}} hours.",
            })}
          </p>
        </div>
      </section>

      <RecoveryPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        preview={pendingPreview}
        onEnableOnly={enableOnly}
        onEnableAndRun={enableAndRun}
        isPending={recoveryActionPending}
      />
    </div>
  );
}
