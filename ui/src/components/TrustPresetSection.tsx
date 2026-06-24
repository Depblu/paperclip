import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import type { TFunction } from "i18next";
import type { AgentPermissions, TrustPreset } from "@paperclipai/shared";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, CollapsibleSection } from "./agent-config-primitives";
import {
  buildPermissionsForTrustPreset,
  clearSingleLowTrustBoundaryTarget,
  getLowTrustBoundary,
  getSingleLowTrustBoundaryTarget,
  getTrustPreset,
  isCeLowTrustBoundaryEditable,
  lowTrustBoundaryHasScope,
  setSingleLowTrustBoundaryTarget,
  type LowTrustBoundaryTarget,
} from "../lib/trust-policy-ui";
import { cn } from "../lib/utils";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function PolicyRow({ label, value }: { label: string; value: string }) {
const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right", value === "-" && "text-muted-foreground")}>{value}</span>
    </div>
  );
}

export interface LowTrustBoundaryCandidate {
  id: string;
  label: string;
}

type LowTrustBoundaryTargetType = LowTrustBoundaryTarget["type"];

function boundaryTargetLabel(targetType: LowTrustBoundaryTargetType, t: TFunction): string {
  if (targetType === "root_issue") return t("components.trustpresetsection.root_issue.jsx-text", { defaultValue: "Root issue" });
  if (targetType === "issue") return t("components.trustpresetsection.issue.jsx-text", { defaultValue: "Issue" });
  return t("components.trustpresetsection.project.jsx-text", { defaultValue: "Project" });
}

function localizedCount(
  value: readonly unknown[] | undefined,
  singularKey: string,
  singularDefault: string,
  pluralKey: string,
  pluralDefault: string,
  t: TFunction,
) {
  const count = value?.length ?? 0;
  if (count === 0) return "-";
  return `${count} ${count === 1 ? t(singularKey, { defaultValue: singularDefault }) : t(pluralKey, { defaultValue: pluralDefault })}`;
}

function localizedBoundarySummary(boundary: ReturnType<typeof getLowTrustBoundary>, t: TFunction) {
  const target = getSingleLowTrustBoundaryTarget(boundary);
  if (target?.type === "project") return t("components.trustpresetsection.project_id_summary.jsx-text", { id: target.id.slice(0, 8), defaultValue: "project {{id}}" });
  if (target?.type === "root_issue") return t("components.trustpresetsection.root_issue_id_summary.jsx-text", { id: target.id.slice(0, 8), defaultValue: "root issue {{id}}" });
  if (target?.type === "issue") return t("components.trustpresetsection.issue_id_summary.jsx-text", { id: target.id.slice(0, 8), defaultValue: "issue {{id}}" });
  if (!boundary || !lowTrustBoundaryHasScope(boundary)) {
    return t("components.trustpresetsection.no_boundary_selected.jsx-text", { defaultValue: "no boundary selected" });
  }
  const count =
    (boundary.projectIds?.length ?? 0) +
    (boundary.rootIssueId ? 1 : 0) +
    (boundary.issueIds?.length ?? 0);
  return t("components.trustpresetsection.boundaries_summary.jsx-text", { count, defaultValue: "{{count}} boundaries" });
}

function trustPresetLabel(preset: TrustPreset, t: TFunction): string {
  return preset === "low_trust_review"
    ? t("components.trustpresetsection.low_trust_review.jsx-text", { defaultValue: "Low-trust review" })
    : t("components.trustpresetsection.standard.jsx-text", { defaultValue: "Standard" });
}

function trustPresetDescription(preset: TrustPreset, t: TFunction): string {
  return preset === "low_trust_review"
    ? t("components.trustpresetsection.contained_for_hostile_or_untru.jsx-text", {
      defaultValue: "Contained for hostile or untrusted input. Narrow Paperclip API, quarantined output. Use for PR review and external-content triage.",
    })
    : t("components.trustpresetsection.company_visible_collaboration_t.jsx-text", {
      defaultValue: "Company-visible collaboration. This is the default for normal work.",
    });
}

export function TrustPresetSection({
  permissions,
  onChange,
  disabled,
  companyId,
  projectCandidates = [],
  issueCandidates = [],
  candidatesLoading,
}: {
  permissions: Partial<AgentPermissions> | null | undefined;
  onChange: (permissions: Partial<AgentPermissions>) => void;
  disabled?: boolean;
  companyId?: string | null;
  projectCandidates?: LowTrustBoundaryCandidate[];
  issueCandidates?: LowTrustBoundaryCandidate[];
  candidatesLoading?: boolean;
}) {
const { t } = useTranslation();

  const [policyOpen, setPolicyOpen] = useState(false);
  const preset = getTrustPreset(permissions);
  const boundary = getLowTrustBoundary(permissions);
  const boundaryTarget = getSingleLowTrustBoundaryTarget(boundary);
  const [targetType, setTargetType] = useState<LowTrustBoundaryTargetType>(boundaryTarget?.type ?? "project");
  const lowTrust = preset === "low_trust_review";
  const hasScope = lowTrustBoundaryHasScope(boundary);
  const boundaryEditable = isCeLowTrustBoundaryEditable(boundary);
  const policy = permissions?.authorizationPolicy ?? null;
  const managedPermissions = useMemo(
    () => buildPermissionsForTrustPreset(permissions, preset),
    [permissions, preset],
  );

  useEffect(() => {
    if (boundaryTarget) setTargetType(boundaryTarget.type);
  }, [boundaryTarget?.type]);

  function handlePresetChange(value: string) {
    const nextPreset: TrustPreset = value === "low_trust_review" ? "low_trust_review" : "standard";
    onChange(buildPermissionsForTrustPreset(permissions, nextPreset));
  }

  function handleBoundaryTargetChange(targetId: string) {
    if (!companyId || !targetId) return;
    onChange(setSingleLowTrustBoundaryTarget(permissions, companyId, { type: targetType, id: targetId }));
  }

  function handleClearBoundary() {
    onChange(clearSingleLowTrustBoundaryTarget(permissions));
  }

  const targetCandidates = targetType === "project" ? projectCandidates : issueCandidates;
  const boundaryValue = boundaryTarget?.type === targetType ? boundaryTarget.id : "";

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">{t("components.trustpresetsection.trust.jsx-text", { defaultValue: "Trust" })}</h3>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <Field
          label={t("components.trustpresetsection.trust_preset.attr_label", { defaultValue: "Trust preset" })}
          hint={t("components.trustpresetsection.choose_how_broadly_this_agent.attr_hint", { defaultValue: "Choose how broadly this agent can read and act on Paperclip work objects." })}
        >
          <select
            className={inputClass}
            value={preset}
            onChange={(event) => handlePresetChange(event.target.value)}
            disabled={disabled}
          >
            <option value="standard">{trustPresetLabel("standard", t)}</option>
            <option value="low_trust_review">{trustPresetLabel("low_trust_review", t)}</option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">{trustPresetDescription(preset, t)}</p>

        {lowTrust ? (
          <div
            role={hasScope ? "status" : "alert"}
            aria-live="polite"
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm flex gap-2",
              hasScope
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-100"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {hasScope ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="font-medium">
                  {hasScope
                    ? t("components.trustpresetsection.containment_active.jsx-text", { defaultValue: "Containment active" })
                    : t("components.trustpresetsection.containment_not_configured.jsx-text", { defaultValue: "Containment not configured" })}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {hasScope
                    ? t("components.trustpresetsection.this_agent_can_only_read_and_mu.jsx-text", { defaultValue: "This agent can only read and mutate work inside its assigned review boundary. Raw output is quarantined from higher-trust agents until a trusted reviewer promotes it." })
                    : t("components.trustpresetsection.this_agent_is_set_to_low_trust.jsx-text", { defaultValue: "This agent is set to low-trust review, but no project, root issue, or issue scope is set in the core policy. Add a scope before this agent can run without denial." })}
                </p>
              </div>
              {boundaryEditable ? (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
                    <Field label={t("components.trustpresetsection.boundary_type.attr_label", { defaultValue: "Boundary type" })}>
                      <select
                        className={inputClass}
                        value={targetType}
                        onChange={(event) => setTargetType(event.target.value as LowTrustBoundaryTargetType)}
                        disabled={disabled}
                      >
                        <option value="project">{t("components.trustpresetsection.project.jsx-text", { defaultValue: "Project" })}</option>
                        <option value="root_issue">{t("components.trustpresetsection.root_issue.jsx-text", { defaultValue: "Root issue" })}</option>
                        <option value="issue">{t("components.trustpresetsection.issue.jsx-text", { defaultValue: "Issue" })}</option>
                      </select>
                    </Field>
                    <Field label={boundaryTargetLabel(targetType, t)}>
                      <select
                        className={inputClass}
                        value={boundaryValue}
                        onChange={(event) => handleBoundaryTargetChange(event.target.value)}
                        disabled={disabled || !companyId || candidatesLoading || targetCandidates.length === 0}
                      >
                        <option value="">
                          {candidatesLoading
                            ? t("components.trustpresetsection.loading.jsx-text", { defaultValue: "Loading..." })
                            : targetCandidates.length === 0
                              ? targetType === "project"
                                ? t("components.trustpresetsection.no_projects_available.jsx-text", { defaultValue: "No projects available" })
                                : t("components.trustpresetsection.no_issues_available.jsx-text", { defaultValue: "No issues available" })
                              : t("components.trustpresetsection.select_boundary.jsx-text", { defaultValue: "Select boundary" })}
                        </option>
                        {targetCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t("components.trustpresetsection.ce_saves_one_containment_boundar.jsx-text", { defaultValue: "\n                      CE saves one containment boundary at a time. Saved policies include this company id.\n                    " })}</p>
                    {boundaryTarget ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleClearBoundary}
                        disabled={disabled}
                      >
                        {t("components.trustpresetsection.clear_boundary.jsx-text", { defaultValue: "\n                        Clear boundary\n                      " })}</Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground">
                  <p className="text-sm font-medium">{t("components.trustpresetsection.managed_by_ee_api.jsx-text", { defaultValue: "Managed by EE/API" })}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t("components.trustpresetsection.this_policy_has.jsx-text", { defaultValue: "\n                    This policy has " })}{localizedBoundarySummary(boundary, t)} {t("components.trustpresetsection.and_cannot_be_edited_by_the_ce_s.jsx-text", { defaultValue: " and cannot be edited by the CE single-boundary editor.\n                  " })}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("components.trustpresetsection.want_to_set_more_than_one_contai.jsx-text", { defaultValue: "\n                Want to set more than one containment boundary?" })}{" "}
                <a
                  className="underline underline-offset-2 hover:text-foreground"
                  href="https://paperclip.ing/ee"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("components.trustpresetsection.get_paperclip_ee.jsx-text", { defaultValue: "\n                  Get Paperclip EE.\n                " })}</a>
              </p>
              <CollapsibleSection
                title={t("components.trustpresetsection.view_policy.attr_title", { defaultValue: "View policy" })}
                open={policyOpen}
                onToggle={() => setPolicyOpen((open) => !open)}
              >
                <div className="divide-y divide-border/60 text-foreground">
                  <PolicyRow label={t("components.trustpresetsection.preset.attr_label", { defaultValue: "Preset" })} value="Low-trust review v1" />
                  <PolicyRow label={t("components.trustpresetsection.raw_output.attr_label", { defaultValue: "Raw output" })} value={t("components.trustpresetsection.quarantined_from_higher_trust.attr_value", { defaultValue: "Quarantined from higher-trust agents" })} />
                  <PolicyRow label={t("components.trustpresetsection.projects.attr_label", { defaultValue: "Projects" })} value={localizedCount(boundary?.projectIds, "components.trustpresetsection.project_count_singular.jsx-text", "project", "components.trustpresetsection.project_count_plural.jsx-text", "projects", t)} />
                  <PolicyRow label={t("components.trustpresetsection.root_issue.attr_label", { defaultValue: "Root issue" })} value={boundary?.rootIssueId ? boundary.rootIssueId.slice(0, 8) : "-"} />
                  <PolicyRow label={t("components.trustpresetsection.explicit_issues.attr_label", { defaultValue: "Explicit issues" })} value={localizedCount(boundary?.issueIds, "components.trustpresetsection.issue_count_singular.jsx-text", "issue", "components.trustpresetsection.issue_count_plural.jsx-text", "issues", t)} />
                  <PolicyRow label={t("components.trustpresetsection.allowed_agents.attr_label", { defaultValue: "Allowed agents" })} value={localizedCount(boundary?.allowedAgentIds, "components.trustpresetsection.agent_count_singular.jsx-text", "agent", "components.trustpresetsection.agent_count_plural.jsx-text", "agents", t)} />
                  <PolicyRow label={t("components.trustpresetsection.allowed_tools.attr_label", { defaultValue: "Allowed tools" })} value={boundary?.allowedToolClasses?.join(" · ") || "-"} />
                  <PolicyRow label={t("components.trustpresetsection.allowed_secrets.attr_label", { defaultValue: "Allowed secrets" })} value={localizedCount(boundary?.allowedSecretBindingIds, "components.trustpresetsection.binding_count_singular.jsx-text", "binding", "components.trustpresetsection.binding_count_plural.jsx-text", "bindings", t)} />
                  <PolicyRow label={t("components.trustpresetsection.promotion_target.attr_label", { defaultValue: "Promotion target" })} value={boundary?.outputPromotionTarget?.issueId?.slice(0, 8) ?? "-"} />
                  <PolicyRow
                    label={t("components.trustpresetsection.ee_fields.attr_label", { defaultValue: "EE fields" })}
                    value={Object.keys(policy ?? {}).some((key) => !["trustPreset", "reviewPreset", "trustBoundary"].includes(key))
                      ? "Custom advanced policy fields preserved"
                      : "-"}
                  />
                </div>
              </CollapsibleSection>
            </div>
          </div>
        ) : null}

        {managedPermissions.authorizationPolicy?.reviewPreset ? null : (
          <p className="text-xs text-muted-foreground">
            {t("components.trustpresetsection.advanced_permissions_remain_edit.jsx-text", { defaultValue: "\n            Advanced permissions remain editable through the EE permissions extension when installed.\n          " })}</p>
        )}
      </div>
    </div>
  );
}
