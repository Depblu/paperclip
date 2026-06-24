import { useEffect } from "react";
import { useTranslation } from "@/i18n";
import { ArrowLeft, RadioTower } from "lucide-react";
import { Link } from "@/lib/router";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

const DASHBOARD_LIVE_RUN_LIMIT = 50;

export function DashboardLive() {
const { t } = useTranslation();

  const { selectedCompanyId, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: t("pages.dashboardlive.dashboard.breadcrumb", { defaultValue: "Dashboard" }), href: "/dashboard" },
      { label: t("pages.dashboardlive.live_runs.breadcrumb", { defaultValue: "Live runs" }) },
    ]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={RadioTower}
        message={companies.length === 0
          ? t("pages.dashboardlive.create_a_company_to_view_live_runs.empty", { defaultValue: "Create a company to view live runs." })
          : t("pages.dashboardlive.select_a_company_to_view_live_runs.empty", { defaultValue: "Select a company to view live runs." })}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("pages.dashboardlive.dashboard.jsx-text", { defaultValue: "\n            Dashboard\n          " })}</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{t("pages.dashboardlive.live_agent_runs.jsx-text", { defaultValue: "Live agent runs" })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pages.dashboardlive.active_runs_first_followed_by_th.jsx-text", { defaultValue: "\n            Active runs first, followed by the most recent completed runs.\n          " })}</p>
        </div>
        <div className="text-sm text-muted-foreground">{t("pages.dashboardlive.showing_up_to.jsx-text", { defaultValue: "Showing up to " })}{DASHBOARD_LIVE_RUN_LIMIT}</div>
      </div>

      <ActiveAgentsPanel
        companyId={selectedCompanyId}
        title={t("pages.dashboardlive.active_recent.attr_title", { defaultValue: "Active / recent" })}
        minRunCount={DASHBOARD_LIVE_RUN_LIMIT}
        fetchLimit={DASHBOARD_LIVE_RUN_LIMIT}
        cardLimit={DASHBOARD_LIVE_RUN_LIMIT}
        gridClassName="gap-3 md:grid-cols-2 2xl:grid-cols-3"
        cardClassName="h-[420px]"
        emptyMessage="No active or recent agent runs."
        queryScope="dashboard-live"
        showMoreLink={false}
      />
    </div>
  );
}
