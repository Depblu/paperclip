import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Clock3, Cpu, FlaskConical, Puzzle, Settings, Shield, SlidersHorizontal, UserRoundPen } from "lucide-react";
import type { PluginRecord } from "@paperclipai/shared";
import { NavLink } from "@/lib/router";
import { pluginsApi } from "@/api/plugins";
import { queryKeys } from "@/lib/queryKeys";
import { SIDEBAR_SCROLL_RESET_STATE } from "@/lib/navigation-scroll";
import { SidebarNavItem } from "./SidebarNavItem";

/**
 * Sandbox-provider-only plugins (e.g. E2B, exe.dev, Modal) have no per-plugin
 * settings page — `PluginSettings` redirects them to the Environments page —
 * so a sidebar entry would lead nowhere useful. Filter them out here. Plugins
 * that mix a sandbox provider with other contributions still appear.
 */
function isSandboxProviderOnly(plugin: PluginRecord): boolean {
  const drivers = plugin.manifestJson.environmentDrivers ?? [];
  if (drivers.length === 0) return false;
  return drivers.every((d) => d.kind === "sandbox_provider");
}

export function InstanceSidebar() {
const { t } = useTranslation();

  const { data: plugins } = useQuery({
    queryKey: queryKeys.plugins.all,
    queryFn: () => pluginsApi.list(),
  });

  const sidebarPlugins = (plugins ?? []).filter((p) => !isSandboxProviderOnly(p));

  return (
    <aside className="w-full h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <Settings className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        <span className="flex-1 text-sm font-bold text-foreground truncate">
          {t("components.instancesidebar.instance_settings.jsx-text", { defaultValue: "\n          Instance Settings\n        " })}</span>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem to="/instance/settings/profile" label={t("components.instancesidebar.profile.attr_label", { defaultValue: "Profile" })} icon={UserRoundPen} end />
          <SidebarNavItem to="/instance/settings/general" label={t("components.instancesidebar.general.attr_label", { defaultValue: "General" })} icon={SlidersHorizontal} end />
          <SidebarNavItem to="/instance/settings/access" label={t("components.instancesidebar.access.attr_label", { defaultValue: "Access" })} icon={Shield} end />
          <SidebarNavItem to="/instance/settings/heartbeats" label={t("components.instancesidebar.heartbeats.attr_label", { defaultValue: "Heartbeats" })} icon={Clock3} end />
          <SidebarNavItem to="/instance/settings/experimental" label={t("components.instancesidebar.experimental.attr_label", { defaultValue: "Experimental" })} icon={FlaskConical} />
          <SidebarNavItem to="/instance/settings/plugins" label={t("components.instancesidebar.plugins.attr_label", { defaultValue: "Plugins" })} icon={Puzzle} />
          {sidebarPlugins.length > 0 ? (
            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border/70 pl-3">
              {sidebarPlugins.map((plugin) => (
                <NavLink
                  key={plugin.id}
                  to={`/instance/settings/plugins/${plugin.id}`}
                  state={SIDEBAR_SCROLL_RESET_STATE}
                  className={({ isActive }) =>
                    [
                      "rounded-md px-2 py-1.5 text-xs transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    ].join(" ")
                  }
                >
                  {plugin.manifestJson.displayName ?? plugin.packageName}
                </NavLink>
              ))}
            </div>
          ) : null}
          <SidebarNavItem to="/instance/settings/adapters" label={t("components.instancesidebar.adapters.attr_label", { defaultValue: "Adapters" })} icon={Cpu} />
        </div>
      </nav>
    </aside>
  );
}
