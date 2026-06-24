import { useState, useRef, useEffect, useCallback } from "react";
import { t as translate, useTranslation } from "@/i18n";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";

/* ---- Help text for (?) tooltips ---- */
export const help: Record<string, string> = {
  get name() { return translate("components.agentconfigprimitives.name.help", { defaultValue: `Display name for this agent.` }); },
  get title() { return translate("components.agentconfigprimitives.title.help", { defaultValue: `Job title shown in the org chart.` }); },
  get role() { return translate("components.agentconfigprimitives.role.help", { defaultValue: `Organizational role. Determines position and capabilities.` }); },
  get reportsTo() { return translate("components.agentconfigprimitives.reports_to.help", { defaultValue: `The agent this one reports to in the org hierarchy.` }); },
  get capabilities() { return translate("components.agentconfigprimitives.capabilities.help", { defaultValue: `Describes what this agent can do. Shown in the org chart and used for task routing.` }); },
  get adapterType() { return translate("components.agentconfigprimitives.adapter_type.help", { defaultValue: `How this agent runs: local CLI (Claude/Codex/OpenCode), OpenClaw Gateway, spawned process, or generic HTTP webhook.` }); },
  get cwd() { return translate("components.agentconfigprimitives.cwd.help", { defaultValue: `Deprecated legacy working directory fallback for local adapters. Existing agents may still carry this value, but new configurations should use project workspaces instead.` }); },
  get promptTemplate() { return translate("components.agentconfigprimitives.prompt_template.help", { defaultValue: `Sent on every heartbeat. Keep this small and dynamic. Use it for current-task framing, not large static instructions. Supports {{ agent.id }}, {{ agent.name }}, {{ agent.role }} and other template variables.` }); },
  get model() { return translate("components.agentconfigprimitives.model.help", { defaultValue: `Override the default model used by the adapter.` }); },
  get thinkingEffort() { return translate("components.agentconfigprimitives.thinking_effort.help", { defaultValue: `Control model reasoning depth. Supported values vary by adapter/model.` }); },
  get chrome() { return translate("components.agentconfigprimitives.chrome.help", { defaultValue: `Enable Claude's Chrome integration by passing --chrome.` }); },
  get dangerouslySkipPermissions() { return translate("components.agentconfigprimitives.dangerously_skip_permissions.help", { defaultValue: `Run unattended by auto-approving adapter permission prompts when supported.` }); },
  get dangerouslyBypassSandbox() { return translate("components.agentconfigprimitives.dangerously_bypass_sandbox.help", { defaultValue: `Run Codex without sandbox restrictions. Required for filesystem/network access.` }); },
  get search() { return translate("components.agentconfigprimitives.search.help", { defaultValue: `Enable Codex web search capability during runs.` }); },
  get fastMode() { return translate("components.agentconfigprimitives.fast_mode.help", { defaultValue: `Enable Codex Fast mode. This burns credits/tokens much faster and is supported on GPT-5.4 and manual Codex model IDs.` }); },
  get workspaceStrategy() { return translate("components.agentconfigprimitives.workspace_strategy.help", { defaultValue: `How Paperclip should realize an execution workspace for this agent. Keep project_primary for normal cwd execution, or use git_worktree for issue-scoped isolated checkouts.` }); },
  get workspaceBaseRef() { return translate("components.agentconfigprimitives.workspace_base_ref.help", { defaultValue: `Base git ref used when creating a worktree branch. Leave blank to use the resolved workspace ref or HEAD.` }); },
  get workspaceBranchTemplate() { return translate("components.agentconfigprimitives.workspace_branch_template.help", { defaultValue: `Template for naming derived branches. Supports {{issue.identifier}}, {{issue.title}}, {{agent.name}}, {{project.id}}, {{workspace.repoRef}}, and {{slug}}.` }); },
  get worktreeParentDir() { return translate("components.agentconfigprimitives.worktree_parent_dir.help", { defaultValue: `Directory where derived worktrees should be created. Absolute, ~-prefixed, and repo-relative paths are supported.` }); },
  get runtimeServicesJson() { return translate("components.agentconfigprimitives.runtime_services_json.help", { defaultValue: `Optional workspace runtime service definitions. Use this for shared app servers, workers, or other long-lived companion processes attached to the workspace.` }); },
  get maxTurnsPerRun() { return translate("components.agentconfigprimitives.max_turns_per_run.help", { defaultValue: `Maximum number of agentic turns (tool calls) per heartbeat run.` }); },
  get command() { return translate("components.agentconfigprimitives.command.help", { defaultValue: `The command to execute (e.g. node, python).` }); },
  get localCommand() { return translate("components.agentconfigprimitives.local_command.help", { defaultValue: `Override the path to the CLI command you want the adapter to call (e.g. /usr/local/bin/claude, codex, opencode).` }); },
  get args() { return translate("components.agentconfigprimitives.args.help", { defaultValue: `Command-line arguments, comma-separated.` }); },
  get extraArgs() { return translate("components.agentconfigprimitives.extra_args.help", { defaultValue: `Extra CLI arguments for local adapters, comma-separated.` }); },
  get envVars() { return translate("components.agentconfigprimitives.env_vars.help", { defaultValue: `Environment variables injected into the adapter process. Use plain values or secret references.` }); },
  get bootstrapPrompt() { return translate("components.agentconfigprimitives.bootstrap_prompt.help", { defaultValue: `Only sent when Paperclip starts a fresh session. Use this for stable setup guidance that should not be repeated on every heartbeat.` }); },
  get payloadTemplateJson() { return translate("components.agentconfigprimitives.payload_template_json.help", { defaultValue: `Optional JSON merged into remote adapter request payloads before Paperclip adds its standard wake and workspace fields.` }); },
  get webhookUrl() { return translate("components.agentconfigprimitives.webhook_url.help", { defaultValue: `The URL that receives POST requests when the agent is invoked.` }); },
  get heartbeatInterval() { return translate("components.agentconfigprimitives.heartbeat_interval.help", { defaultValue: `Run this agent automatically on a timer. Useful for periodic tasks like checking for new work.` }); },
  get intervalSec() { return translate("components.agentconfigprimitives.interval_sec.help", { defaultValue: `Seconds between automatic heartbeat invocations.` }); },
  get timeoutSec() { return translate("components.agentconfigprimitives.timeout_sec.help", { defaultValue: `Maximum seconds a run can take before being terminated. 0 means no timeout.` }); },
  get graceSec() { return translate("components.agentconfigprimitives.grace_sec.help", { defaultValue: `Seconds to wait after sending interrupt before force-killing the process.` }); },
  get wakeOnDemand() { return translate("components.agentconfigprimitives.wake_on_demand.help", { defaultValue: `Allow this agent to be woken by assignments, API calls, UI actions, or automated systems.` }); },
  get cooldownSec() { return translate("components.agentconfigprimitives.cooldown_sec.help", { defaultValue: `Minimum seconds between consecutive heartbeat runs.` }); },
  get maxConcurrentRuns() { return translate("components.agentconfigprimitives.max_concurrent_runs.help", { defaultValue: `Maximum number of heartbeat runs that can execute simultaneously for this agent.` }); },
  get maxTurnContinuationEnabled() { return translate("components.agentconfigprimitives.max_turn_continuation_enabled.help", { defaultValue: `Automatically queue bounded continuation runs when an adapter stops because its per-run turn cap was exhausted.` }); },
  get maxTurnContinuationMaxAttempts() { return translate("components.agentconfigprimitives.max_turn_continuation_max_attempts.help", { defaultValue: `Maximum automatic continuations after one max-turn stop. This is separate from max turns per run.` }); },
  get maxTurnContinuationDelaySec() { return translate("components.agentconfigprimitives.max_turn_continuation_delay_sec.help", { defaultValue: `Seconds to wait before starting each max-turn continuation.` }); },
  get budgetMonthlyCents() { return translate("components.agentconfigprimitives.budget_monthly_cents.help", { defaultValue: `Monthly spending limit in cents. 0 means no limit.` }); },
};

import { getAdapterLabels } from "../adapters/adapter-display-registry";

export const adapterLabels = getAdapterLabels();

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

/* ---- Primitive components ---- */

export function HintIcon({ text }: { text: string }) {
const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
const { t } = useTranslation();

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  toggleTestId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  toggleTestId?: string;
}) {
const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      <button
        data-slot="toggle"
        data-testid={toggleTestId}
        type="button"
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-green-600" : "bg-muted"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function ToggleWithNumber({
  label,
  hint,
  checked,
  onCheckedChange,
  number,
  onNumberChange,
  numberLabel,
  numberHint,
  numberPrefix,
  showNumber,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  number: number;
  onNumberChange: (v: number) => void;
  numberLabel: string;
  numberHint?: string;
  numberPrefix?: string;
  showNumber: boolean;
}) {
const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          {hint && <HintIcon text={hint} />}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {showNumber && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {numberPrefix && <span>{numberPrefix}</span>}
          <input
            type="number"
            className="w-16 rounded-md border border-border px-2 py-0.5 bg-transparent outline-none text-xs font-mono text-center"
            value={number}
            onChange={(e) => onNumberChange(Number(e.target.value))}
          />
          <span>{numberLabel}</span>
          {numberHint && <HintIcon text={numberHint} />}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  bordered,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
const { t } = useTranslation();

  return (
    <div className={cn(bordered && "border-t border-border")}>
      <button
        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
const { t } = useTranslation();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{ minHeight }}
    />
  );
}

/**
 * Text input that manages internal draft state.
 * Calls `onCommit` on blur (and optionally on every change if `immediate` is set).
 */
export function DraftInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
const { t } = useTranslation();

  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      {...props}
    />
  );
}

/**
 * Auto-expanding textarea with draft state and blur-commit.
 */
export function DraftTextarea({
  value,
  onCommit,
  immediate,
  placeholder,
  minRows,
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
const { t } = useTranslation();

  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [draft, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{ minHeight }}
    />
  );
}

/**
 * Number input with draft state and blur-commit.
 */
export function DraftNumberInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: number;
  onCommit: (v: number) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">) {
const { t } = useTranslation();

  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        const num = Number(draft) || 0;
        if (num !== value) onCommit(num);
      }}
      {...props}
    />
  );
}

/**
 * "Choose" button that opens a dialog explaining the user must manually
 * type the path due to browser security limitations.
 */
export function ChoosePathButton() {
const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
        onClick={() => setOpen(true)}
      >
        {t("components.agent_config_primitives.choose.jsx-text", { defaultValue: "\n        Choose\n      " })}</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("components.agent_config_primitives.specify_path_manually.jsx-text", { defaultValue: "Specify path manually" })}</DialogTitle>
            <DialogDescription>
              {t("components.agent_config_primitives.browser_security_blocks_apps_fro.jsx-text", { defaultValue: "\n              Browser security blocks apps from reading full local paths via a file picker. Copy the absolute path and paste it into the input.\n            " })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <p className="font-medium">{t("components.agent_config_primitives.macos_finder.jsx-text", { defaultValue: "macOS (Finder)" })}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("components.agent_config_primitives.find_the_folder_in_finder.jsx-text", { defaultValue: "Find the folder in Finder." })}</li>
                <li>{t("components.agent_config_primitives.hold.jsx-text", { defaultValue: "Hold " })}<kbd>{t("components.agent_config_primitives.option.jsx-text", { defaultValue: "Option" })}</kbd> {t("components.agent_config_primitives.and_right_click_the_folder.jsx-text", { defaultValue: " and right-click the folder." })}</li>
                <li>{t("components.agent_config_primitives.click_copy_lt_folder_name_gt_as_.jsx-text", { defaultValue: "Click \"Copy &lt;folder name&gt; as Pathname\"." })}</li>
                <li>{t("components.agent_config_primitives.paste_the_result_into_the_path_i.jsx-text", { defaultValue: "Paste the result into the path input." })}</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                /Users/yourname/Documents/project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">{t("components.agent_config_primitives.windows_file_explorer.jsx-text", { defaultValue: "Windows (File Explorer)" })}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("components.agent_config_primitives.find_the_folder_in_file_explorer.jsx-text", { defaultValue: "Find the folder in File Explorer." })}</li>
                <li>{t("components.agent_config_primitives.hold.jsx-text", { defaultValue: "Hold " })}<kbd>{t("components.agent_config_primitives.shift.jsx-text", { defaultValue: "Shift" })}</kbd> {t("components.agent_config_primitives.and_right_click_the_folder.jsx-text", { defaultValue: " and right-click the folder." })}</li>
                <li>{t("components.agent_config_primitives.click_copy_as_path.jsx-text", { defaultValue: "Click \"Copy as path\"." })}</li>
                <li>{t("components.agent_config_primitives.paste_the_result_into_the_path_i.jsx-text", { defaultValue: "Paste the result into the path input." })}</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {t("components.agent_config_primitives.c_users_yourname_documents_proje.jsx-text", { defaultValue: "\n                C:\\Users\\yourname\\Documents\\project\n              " })}</p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">{t("components.agent_config_primitives.terminal_fallback_macos_linux.jsx-text", { defaultValue: "Terminal fallback (macOS/Linux)" })}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("components.agent_config_primitives.run.jsx-text", { defaultValue: "Run " })}<code>{t("components.agent_config_primitives.cd_path_to_folder.jsx-text", { defaultValue: "cd /path/to/folder" })}</code>.</li>
                <li>{t("components.agent_config_primitives.run.jsx-text", { defaultValue: "Run " })}<code>{t("components.agent_config_primitives.pwd.jsx-text", { defaultValue: "pwd" })}</code>.</li>
                <li>{t("components.agent_config_primitives.copy_the_output_and_paste_it_int.jsx-text", { defaultValue: "Copy the output and paste it into the path input." })}</li>
              </ol>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Label + input rendered on the same line (inline layout for compact fields).
 */
export function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      <div className="w-24 ml-auto">{children}</div>
    </div>
  );
}
