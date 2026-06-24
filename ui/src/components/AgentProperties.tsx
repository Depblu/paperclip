import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { AGENT_ROLE_LABELS, type Agent, type AgentRuntimeState } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { getAdapterLabel } from "../adapters/adapter-display-registry";
import { queryKeys } from "../lib/queryKeys";
import { AgentStatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { formatDate, agentUrl } from "../lib/utils";
import { Separator } from "@/components/ui/separator";
import type { TFunction } from "i18next";

interface AgentPropertiesProps {
  agent: Agent;
  runtimeState?: AgentRuntimeState;
}

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20 mt-0.5">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">{children}</div>
    </div>
  );
}

function roleLabel(role: string, t: TFunction): string {
  const labels: Record<string, string> = {
    ceo: t("components.agentproperties.roles.ceo", { defaultValue: "CEO" }),
    cto: t("components.agentproperties.roles.cto", { defaultValue: "CTO" }),
    cmo: t("components.agentproperties.roles.cmo", { defaultValue: "CMO" }),
    cfo: t("components.agentproperties.roles.cfo", { defaultValue: "CFO" }),
    security: t("components.agentproperties.roles.security", { defaultValue: "Security" }),
    engineer: t("components.agentproperties.roles.engineer", { defaultValue: "Engineer" }),
    designer: t("components.agentproperties.roles.designer", { defaultValue: "Designer" }),
    pm: t("components.agentproperties.roles.pm", { defaultValue: "PM" }),
    qa: t("components.agentproperties.roles.qa", { defaultValue: "QA" }),
    devops: t("components.agentproperties.roles.devops", { defaultValue: "DevOps" }),
    researcher: t("components.agentproperties.roles.researcher", { defaultValue: "Researcher" }),
    general: t("components.agentproperties.roles.general", { defaultValue: "General" }),
  };
  return labels[role] ?? roleLabels[role] ?? role;
}

export function AgentProperties({ agent, runtimeState }: AgentPropertiesProps) {
const { t } = useTranslation();

  const { selectedCompanyId } = useCompany();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!agent.reportsTo,
  });

  const reportsToAgent = agent.reportsTo ? agents?.find((a) => a.id === agent.reportsTo) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label={t("components.agentproperties.status.attr_label", { defaultValue: "Status" })}>
          <AgentStatusBadge status={agent.status} />
        </PropertyRow>
        <PropertyRow label={t("components.agentproperties.role.attr_label", { defaultValue: "Role" })}>
          <span className="text-sm">{roleLabel(agent.role, t)}</span>
        </PropertyRow>
        {agent.title && (
          <PropertyRow label={t("components.agentproperties.title.attr_label", { defaultValue: "Title" })}>
            <span className="text-sm">{agent.title}</span>
          </PropertyRow>
        )}
        <PropertyRow label={t("components.agentproperties.adapter.attr_label", { defaultValue: "Adapter" })}>
          <span className="text-sm font-mono">{getAdapterLabel(agent.adapterType)}</span>
        </PropertyRow>
      </div>

      <Separator />

      <div className="space-y-1">
        {(runtimeState?.sessionDisplayId ?? runtimeState?.sessionId) && (
          <PropertyRow label={t("components.agentproperties.session.attr_label", { defaultValue: "Session" })}>
            <span className="text-xs font-mono">
              {String(runtimeState.sessionDisplayId ?? runtimeState.sessionId).slice(0, 12)}...
            </span>
          </PropertyRow>
        )}
        {runtimeState?.lastError && (
          <PropertyRow label={t("components.agentproperties.last_error.attr_label", { defaultValue: "Last error" })}>
            <span className="text-xs text-red-600 dark:text-red-400 break-words min-w-0">{runtimeState.lastError}</span>
          </PropertyRow>
        )}
        {agent.lastHeartbeatAt && (
          <PropertyRow label={t("components.agentproperties.last_heartbeat.attr_label", { defaultValue: "Last Heartbeat" })}>
            <span className="text-sm">{formatDate(agent.lastHeartbeatAt)}</span>
          </PropertyRow>
        )}
        {agent.reportsTo && (
          <PropertyRow label={t("components.agentproperties.reports_to.attr_label", { defaultValue: "Reports To" })}>
            {reportsToAgent ? (
              <Link to={agentUrl(reportsToAgent)} className="hover:underline">
                <Identity name={reportsToAgent.name} size="sm" />
              </Link>
            ) : (
              <span className="text-sm font-mono">{agent.reportsTo.slice(0, 8)}</span>
            )}
          </PropertyRow>
        )}
        <PropertyRow label={t("components.agentproperties.created.attr_label", { defaultValue: "Created" })}>
          <span className="text-sm">{formatDate(agent.createdAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
