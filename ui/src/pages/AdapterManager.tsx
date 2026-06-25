/**
 * @fileoverview Adapter Manager page — install, view, and manage external adapters.
 *
 * Adapters are simpler than plugins: no workers, no events, no manifests.
 * They just register a ServerAdapterModule that provides model discovery and execution.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cpu, Plus, Power, Trash2, FolderOpen, Package, RefreshCw, Download } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { adaptersApi } from "@/api/adapters";
import type { AdapterInfo } from "@/api/adapters";
import { getAdapterLabel } from "@/adapters/adapter-display-registry";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToastActions } from "@/context/ToastContext";
import { cn } from "@/lib/utils";
import { ChoosePathButton } from "@/components/PathInstructionsModal";
import { invalidateDynamicParser } from "@/adapters/dynamic-loader";
import { invalidateConfigSchemaCache } from "@/adapters/schema-config-fields";

function AdapterRow({
  adapter,
  canRemove,
  onToggle,
  onRemove,
  onReload,
  onReinstall,
  isToggling,
  isReloading,
  isReinstalling,
  overriddenBy,
  /** Custom tooltip for the power button when adapter is enabled. */
  toggleTitleEnabled,
  /** Custom tooltip for the power button when adapter is disabled. */
  toggleTitleDisabled,
  /** Custom label for the disabled badge (defaults to "Hidden from menus"). */
  disabledBadgeLabel,
}: {
  adapter: AdapterInfo;
  canRemove: boolean;
  onToggle: (type: string, disabled: boolean) => void;
  onRemove: (type: string) => void;
  onReload?: (type: string) => void;
  onReinstall?: (type: string) => void;
  isToggling: boolean;
  isReloading?: boolean;
  isReinstalling?: boolean;
  /** When set, shows an "Overridden by …" badge (used for builtin entries). */
  overriddenBy?: string;
  toggleTitleEnabled?: string;
  toggleTitleDisabled?: string;
  disabledBadgeLabel?: string;
}) {
  const { t } = useTranslation();

  return (
    <li>
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-medium", adapter.disabled && "text-muted-foreground line-through")}>
              {adapter.label || getAdapterLabel(adapter.type)}
            </span>
            <Badge variant="outline">
              {adapter.source === "external"
                ? t("pages.adaptermanager.external.jsx-text", { defaultValue: "External" })
                : t("pages.adaptermanager.built_in.jsx-text", { defaultValue: "Built-in" })}
            </Badge>
            {adapter.source === "external" && (
              adapter.isLocalPath
                ? <span title={t("pages.adaptermanager.installed_from_local_path.attr_title", { defaultValue: "Installed from local path" })}><FolderOpen className="h-4 w-4 text-amber-500" /></span>
                : <span title={t("pages.adaptermanager.installed_from_npm.attr_title", { defaultValue: "Installed from npm" })}><Package className="h-4 w-4 text-red-500" /></span>
            )}
            {adapter.version && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                v{adapter.version}
              </Badge>
            )}
            {adapter.overriddenBuiltin && (
              <Badge variant="secondary" className="text-blue-600 border-blue-400">
                {t("pages.adaptermanager.overrides_built_in.jsx-text", { defaultValue: "\n                Overrides built-in\n              " })}</Badge>
            )}
            {overriddenBy && (
              <Badge variant="secondary" className="text-blue-600 border-blue-400">
                {t("pages.adaptermanager.overridden_by.jsx-text", { defaultValue: "\n                Overridden by " })}{overriddenBy}
              </Badge>
            )}
            {adapter.disabled && (
              <Badge variant="secondary" className="text-amber-600 border-amber-400">
                {disabledBadgeLabel ?? t("pages.adaptermanager.hidden_from_menus.jsx-text", { defaultValue: "Hidden from menus" })}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {adapter.type}
            {adapter.packageName && adapter.packageName !== adapter.type && (
              <> · {adapter.packageName}</>
            )}
            {t("pages.adaptermanager..jsx-expr", { defaultValue: " · " })}{adapter.modelsCount} {t("pages.adaptermanager.models.jsx-text", { defaultValue: " models\n          " })}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onReinstall && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8"
              title={t("pages.adaptermanager.reinstall_adapter_pull_latest_fr.attr_title", { defaultValue: "Reinstall adapter (pull latest from npm)" })}
              disabled={isReinstalling}
              onClick={() => onReinstall(adapter.type)}
            >
              <Download className={cn("h-4 w-4", isReinstalling && "animate-bounce")} />
            </Button>
          )}
          {onReload && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8"
              title={t("pages.adaptermanager.reload_adapter_hot_swap.attr_title", { defaultValue: "Reload adapter (hot-swap)" })}
              disabled={isReloading}
              onClick={() => onReload(adapter.type)}
            >
              <RefreshCw className={cn("h-4 w-4", isReloading && "animate-spin")} />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 w-8"
            title={adapter.disabled
              ? (toggleTitleEnabled ?? t("pages.adaptermanager.show_in_agent_menus.attr_title", { defaultValue: "Show in agent menus" }))
              : (toggleTitleDisabled ?? t("pages.adaptermanager.hide_from_agent_menus.attr_title", { defaultValue: "Hide from agent menus" }))}
            disabled={isToggling}
            onClick={() => onToggle(adapter.type, !adapter.disabled)}
          >
            <Power className={cn("h-4 w-4", !adapter.disabled ? "text-green-600" : "text-muted-foreground")} />
          </Button>
          {canRemove && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8 text-destructive hover:text-destructive"
              title={t("pages.adaptermanager.remove_adapter.attr_title", { defaultValue: "Remove adapter" })}
              onClick={() => onRemove(adapter.type)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function fetchNpmLatestVersion(packageName: string): Promise<string | null> {
  return fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => res.json())
    .then((data) => (typeof data?.version === "string" ? (data.version as string) : null))
    .catch(() => null);
}

function ReinstallDialog({
  adapter,
  open,
  isReinstalling,
  onConfirm,
  onCancel,
}: {
  adapter: AdapterInfo | null;
  open: boolean;
  isReinstalling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const { data: latestVersion, isLoading: isFetchingVersion } = useQuery({
    queryKey: ["npm-latest-version", adapter?.packageName],
    queryFn: () => {
      if (!adapter?.packageName) return null;
      return fetchNpmLatestVersion(adapter.packageName);
    },
    enabled: open && !!adapter?.packageName,
    staleTime: 60_000,
  });

  const isUpToDate = adapter?.version && latestVersion && adapter.version === latestVersion;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pages.adaptermanager.reinstall_adapter.jsx-text", { defaultValue: "Reinstall Adapter" })}</DialogTitle>
          <DialogDescription>
            {t("pages.adaptermanager.this_will_pull_the_latest_versio.jsx-text", { defaultValue: "\n            This will pull the latest version of" })}{" "}
            <strong>{adapter?.packageName}</strong> {t("pages.adaptermanager.from_npm_and_hot_swap_the_runnin.jsx-text", { defaultValue: " from npm and hot-swap the running adapter module. Existing agents will use the new version on their next run.\n          " })}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("pages.adaptermanager.package.jsx-text", { defaultValue: "Package" })}</span>
            <span className="font-mono">{adapter?.packageName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("pages.adaptermanager.current.jsx-text", { defaultValue: "Current" })}</span>
            <span className="font-mono">
              {adapter?.version ? `v${adapter.version}` : t("pages.adaptermanager.unknown.jsx-text", { defaultValue: "unknown" })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("pages.adaptermanager.latest_on_npm.jsx-text", { defaultValue: "Latest on npm" })}</span>
            <span className="font-mono">
              {isFetchingVersion
                ? t("pages.adaptermanager.checking.jsx-text", { defaultValue: "checking..." })
                : latestVersion
                  ? `v${latestVersion}`
                  : t("pages.adaptermanager.unavailable.jsx-text", { defaultValue: "unavailable" })}
            </span>
          </div>
          {isUpToDate && (
            <p className="text-xs text-muted-foreground pt-1">
              {t("pages.adaptermanager.already_on_the_latest_version.jsx-text", { defaultValue: "\n              Already on the latest version.\n            " })}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isReinstalling}>
            {t("pages.adaptermanager.cancel.jsx-text", { defaultValue: "\n            Cancel\n          " })}</Button>
          <Button disabled={isReinstalling} onClick={onConfirm}>
            {isReinstalling
              ? t("pages.adaptermanager.reinstalling.jsx-text", { defaultValue: "Reinstalling..." })
              : t("pages.adaptermanager.reinstall.jsx-text", { defaultValue: "Reinstall" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdapterManager() {
  const { t } = useTranslation();

  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const [installPackage, setInstallPackage] = useState("");
  const [installVersion, setInstallVersion] = useState("");
  const [isLocalPath, setIsLocalPath] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [removeType, setRemoveType] = useState<string | null>(null);
  const [reinstallTarget, setReinstallTarget] = useState<AdapterInfo | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("pages.adaptermanager.company.breadcrumb", { defaultValue: "Company" }), href: "/dashboard" },
      { label: t("pages.adaptermanager.settings.breadcrumb", { defaultValue: "Settings" }), href: "/instance/settings/general" },
      { label: t("pages.adaptermanager.adapters.breadcrumb", { defaultValue: "Adapters" }) },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const { data: adapters, isLoading } = useQuery({
    queryKey: queryKeys.adapters.all,
    queryFn: () => adaptersApi.list(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all });
  };

  const installMutation = useMutation({
    mutationFn: (params: { packageName: string; version?: string; isLocalPath?: boolean }) =>
      adaptersApi.install(params),
    onSuccess: (result) => {
      invalidate();
      setInstallDialogOpen(false);
      setInstallPackage("");
      setInstallVersion("");
      setIsLocalPath(false);
      pushToast({
        title: t("pages.adaptermanager.adapter_installed.title", { defaultValue: "Adapter installed" }),
        body: t("pages.adaptermanager.adapter_registered.body", {
          defaultValue: "Type \"{{type}}\" registered successfully.{{version}}",
          type: result.type,
          version: result.version ? ` (v${result.version})` : "",
        }),
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: t("pages.adaptermanager.install_failed.title", { defaultValue: "Install failed" }), body: err.message, tone: "error" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (type: string) => adaptersApi.remove(type),
    onSuccess: () => {
      invalidate();
      pushToast({ title: t("pages.adaptermanager.adapter_removed.title", { defaultValue: "Adapter removed" }), tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: t("pages.adaptermanager.removal_failed.title", { defaultValue: "Removal failed" }), body: err.message, tone: "error" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ type, disabled }: { type: string; disabled: boolean }) =>
      adaptersApi.setDisabled(type, disabled),
    onSuccess: () => {
      invalidate();
    },
    onError: (err: Error) => {
      pushToast({ title: t("pages.adaptermanager.toggle_failed.title", { defaultValue: "Toggle failed" }), body: err.message, tone: "error" });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: ({ type, paused }: { type: string; paused: boolean }) =>
      adaptersApi.setOverridePaused(type, paused),
    onSuccess: () => {
      invalidate();
    },
    onError: (err: Error) => {
      pushToast({ title: t("pages.adaptermanager.override_toggle_failed.title", { defaultValue: "Override toggle failed" }), body: err.message, tone: "error" });
    },
  });

  const reloadMutation = useMutation({
    mutationFn: (type: string) => adaptersApi.reload(type),
    onSuccess: (result) => {
      invalidate();
      invalidateDynamicParser(result.type);
      invalidateConfigSchemaCache(result.type);
      pushToast({
        title: t("pages.adaptermanager.adapter_reloaded.title", { defaultValue: "Adapter reloaded" }),
        body: t("pages.adaptermanager.adapter_reloaded.body", {
          defaultValue: "Type \"{{type}}\" reloaded.{{version}}",
          type: result.type,
          version: result.version ? ` (v${result.version})` : "",
        }),
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: t("pages.adaptermanager.reload_failed.title", { defaultValue: "Reload failed" }), body: err.message, tone: "error" });
    },
  });

  const reinstallMutation = useMutation({
    mutationFn: (type: string) => adaptersApi.reinstall(type),
    onSuccess: (result) => {
      invalidate();
      invalidateDynamicParser(result.type);
      invalidateConfigSchemaCache(result.type);
      pushToast({
        title: t("pages.adaptermanager.adapter_reinstalled.title", { defaultValue: "Adapter reinstalled" }),
        body: t("pages.adaptermanager.adapter_reinstalled.body", {
          defaultValue: "Type \"{{type}}\" updated from npm.{{version}}",
          type: result.type,
          version: result.version ? ` (v${result.version})` : "",
        }),
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: t("pages.adaptermanager.reinstall_failed.title", { defaultValue: "Reinstall failed" }), body: err.message, tone: "error" });
    },
  });

  const builtinAdapters = (adapters ?? []).filter((a) => a.source === "builtin");
  const externalAdapters = (adapters ?? []).filter((a) => a.source === "external");

  // External adapters that override a builtin type.  The server only returns
  // one entry per type (the external), so we synthesize a builtin row for
  // the builtins section so users can see which builtins are affected.
  const overriddenBuiltins = (adapters ?? [])
    .filter((a) => a.source === "external" && a.overriddenBuiltin)
    .filter((a) => !builtinAdapters.some((b) => b.type === a.type))
    .map((a) => ({
      type: a.type,
      label: getAdapterLabel(a.type),
      overriddenBy: [
        a.packageName,
        a.version ? `v${a.version}` : undefined,
      ].filter(Boolean).join(" "),
      overridePaused: !!a.overridePaused,
      menuDisabled: !!a.disabled,
    }));

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("pages.adaptermanager.loading_adapters.jsx-text", { defaultValue: "Loading adapters..." })}</div>;

  const isMutating = installMutation.isPending || removeMutation.isPending || toggleMutation.isPending || overrideMutation.isPending || reloadMutation.isPending || reinstallMutation.isPending;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{t("pages.adaptermanager.adapters.jsx-text", { defaultValue: "Adapters" })}</h1>
          <Badge variant="outline" className="text-amber-600 border-amber-400">
            {t("pages.adaptermanager.alpha.jsx-text", { defaultValue: "\n            Alpha\n          " })}</Badge>
        </div>

        <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              {t("pages.adaptermanager.install_adapter.jsx-text", { defaultValue: "\n              Install Adapter\n            " })}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("pages.adaptermanager.install_external_adapter.jsx-text", { defaultValue: "Install External Adapter" })}</DialogTitle>
              <DialogDescription>
                {t("pages.adaptermanager.add_an_adapter_from_npm_or_a_loc.jsx-text", { defaultValue: "\n                Add an adapter from npm or a local path. The adapter package must export " })}<code className="text-xs bg-muted px-1 py-0.5 rounded">{t("pages.adaptermanager.createserveradapter.jsx-text", { defaultValue: "createServerAdapter()" })}</code>.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Source toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    !isLocalPath
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  onClick={() => setIsLocalPath(false)}
                >
                  <Package className="h-3.5 w-3.5" />
                  {t("pages.adaptermanager.npm_package.jsx-text", { defaultValue: "\n                  npm package\n                " })}</button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    isLocalPath
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  onClick={() => setIsLocalPath(true)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t("pages.adaptermanager.local_path.jsx-text", { defaultValue: "\n                  Local path\n                " })}</button>
              </div>

              {isLocalPath ? (
                /* Local path input */
                <div className="grid gap-2">
                  <Label htmlFor="adapterLocalPath">{t("pages.adaptermanager.path_to_adapter_package.jsx-text", { defaultValue: "Path to adapter package" })}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="adapterLocalPath"
                      className="flex-1 font-mono text-xs"
                      placeholder="/mnt/e/Projects/my-adapter  or  E:\Projects\my-adapter"
                      value={installPackage}
                      onChange={(e) => setInstallPackage(e.target.value)}
                    />
                    <ChoosePathButton />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("pages.adaptermanager.accepts_linux_wsl_and_windows_pa.jsx-text", { defaultValue: "\n                    Accepts Linux, WSL, and Windows paths. Windows paths are auto-converted.\n                  " })}</p>
                </div>
              ) : (
                /* npm package input */
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="adapterPackageName">{t("pages.adaptermanager.package_name.jsx-text", { defaultValue: "Package Name" })}</Label>
                    <Input
                      id="adapterPackageName"
                      placeholder={t("pages.adaptermanager.my_paperclip_adapter.attr_placeholder", { defaultValue: "my-paperclip-adapter" })}
                      value={installPackage}
                      onChange={(e) => setInstallPackage(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adapterVersion">{t("pages.adaptermanager.version_optional.jsx-text", { defaultValue: "Version (optional)" })}</Label>
                    <Input
                      id="adapterVersion"
                      placeholder={t("pages.adaptermanager.latest.attr_placeholder", { defaultValue: "latest" })}
                      value={installVersion}
                      onChange={(e) => setInstallVersion(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>{t("pages.adaptermanager.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
              <Button
                onClick={() =>
                  installMutation.mutate({
                    packageName: installPackage,
                    version: installVersion || undefined,
                    isLocalPath,
                  })
                }
                disabled={!installPackage || installMutation.isPending}
              >
                {installMutation.isPending
                  ? t("pages.adaptermanager.installing.jsx-text", { defaultValue: "Installing..." })
                  : t("pages.adaptermanager.install.jsx-text", { defaultValue: "Install" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Alpha notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{t("pages.adaptermanager.external_adapters_are_alpha.jsx-text", { defaultValue: "External adapters are alpha." })}</p>
            <p className="text-muted-foreground">
              {t("pages.adaptermanager.the_adapter_plugin_system_is_und.jsx-text", { defaultValue: "\n              The adapter plugin system is under active development. APIs and storage format may change. Use the power icon to hide adapters from agent menus without removing them.\n            " })}</p>
          </div>
        </div>
      </div>

      {/* External adapters */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("pages.adaptermanager.external_adapters.jsx-text", { defaultValue: "External Adapters" })}</h2>
        </div>

        {externalAdapters.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Cpu className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">{t("pages.adaptermanager.no_external_adapters_installed.jsx-text", { defaultValue: "No external adapters installed" })}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("pages.adaptermanager.install_an_adapter_package_to_ex.jsx-text", { defaultValue: "\n                Install an adapter package to extend model support.\n              " })}</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {externalAdapters.map((adapter) => {
              const isBuiltinOverride = adapter.overriddenBuiltin;
              const overridePaused = isBuiltinOverride && !!adapter.overridePaused;

              // For overridden builtins, the power button controls the
              // override pause state (not server menu visibility).
              const effectiveAdapter: AdapterInfo = isBuiltinOverride
                ? { ...adapter, disabled: overridePaused ?? false }
                : adapter;

              return (
                <AdapterRow
                  key={adapter.type}
                  adapter={effectiveAdapter}
                  canRemove={true}
                  onToggle={
                    isBuiltinOverride
                      ? (type, disabled) => overrideMutation.mutate({ type, paused: disabled })
                      : (type, disabled) => toggleMutation.mutate({ type, disabled })
                  }
                  onRemove={(type) => setRemoveType(type)}
                  onReload={(type) => reloadMutation.mutate(type)}
                  onReinstall={!adapter.isLocalPath ? (type) => setReinstallTarget(adapter) : undefined}
                  isToggling={isBuiltinOverride ? overrideMutation.isPending : toggleMutation.isPending}
                  isReloading={reloadMutation.isPending}
                  isReinstalling={reinstallMutation.isPending}
                  toggleTitleDisabled={isBuiltinOverride ? t("pages.adaptermanager.pause_external_override.attr_title", { defaultValue: "Pause external override" }) : undefined}
                  toggleTitleEnabled={isBuiltinOverride ? t("pages.adaptermanager.resume_external_override.attr_title", { defaultValue: "Resume external override" }) : undefined}
                  disabledBadgeLabel={isBuiltinOverride ? t("pages.adaptermanager.override_paused.jsx-text", { defaultValue: "Override paused" }) : undefined}
                />
              );
            })}
          </ul>
        )}
      </section>

      {/* Built-in adapters */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("pages.adaptermanager.built_in_adapters.jsx-text", { defaultValue: "Built-in Adapters" })}</h2>
        </div>

        {builtinAdapters.length === 0 && overriddenBuiltins.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("pages.adaptermanager.no_built_in_adapters_found.jsx-text", { defaultValue: "No built-in adapters found." })}</div>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {builtinAdapters.map((adapter) => (
              <AdapterRow
                key={adapter.type}
                adapter={adapter}
                canRemove={false}
                onToggle={(type, disabled) => toggleMutation.mutate({ type, disabled })}
                onRemove={() => {}}
                isToggling={isMutating}
              />
            ))}
            {overriddenBuiltins.map((virtual) => (
              <AdapterRow
                key={virtual.type}
                adapter={{
                  type: virtual.type,
                  label: virtual.label,
                  source: "builtin",
                  modelsCount: 0,
                  loaded: true,
                  disabled: virtual.menuDisabled,
                  capabilities: {
                    supportsInstructionsBundle: false,
                    supportsSkills: false,
                    supportsLocalAgentJwt: false,
                    requiresMaterializedRuntimeSkills: false,
                    supportsModelProfiles: false,
                  },
                }}
                canRemove={false}
                onToggle={(type, disabled) => toggleMutation.mutate({ type, disabled })}
                onRemove={() => {}}
                isToggling={isMutating}
                overriddenBy={virtual.overridePaused ? undefined : virtual.overriddenBy}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Remove confirmation */}
      <Dialog
        open={removeType !== null}
        onOpenChange={(open) => { if (!open) setRemoveType(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages.adaptermanager.remove_adapter.jsx-text", { defaultValue: "Remove Adapter" })}</DialogTitle>
            <DialogDescription>
              {t("pages.adaptermanager.are_you_sure_you_want_to_remove_.jsx-text", { defaultValue: "\n              Are you sure you want to remove the " })}<strong>{removeType}</strong> {t("pages.adaptermanager.adapter_it_will_be_unregistered_.jsx-text", { defaultValue: " adapter? It will be unregistered and removed from the adapter store.\n              " })}{removeType && adapters?.find((a) => a.type === removeType)?.packageName && (
                <> {t("pages.adaptermanager.npm_packages_will_be_cleaned_up_.jsx-text", { defaultValue: " npm packages will be cleaned up from disk." })}</>
              )}
              {" "}{t("pages.adaptermanager.this_action_cannot_be_undone.jsx-text", { defaultValue: "This action cannot be undone.\n            " })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveType(null)}>{t("pages.adaptermanager.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (removeType) {
                  removeMutation.mutate(removeType, {
                    onSettled: () => setRemoveType(null),
                  });
                }
              }}
            >
              {removeMutation.isPending
                ? t("pages.adaptermanager.removing.jsx-text", { defaultValue: "Removing..." })
                : t("pages.adaptermanager.remove.jsx-text", { defaultValue: "Remove" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Reinstall confirmation */}
      <ReinstallDialog
        adapter={reinstallTarget}
        open={reinstallTarget !== null}
        isReinstalling={reinstallMutation.isPending}
        onConfirm={() => {
          if (reinstallTarget) {
            reinstallMutation.mutate(reinstallTarget.type, {
              onSettled: () => setReinstallTarget(null),
            });
          }
        }}
        onCancel={() => setReinstallTarget(null)}
      />
    </div>
  );
}
