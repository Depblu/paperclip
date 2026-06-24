import { useEffect, useState } from "react";
import { t as translate, useTranslation } from "@/i18n";
import { AlertTriangle, RotateCcw, TimerReset } from "lucide-react";
import { healthApi, type DevServerHealthStatus } from "../api/health";

const RESTART_PENDING_RESET_MS = 30_000;
type TranslateFn = typeof translate;

function formatRelativeTimestamp(value: string | null, t: TranslateFn = translate): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;

  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) return t("components.devrestartbanner.just_now", { defaultValue: "just now" });
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (deltaMinutes < 60) {
    return t("components.devrestartbanner.minutes_ago", {
      count: deltaMinutes,
      defaultValue: "{{count}}m ago",
    });
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return t("components.devrestartbanner.hours_ago", {
      count: deltaHours,
      defaultValue: "{{count}}h ago",
    });
  }
  const deltaDays = Math.round(deltaHours / 24);
  return t("components.devrestartbanner.days_ago", {
    count: deltaDays,
    defaultValue: "{{count}}d ago",
  });
}

function describeReason(devServer: DevServerHealthStatus, t: TranslateFn = translate): string {
  if (devServer.reason === "backend_changes_and_pending_migrations") {
    return t("components.devrestartbanner.reason_backend_changes_and_pending_migrations", {
      defaultValue: "backend files changed and migrations are pending",
    });
  }
  if (devServer.reason === "pending_migrations") {
    return t("components.devrestartbanner.reason_pending_migrations", {
      defaultValue: "pending migrations need a fresh boot",
    });
  }
  return t("components.devrestartbanner.reason_backend_changes", {
    defaultValue: "backend files changed since this server booted",
  });
}

export function DevRestartBanner({ devServer }: { devServer?: DevServerHealthStatus }) {
const { t } = useTranslation();

  const [restartPending, setRestartPending] = useState(false);
  useEffect(() => {
    if (!restartPending) return;
    const timeout = window.setTimeout(() => {
      setRestartPending(false);
    }, RESTART_PENDING_RESET_MS);
    return () => window.clearTimeout(timeout);
  }, [restartPending]);

  if (!devServer?.enabled || !devServer.restartRequired) return null;

  const currentDevServer = devServer;
  const changedAt = formatRelativeTimestamp(devServer.lastChangedAt, t);
  const sample = devServer.changedPathsSample.slice(0, 3);
  const activeRunLabel = t("components.devrestartbanner.live_run_count", {
    count: devServer.activeRunCount,
    defaultValue: "{{count}} live run",
    defaultValue_plural: "{{count}} live runs",
  });

  async function requestRestartNow() {
    const warning =
      currentDevServer.activeRunCount > 0
        ? t("components.devrestartbanner.restart_interrupt_confirm", {
          activeRunLabel,
          defaultValue: "Restart Paperclip now? This may interrupt {{activeRunLabel}}.",
        })
        : t("components.devrestartbanner.restart_confirm", { defaultValue: "Restart Paperclip now?" });
    if (!window.confirm(warning)) return;

    setRestartPending(true);
    try {
      await healthApi.requestDevServerRestart();
    } catch (error) {
      setRestartPending(false);
      window.alert(error instanceof Error
        ? error.message
        : t("components.devrestartbanner.failed_to_request_restart", { defaultValue: "Failed to request restart" }));
    }
  }

  return (
    <div className="border-b border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex flex-col gap-3 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{t("components.devrestartbanner.restart_required.jsx-text", { defaultValue: "Restart Required" })}</span>
            {devServer.autoRestartEnabled ? (
              <span className="rounded-full bg-amber-900/10 px-2 py-0.5 text-[10px] tracking-[0.14em] dark:bg-amber-100/10">
                {t("components.devrestartbanner.auto_restart_on.jsx-text", { defaultValue: "\n                Auto-Restart On\n              " })}</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm">
            {describeReason(devServer, t)}
            {changedAt
              ? t("components.devrestartbanner.updated_at", {
                changedAt,
                defaultValue: " · updated {{changedAt}}",
              })
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-900/80 dark:text-amber-100/75">
            {sample.length > 0 ? (
              <span>
                {t("components.devrestartbanner.changed.jsx-text", { defaultValue: "\n                Changed: " })}{sample.join(", ")}
                {devServer.changedPathCount > sample.length
                  ? t("components.devrestartbanner.more_count", {
                    count: devServer.changedPathCount - sample.length,
                    defaultValue: " +{{count}} more",
                  })
                  : ""}
              </span>
            ) : null}
            {devServer.pendingMigrations.length > 0 ? (
              <span>
                {t("components.devrestartbanner.pending_migrations.jsx-text", { defaultValue: "\n                Pending migrations: " })}{devServer.pendingMigrations.slice(0, 2).join(", ")}
                {devServer.pendingMigrations.length > 2
                  ? t("components.devrestartbanner.more_count", {
                    count: devServer.pendingMigrations.length - 2,
                    defaultValue: " +{{count}} more",
                  })
                  : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium md:justify-end">
          {devServer.waitingForIdle ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-900/10 px-3 py-1.5 dark:bg-amber-100/10">
              <TimerReset className="h-3.5 w-3.5" />
              <span>
                {t("components.devrestartbanner.waiting_for_runs_to_finish.label", {
                  activeRunLabel,
                  defaultValue: "Waiting for {{activeRunLabel}} to finish",
                })}
              </span>
            </div>
          ) : devServer.autoRestartEnabled ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-900/10 px-3 py-1.5 dark:bg-amber-100/10">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t("components.devrestartbanner.auto_restart_will_trigger_when_t.jsx-text", { defaultValue: "Auto-restart will trigger when the instance is idle" })}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-900/10 px-3 py-1.5 dark:bg-amber-100/10">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t("components.devrestartbanner.restart.jsx-text", { defaultValue: "Restart " })}<code>{t("components.devrestartbanner.pnpm_dev_once.jsx-text", { defaultValue: "pnpm dev:once" })}</code> {t("components.devrestartbanner.after_the_active_work_is_safe_to.jsx-text", { defaultValue: " after the active work is safe to interrupt" })}</span>
            </div>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
            onClick={() => {
              void requestRestartNow();
            }}
            disabled={restartPending}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{restartPending ? "Restart requested" : "Restart now"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
