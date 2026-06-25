import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PatchInstanceGeneralSettings, BackupRetentionPolicy } from "@paperclipai/shared";
import {
  DAILY_RETENTION_PRESETS,
  WEEKLY_RETENTION_PRESETS,
  MONTHLY_RETENTION_PRESETS,
  DEFAULT_BACKUP_RETENTION,
} from "@paperclipai/shared";
import { LogOut, SlidersHorizontal } from "lucide-react";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { ModeBadge } from "@/components/access/ModeBadge";
import { Button } from "../components/ui/button";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { cn } from "../lib/utils";

const FEEDBACK_TERMS_URL = import.meta.env.VITE_FEEDBACK_TERMS_URL?.trim() || "https://paperclip.ing/tos";

export function InstanceGeneralSettings() {
  const { t } = useTranslation();

  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const signOutMutation = useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("pages.instancegeneralsettings.failed_to_sign_out.error", { defaultValue: "Failed to sign out." }));
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("pages.instancegeneralsettings.instance_settings.breadcrumb", { defaultValue: "Instance Settings" }) },
      { label: t("pages.instancegeneralsettings.general.breadcrumb", { defaultValue: "General" }) },
    ]);
  }, [setBreadcrumbs, t]);

  const generalQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const updateGeneralMutation = useMutation({
    mutationFn: instanceSettingsApi.updateGeneral,
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update general settings.");
    },
  });

  if (generalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("pages.instancegeneralsettings.loading_general_settings.jsx-text", { defaultValue: "Loading general settings..." })}</div>;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error
          ? generalQuery.error.message
          : "Failed to load general settings."}
      </div>
    );
  }

  const censorUsernameInLogs = generalQuery.data?.censorUsernameInLogs === true;
  const keyboardShortcuts = generalQuery.data?.keyboardShortcuts === true;
  const feedbackDataSharingPreference = generalQuery.data?.feedbackDataSharingPreference ?? "prompt";
  const backupRetention: BackupRetentionPolicy = generalQuery.data?.backupRetention ?? DEFAULT_BACKUP_RETENTION;
  const deploymentDescription =
    healthQuery.data?.deploymentMode === "local_trusted"
      ? t("pages.instancegeneralsettings.local_trusted_mode_description.text", { defaultValue: "Local trusted mode is optimized for a local operator. Browser requests run as local board context and no sign-in is required." })
      : healthQuery.data?.deploymentExposure === "public"
        ? t("pages.instancegeneralsettings.authenticated_public_mode_description.text", { defaultValue: "Authenticated public mode requires sign-in for board access and is intended for public URLs." })
        : t("pages.instancegeneralsettings.authenticated_private_mode_description.text", { defaultValue: "Authenticated private mode requires sign-in and is intended for LAN, VPN, or other private-network deployments." });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("pages.instancegeneralsettings.general.jsx-text", { defaultValue: "General" })}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("pages.instancegeneralsettings.configure_instance_wide_preferen.jsx-text", { defaultValue: "\n          Configure instance-wide preferences including log display, keyboard shortcuts, backup retention, and data sharing.\n        " })}</p>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t("pages.instancegeneralsettings.deployment_and_auth.jsx-text", { defaultValue: "Deployment and auth" })}</h2>
            <ModeBadge
              deploymentMode={healthQuery.data?.deploymentMode}
              deploymentExposure={healthQuery.data?.deploymentExposure}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {deploymentDescription}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatusBox
              label={t("pages.instancegeneralsettings.auth_readiness.attr_label", { defaultValue: "Auth readiness" })}
              value={healthQuery.data?.authReady
                ? t("pages.instancegeneralsettings.ready.status", { defaultValue: "Ready" })
                : t("pages.instancegeneralsettings.not_ready.status", { defaultValue: "Not ready" })}
            />
            <StatusBox
              label={t("pages.instancegeneralsettings.bootstrap_status.attr_label", { defaultValue: "Bootstrap status" })}
              value={healthQuery.data?.bootstrapStatus === "bootstrap_pending"
                ? t("pages.instancegeneralsettings.setup_required.status", { defaultValue: "Setup required" })
                : t("pages.instancegeneralsettings.ready.status", { defaultValue: "Ready" })}
            />
            <StatusBox
              label={t("pages.instancegeneralsettings.bootstrap_invite.attr_label", { defaultValue: "Bootstrap invite" })}
              value={healthQuery.data?.bootstrapInviteActive
                ? t("pages.instancegeneralsettings.active.status", { defaultValue: "Active" })
                : t("pages.instancegeneralsettings.none.status", { defaultValue: "None" })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instancegeneralsettings.censor_username_in_logs.jsx-text", { defaultValue: "Censor username in logs" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instancegeneralsettings.hide_the_username_segment_in_hom.jsx-text", { defaultValue: "\n              Hide the username segment in home-directory paths and similar operator-visible log output. Standalone username mentions outside of paths are not yet masked in the live transcript view. This is off by default.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={censorUsernameInLogs}
            onCheckedChange={() => updateGeneralMutation.mutate({ censorUsernameInLogs: !censorUsernameInLogs })}
            disabled={updateGeneralMutation.isPending}
            aria-label={t("pages.instancegeneralsettings.toggle_username_log_censoring.attr_aria-label", { defaultValue: "Toggle username log censoring" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instancegeneralsettings.keyboard_shortcuts.jsx-text", { defaultValue: "Keyboard shortcuts" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instancegeneralsettings.enable_app_keyboard_shortcuts_in.jsx-text", { defaultValue: "\n              Enable app keyboard shortcuts, including inbox navigation and global shortcuts like creating tasks or toggling panels. This is off by default.\n            " })}</p>
          </div>
          <ToggleSwitch
            checked={keyboardShortcuts}
            onCheckedChange={() => updateGeneralMutation.mutate({ keyboardShortcuts: !keyboardShortcuts })}
            disabled={updateGeneralMutation.isPending}
            aria-label={t("pages.instancegeneralsettings.toggle_keyboard_shortcuts.attr_aria-label", { defaultValue: "Toggle keyboard shortcuts" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instancegeneralsettings.backup_retention.jsx-text", { defaultValue: "Backup retention" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instancegeneralsettings.configure_how_long_automatic_dat.jsx-text", { defaultValue: "\n              Configure how long automatic database backups are retained. Backups run roughly every hour and are compressed with gzip. Within the daily window all backups are kept; beyond that, one backup per week and one per month are preserved.\n            " })}</p>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("pages.instancegeneralsettings.daily.jsx-text", { defaultValue: "Daily" })}</h3>
            <div className="flex flex-wrap gap-2">
              {DAILY_RETENTION_PRESETS.map((days) => {
                const active = backupRetention.dailyDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    disabled={updateGeneralMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, dailyDays: days },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{t("pages.instancegeneralsettings.days_count.jsx-text", { count: days, defaultValue: "{{count}} days" })}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("pages.instancegeneralsettings.weekly.jsx-text", { defaultValue: "Weekly" })}</h3>
            <div className="flex flex-wrap gap-2">
              {WEEKLY_RETENTION_PRESETS.map((weeks) => {
                const active = backupRetention.weeklyWeeks === weeks;
                const label = t("pages.instancegeneralsettings.weeks_count.jsx-text", { count: weeks, defaultValue: "{{count}} weeks" });
                return (
                  <button
                    key={weeks}
                    type="button"
                    disabled={updateGeneralMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, weeklyWeeks: weeks },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("pages.instancegeneralsettings.monthly.jsx-text", { defaultValue: "Monthly" })}</h3>
            <div className="flex flex-wrap gap-2">
              {MONTHLY_RETENTION_PRESETS.map((months) => {
                const active = backupRetention.monthlyMonths === months;
                const label = t("pages.instancegeneralsettings.months_count.jsx-text", { count: months, defaultValue: "{{count}} months" });
                return (
                  <button
                    key={months}
                    type="button"
                    disabled={updateGeneralMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, monthlyMonths: months },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instancegeneralsettings.ai_feedback_sharing.jsx-text", { defaultValue: "AI feedback sharing" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instancegeneralsettings.control_whether_thumbs_up_and_th.jsx-text", { defaultValue: "\n              Control whether thumbs up and thumbs down votes can send the voted AI output to Paperclip Labs. Votes are always saved locally.\n            " })}</p>
            {FEEDBACK_TERMS_URL ? (
              <a
                href={FEEDBACK_TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("pages.instancegeneralsettings.read_our_terms_of_service.jsx-text", { defaultValue: "\n                Read our terms of service\n              " })}</a>
            ) : null}
          </div>
          {feedbackDataSharingPreference === "prompt" ? (
            <div className="rounded-lg border border-border/70 bg-accent/20 px-3 py-2 text-sm text-muted-foreground">
              {t("pages.instancegeneralsettings.no_default_is_saved_yet_the_next.jsx-text", { defaultValue: "\n              No default is saved yet. The next thumbs up or thumbs down choice will ask once and then save the answer here.\n            " })}</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {[
            {
              value: "allowed",
              label: t("pages.instancegeneralsettings.always_allow.option_label", { defaultValue: "Always allow" }),
              description: t("pages.instancegeneralsettings.share_voted_outputs.option_description", { defaultValue: "Share voted AI outputs automatically." }),
            },
            {
              value: "not_allowed",
              label: t("pages.instancegeneralsettings.dont_allow.option_label", { defaultValue: "Don't allow" }),
              description: t("pages.instancegeneralsettings.keep_voted_outputs_local.option_description", { defaultValue: "Keep voted AI outputs local only." }),
            },
            ].map((option) => {
              const active = feedbackDataSharingPreference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={updateGeneralMutation.isPending}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border bg-background hover:bg-accent/50",
                  )}
                  onClick={() =>
                    updateGeneralMutation.mutate({
                      feedbackDataSharingPreference: option.value as
                        | "allowed"
                        | "not_allowed",
                    })
                  }
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("pages.instancegeneralsettings.to_retest_the_first_use_prompt_i.jsx-text", { defaultValue: "\n            To retest the first-use prompt in local dev, remove the" })}{" "}
            <code>{t("pages.instancegeneralsettings.feedbackdatasharingpreference.jsx-text", { defaultValue: "feedbackDataSharingPreference" })}</code> {t("pages.instancegeneralsettings.key_from_the.jsx-text", { defaultValue: " key from the" })}{" "}
            <code>{t("pages.instancegeneralsettings.instance_settings_general.jsx-text", { defaultValue: "instance_settings.general" })}</code> {t("pages.instancegeneralsettings.json_row_for_this_instance_or_se.jsx-text", { defaultValue: " JSON row for this instance, or set it back to" })}{" "}
            <code>{t("pages.instancegeneralsettings.prompt.jsx-text", { defaultValue: "\"prompt\"" })}</code>{t("pages.instancegeneralsettings.unset_and.jsx-text", { defaultValue: ". Unset and " })}<code>{t("pages.instancegeneralsettings.prompt.jsx-text", { defaultValue: "\"prompt\"" })}</code> {t("pages.instancegeneralsettings.both_mean_no_default_has_been_ch.jsx-text", { defaultValue: " both mean no default has been chosen yet.\n          " })}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("pages.instancegeneralsettings.sign_out.jsx-text", { defaultValue: "Sign out" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("pages.instancegeneralsettings.sign_out_of_this_paperclip_insta.jsx-text", { defaultValue: "\n              Sign out of this Paperclip instance. You will be redirected to the login page.\n            " })}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            <LogOut className="size-4" />
            {signOutMutation.isPending
              ? t("pages.instancegeneralsettings.signing_out.jsx-text", { defaultValue: "Signing out..." })
              : t("pages.instancegeneralsettings.sign_out.jsx-text", { defaultValue: "Sign out" })}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}
