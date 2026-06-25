import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { Agent } from "@paperclipai/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { User } from "lucide-react";
import { cn } from "../lib/utils";
import { roleLabels } from "./agent-config-primitives";
import { AgentIcon } from "./AgentIconPicker";

export function ReportsToPicker({
  agents,
  value,
  onChange,
  disabled = false,
  excludeAgentIds = [],
  disabledEmptyLabel,
  chooseLabel,
}: {
  agents: Agent[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  excludeAgentIds?: string[];
  disabledEmptyLabel?: string;
  chooseLabel?: string;
}) {
const { t } = useTranslation();
  const resolvedDisabledEmptyLabel = disabledEmptyLabel ?? t("components.reportstopicker.reports_to_na_ceo.jsx-text", { defaultValue: "Reports to: N/A (CEO)" });
  const resolvedChooseLabel = chooseLabel ?? t("components.reportstopicker.reports_to_ellipsis.jsx-text", { defaultValue: "Reports to..." });

  const [open, setOpen] = useState(false);
  const exclude = new Set(excludeAgentIds);
  const rows = agents.filter(
    (a) => a.status !== "terminated" && !exclude.has(a.id),
  );
  const current = value ? agents.find((a) => a.id === value) : null;
  const terminatedManager = current?.status === "terminated";
  const unknownManager = Boolean(value && !current);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors",
            terminatedManager && "border-amber-600/45 bg-amber-500/5",
            disabled && "opacity-60 cursor-not-allowed",
          )}
          disabled={disabled}
        >
          {unknownManager ? (
            <>
              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-muted-foreground">{t("components.reportstopicker.unknown_manager_stale_id.jsx-text", { defaultValue: "Unknown manager (stale ID)" })}</span>
            </>
          ) : current ? (
            <>
              <AgentIcon icon={current.icon} className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  "min-w-0 truncate",
                  terminatedManager && "text-amber-900 dark:text-amber-200",
                )}
              >
                {t("components.reportstopicker.reports_to_name.jsx-text", { defaultValue: "Reports to {{name}}", name: current.name })}
                {terminatedManager ? t("components.reportstopicker.terminated.jsx-text", { defaultValue: " (terminated)\n            " }) : ""}
              </span>
            </>
          ) : (
            <>
              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">
                {disabled ? resolvedDisabledEmptyLabel : resolvedChooseLabel}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
            value === null && "bg-accent",
          )}
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          {t("components.reportstopicker.no_manager.jsx-text", { defaultValue: "\n          No manager\n        " })}</button>
        {terminatedManager && (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-0.5">
            <AgentIcon icon={current.icon} className="shrink-0 h-3 w-3" />
            <span className="min-w-0 truncate">
              {t("components.reportstopicker.current.jsx-text", { defaultValue: "\n              Current: " })}{current.name} {t("components.reportstopicker.terminated.jsx-text", { defaultValue: " (terminated)\n            " })}</span>
          </div>
        )}
        {unknownManager && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-0.5">
            {t("components.reportstopicker.saved_manager_is_missing_from_th.jsx-text", { defaultValue: "\n            Saved manager is missing from this company. Choose a new manager or clear.\n          " })}</div>
        )}
        {rows.map((a) => (
          <button
            type="button"
            key={a.id}
            className={cn(
              "flex items-center gap-2 w-full min-w-0 px-2 py-1.5 text-xs rounded hover:bg-accent/50 overflow-hidden",
              a.id === value && "bg-accent",
            )}
            onClick={() => {
              onChange(a.id);
              setOpen(false);
            }}
          >
            <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3 text-muted-foreground" />
            <span className="min-w-0 truncate">{a.name}</span>
            <span className="text-muted-foreground ml-auto shrink-0">{roleLabels[a.role] ?? a.role}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
