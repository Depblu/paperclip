import { useEffect, useMemo, useState } from "react";
import { t as translate, useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArchiveRestore,
  Archive,
  Ban,
  CheckCircle2,
  Cloud,
  Database,
  Edit3,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Filter,
  Info,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  CompanySecret,
  CompanySecretUsageBinding,
  CompanySecretProviderConfig,
  SecretProviderConfigDiscoveryCandidate,
  SecretProviderConfigDiscoveryPreviewResult,
  SecretAccessEvent,
  SecretManagedMode,
  SecretProvider,
  SecretProviderConfigStatus,
  SecretProviderDescriptor,
  SecretStatus,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import {
  secretsApi,
  type CreateSecretInput,
  type CreateSecretProviderConfigInput,
  type SecretProviderHealthResponse,
  type UpdateSecretProviderConfigInput,
} from "../api/secrets";
import { ApiError } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { ImportFromVaultDialog } from "./secrets/ImportFromVaultDialog";

type CreateMode = "managed" | "external";
type SecretsTab = "secrets" | "vaults";

type ProviderVaultForm = {
  provider: SecretProvider;
  displayName: string;
  status: SecretProviderConfigStatus;
  isDefault: boolean;
  backupReminderAcknowledged: boolean;
  region: string;
  namespace: string;
  secretNamePrefix: string;
  kmsKeyId: string;
  ownerTag: string;
  environmentTag: string;
  projectId: string;
  location: string;
  address: string;
  mountPath: string;
  secretPathPrefix: string;
};

type TranslateFn = typeof translate;

const PROVIDER_ORDER: SecretProvider[] = [
  "local_encrypted",
  "aws_secrets_manager",
  "gcp_secret_manager",
  "vault",
];

function defaultProviderVaultStatus(provider: SecretProvider): SecretProviderConfigStatus {
  return provider === "gcp_secret_manager" || provider === "vault" ? "coming_soon" : "ready";
}

function emptyProviderVaultForm(provider: SecretProvider = "local_encrypted"): ProviderVaultForm {
  return {
    provider,
    displayName: "",
    status: defaultProviderVaultStatus(provider),
    isDefault: false,
    backupReminderAcknowledged: false,
    region: "",
    namespace: "",
    secretNamePrefix: "",
    kmsKeyId: "",
    ownerTag: "",
    environmentTag: "",
    projectId: "",
    location: "",
    address: "",
    mountPath: "",
    secretPathPrefix: "",
  };
}

function providerConfigValue(config: CompanySecretProviderConfig["config"], key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "";
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function providerVaultFormFromConfig(config: CompanySecretProviderConfig): ProviderVaultForm {
  return {
    ...emptyProviderVaultForm(config.provider),
    displayName: config.displayName,
    status: config.status,
    isDefault: config.isDefault,
    backupReminderAcknowledged:
      Boolean((config.config as Record<string, unknown> | undefined)?.backupReminderAcknowledged),
    region: providerConfigValue(config.config, "region"),
    namespace: providerConfigValue(config.config, "namespace"),
    secretNamePrefix: providerConfigValue(config.config, "secretNamePrefix"),
    kmsKeyId: providerConfigValue(config.config, "kmsKeyId"),
    ownerTag: providerConfigValue(config.config, "ownerTag"),
    environmentTag: providerConfigValue(config.config, "environmentTag"),
    projectId: providerConfigValue(config.config, "projectId"),
    location: providerConfigValue(config.config, "location"),
    address: providerConfigValue(config.config, "address"),
    mountPath: providerConfigValue(config.config, "mountPath"),
    secretPathPrefix: providerConfigValue(config.config, "secretPathPrefix"),
  };
}

function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return date.toLocaleString();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function statusTextTone(status: SecretStatus) {
  switch (status) {
    case "active":
      return "text-emerald-700 dark:text-emerald-300";
    case "disabled":
      return "text-amber-700 dark:text-amber-300";
    case "archived":
      return "text-muted-foreground";
    case "deleted":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function providerLabel(providers: SecretProviderDescriptor[] | undefined, id: SecretProvider) {
  return providers?.find((p) => p.id === id)?.label ?? id.replaceAll("_", " ");
}

function normalizeSecretKeyForPreview(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}


function modeLabel(managedMode: SecretManagedMode, t: TranslateFn = translate) {
  return managedMode === "paperclip_managed"
    ? t("pages.secrets.paperclip_managed.mode_label", { defaultValue: "Paperclip-managed" })
    : t("pages.secrets.linked_external.mode_label", { defaultValue: "Linked external" });
}

function modeDescription(managedMode: SecretManagedMode, t: TranslateFn = translate) {
  return managedMode === "paperclip_managed"
    ? t("pages.secrets.paperclip_owns_create_and_rot.text", { defaultValue: "Paperclip owns create and rotation writes for this provider secret." })
    : t("pages.secrets.paperclip_resolves_this_pro.text", { defaultValue: "Paperclip resolves this provider reference but does not rotate the provider value." });
}

function healthEntryForProvider(
  health: SecretProviderHealthResponse | null,
  providerId: SecretProvider,
) {
  return health?.providers.find((entry) => entry.provider === providerId) ?? null;
}

export function getCreateProviderBlockReason(
  provider: SecretProviderDescriptor | null | undefined,
  mode: CreateMode,
  health: SecretProviderHealthResponse | null,
  t: TranslateFn = translate,
) {
  if (!provider) return t("pages.secrets.select_a_provider.block_reason", { defaultValue: "Select a provider." });
  if (mode === "managed" && provider.supportsManagedValues === false) {
    return t("pages.secrets.provider_does_not_support_m.block_reason", {
      defaultValue: "{{provider}} does not support Paperclip-managed secret values.",
      provider: provider.label,
    });
  }
  if (mode === "external" && provider.supportsExternalReferences === false) {
    return t("pages.secrets.provider_does_not_support_l.block_reason", {
      defaultValue: "{{provider}} does not support linked external references.",
      provider: provider.label,
    });
  }
  if (provider.configured === false) {
    const healthEntry = healthEntryForProvider(health, provider.id);
    return healthEntry?.message
      ? t("pages.secrets.provider_is_not_configured_w.block_reason", {
        defaultValue: "{{provider}} is not configured in this deployment. {{message}}",
        provider: provider.label,
        message: healthEntry.message,
      })
      : t("pages.secrets.provider_is_not_configured.block_reason", {
        defaultValue: "{{provider}} is not configured in this deployment.",
        provider: provider.label,
      });
  }
  const healthEntry = healthEntryForProvider(health, provider.id);
  if (healthEntry?.status === "error") {
    return t("pages.secrets.provider_health_check_failed.block_reason", {
      defaultValue: "{{provider}} health check failed: {{message}}",
      provider: provider.label,
      message: healthEntry.message,
    });
  }
  return null;
}

function providerHealthText(
  provider: SecretProviderDescriptor | null | undefined,
  health: SecretProviderHealthResponse | null,
) {
  if (!provider) return null;
  const entry = healthEntryForProvider(health, provider.id);
  if (!entry) return null;
  const warnings = entry.warnings?.join(" ");
  return [entry.message, warnings].filter(Boolean).join(" ");
}

function detailString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getProviderConfigBlockReason(
  config: CompanySecretProviderConfig | null | undefined,
  t: TranslateFn = translate,
) {
  if (!config) return null;
  if (config.status === "disabled") {
    return t("pages.secrets.this_provider_vault_is_dis.block_reason", { defaultValue: "This provider vault is disabled." });
  }
  if (config.status === "coming_soon") {
    return t("pages.secrets.this_provider_vault_is_sav.block_reason", { defaultValue: "This provider vault is saved as draft metadata only." });
  }
  if (config.healthStatus === "error") {
    return config.healthMessage ?? t("pages.secrets.this_provider_vault_health.block_reason", { defaultValue: "This provider vault health check failed." });
  }
  return null;
}

export function getDefaultProviderConfigId(
  configs: CompanySecretProviderConfig[],
  provider: SecretProvider,
) {
  const providerConfigs = configs.filter((config) => config.provider === provider);
  const selectable = providerConfigs.filter((config) => !getProviderConfigBlockReason(config));
  return (
    selectable.find((config) => config.isDefault)?.id ??
    selectable[0]?.id ??
    providerConfigs.find((config) => config.isDefault)?.id ??
    ""
  );
}

function providerVaultLabel(configs: CompanySecretProviderConfig[], id: string | null | undefined, t: TranslateFn) {
  if (!id) return t("pages.secrets.deployment_default.jsx-text", { defaultValue: "Deployment default" });
  return configs.find((config) => config.id === id)?.displayName
    ?? t("pages.secrets.unknown_vault.text", { defaultValue: "Unknown vault" });
}

function buildProviderVaultConfig(form: ProviderVaultForm): Record<string, unknown> {
  const compact = (value: string) => value.trim() || null;
  switch (form.provider) {
    case "local_encrypted":
      return { backupReminderAcknowledged: form.backupReminderAcknowledged };
    case "aws_secrets_manager":
      return {
        region: form.region.trim(),
        namespace: compact(form.namespace),
        secretNamePrefix: compact(form.secretNamePrefix),
        kmsKeyId: compact(form.kmsKeyId),
        ownerTag: compact(form.ownerTag),
        environmentTag: compact(form.environmentTag),
      };
    case "gcp_secret_manager":
      return {
        projectId: compact(form.projectId),
        location: compact(form.location),
        namespace: compact(form.namespace),
        secretNamePrefix: compact(form.secretNamePrefix),
      };
    case "vault":
      return {
        address: compact(form.address),
        namespace: compact(form.namespace),
        mountPath: compact(form.mountPath),
        secretPathPrefix: compact(form.secretPathPrefix),
      };
    default:
      return {};
  }
}

function getAwsProviderVaultDiscoveryQuery(form: ProviderVaultForm): string | null {
  return (
    form.secretNamePrefix.trim() ||
    form.namespace.trim() ||
    form.environmentTag.trim() ||
    form.ownerTag.trim() ||
    null
  );
}

export function getAwsManagedPathPreview(input: {
  provider: SecretProviderDescriptor | null | undefined;
  health: SecretProviderHealthResponse | null;
  companyId: string;
  secretKeySource: string;
}) {
  if (input.provider?.id !== "aws_secrets_manager") return null;
  const healthEntry = healthEntryForProvider(input.health, "aws_secrets_manager");
  const prefix = detailString(healthEntry?.details, "prefix") ?? "paperclip";
  const deploymentId = detailString(healthEntry?.details, "deploymentId") ?? "{deploymentId}";
  const secretKey = normalizeSecretKeyForPreview(input.secretKeySource) || "{secretKey}";
  return `${prefix}/${deploymentId}/${input.companyId}/${secretKey}`;
}

export function Secrets() {
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const [activeTab, setActiveTab] = useState<SecretsTab>("secrets");
  const [secretDetailTab, setSecretDetailTab] = useState("details");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SecretStatus | "all">("active");
  const [providerFilter, setProviderFilter] = useState<SecretProvider | "all">("all");
  const [selectedSecretId, setSelectedSecretId] = useState<string | null>(null);
  const [usageDialogSecretId, setUsageDialogSecretId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("managed");
  const [createForm, setCreateForm] = useState({
    name: "",
    key: "",
    value: "",
    description: "",
    externalRef: "",
    provider: "local_encrypted" as SecretProvider,
    providerConfigId: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateValue, setRotateValue] = useState("");
  const [rotateExternalRef, setRotateExternalRef] = useState("");
  const [rotateProviderConfigId, setRotateProviderConfigId] = useState("");
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CompanySecret | null>(null);
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<CompanySecretProviderConfig | null>(null);
  const [removeVaultConfirm, setRemoveVaultConfirm] = useState<CompanySecretProviderConfig | null>(null);
  const [vaultForm, setVaultForm] = useState<ProviderVaultForm>(() => emptyProviderVaultForm());
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultDiscovery, setVaultDiscovery] =
    useState<SecretProviderConfigDiscoveryPreviewResult | null>(null);
  const [vaultDiscoveryError, setVaultDiscoveryError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("pages.secrets.secrets.breadcrumb", { defaultValue: "Secrets" }) }]);
  }, [setBreadcrumbs, t]);

  const secretsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.list(selectedCompanyId)
      : ["secrets", "__disabled__"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const providersQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.providers(selectedCompanyId)
      : ["secret-providers", "__disabled__"],
    queryFn: () => secretsApi.providers(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    staleTime: 5 * 60_000,
  });

  const providerHealthQuery = useQuery({
    queryKey: selectedCompanyId
      ? ["secret-provider-health", selectedCompanyId]
      : ["secret-provider-health", "__disabled__"],
    queryFn: () => secretsApi.providerHealth(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 60_000,
    retry: false,
  });

  const providerConfigsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.providerConfigs(selectedCompanyId)
      : ["secret-provider-configs", "__disabled__"],
    queryFn: () => secretsApi.providerConfigs(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    retry: false,
  });

  const secrets = secretsQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const providerConfigs = providerConfigsQuery.data ?? [];
  const selectedSecret = useMemo(
    () => secrets.find((secret) => secret.id === selectedSecretId) ?? null,
    [secrets, selectedSecretId],
  );
  const usageDialogSecret = useMemo(
    () => secrets.find((secret) => secret.id === usageDialogSecretId) ?? null,
    [secrets, usageDialogSecretId],
  );
  const selectedCreateProvider = useMemo(
    () => providers.find((provider) => provider.id === createForm.provider) ?? null,
    [providers, createForm.provider],
  );
  const createProviderConfigs = useMemo(
    () => providerConfigs.filter((config) => config.provider === createForm.provider),
    [createForm.provider, providerConfigs],
  );
  const selectedCreateProviderConfig = useMemo(
    () => providerConfigs.find((config) => config.id === createForm.providerConfigId) ?? null,
    [createForm.providerConfigId, providerConfigs],
  );
  const selectedRotateProviderConfigs = useMemo(
    () => providerConfigs.filter((config) => config.provider === selectedSecret?.provider),
    [providerConfigs, selectedSecret?.provider],
  );
  const selectedRotateProviderConfig = useMemo(
    () => providerConfigs.find((config) => config.id === rotateProviderConfigId) ?? null,
    [providerConfigs, rotateProviderConfigId],
  );
  const createProviderBlockReason = getCreateProviderBlockReason(
    selectedCreateProvider,
    createMode,
    providerHealthQuery.data ?? null,
    t,
  ) ?? getProviderConfigBlockReason(selectedCreateProviderConfig, t);
  const rotateProviderBlockReason = getProviderConfigBlockReason(selectedRotateProviderConfig, t);
  const createProviderHealthText = providerHealthText(
    selectedCreateProvider,
    providerHealthQuery.data ?? null,
  );
  const awsManagedPathPreview = getAwsManagedPathPreview({
    provider: selectedCreateProvider,
    health: providerHealthQuery.data ?? null,
    companyId: selectedCompanyId ?? "{companyId}",
    secretKeySource: createForm.key.trim() || createForm.name,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return secrets.filter((secret) => {
      if (statusFilter !== "all" && secret.status !== statusFilter) return false;
      if (providerFilter !== "all" && secret.provider !== providerFilter) return false;
      if (!needle) return true;
      return (
        secret.name.toLowerCase().includes(needle) ||
        secret.key.toLowerCase().includes(needle) ||
        (secret.description?.toLowerCase().includes(needle) ?? false) ||
        (secret.externalRef?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [secrets, search, statusFilter, providerFilter]);
  const activeSecretFilterCount = (statusFilter === "active" ? 0 : 1) + (providerFilter === "all" ? 0 : 1);

  const usageQuery = useQuery({
    queryKey: selectedSecret ? queryKeys.secrets.usage(selectedSecret.id) : ["secrets", "usage", "__disabled__"],
    queryFn: () => secretsApi.usage(selectedSecret!.id),
    enabled: Boolean(selectedSecret),
  });
  const eventsQuery = useQuery({
    queryKey: selectedSecret
      ? queryKeys.secrets.accessEvents(selectedSecret.id)
      : ["secrets", "access-events", "__disabled__"],
    queryFn: () => secretsApi.accessEvents(selectedSecret!.id),
    enabled: Boolean(selectedSecret),
  });

  const usageDialogQuery = useQuery({
    queryKey: usageDialogSecret
      ? queryKeys.secrets.usage(usageDialogSecret.id)
      : ["secrets", "usage-dialog", "__disabled__"],
    queryFn: () => secretsApi.usage(usageDialogSecret!.id),
    enabled: Boolean(usageDialogSecret),
  });

  function invalidateAll(extraIds: string[] = []) {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.providerConfigs(selectedCompanyId) });
    for (const id of extraIds) {
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.usage(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.accessEvents(id) });
    }
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const input: CreateSecretInput = {
        name: createForm.name.trim(),
        provider: createForm.provider,
        providerConfigId: createForm.providerConfigId || null,
        managedMode: createMode === "external" ? "external_reference" : "paperclip_managed",
        description: createForm.description.trim() || null,
      };
      if (createForm.key.trim()) input.key = createForm.key.trim();
      if (createMode === "managed") {
        input.value = createForm.value;
      } else {
        input.externalRef = createForm.externalRef.trim();
      }
      return secretsApi.create(selectedCompanyId!, input);
    },
    onSuccess: (created) => {
      pushToast({ title: t("pages.secrets.secret_created.title", { defaultValue: "Secret created" }), body: created.name, tone: "success" });
      setCreateOpen(false);
      setCreateForm({
        name: "",
        key: "",
        value: "",
        description: "",
        externalRef: "",
        provider: createForm.provider,
        providerConfigId: getDefaultProviderConfigId(providerConfigs, createForm.provider),
      });
      setCreateError(null);
      setSelectedSecretId(created.id);
      invalidateAll([created.id]);
    },
    onError: (error) => {
      setCreateError(error instanceof ApiError ? error.message : (error as Error).message);
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => {
      if (!selectedSecret) throw new Error(t("pages.secrets.select_a_secret_first.error", { defaultValue: "Select a secret first" }));
      if (selectedSecret.managedMode === "external_reference") {
        return secretsApi.rotate(selectedSecret.id, {
          externalRef: rotateExternalRef.trim() || selectedSecret.externalRef || undefined,
          providerConfigId: rotateProviderConfigId || null,
        });
      }
      return secretsApi.rotate(selectedSecret.id, {
        value: rotateValue,
        providerConfigId: rotateProviderConfigId || null,
      });
    },
    onSuccess: (updated) => {
      pushToast({
        title: t("pages.secrets.rotated.title", { defaultValue: "Rotated" }),
        body: t("pages.secrets.secret_rotated.body", {
          defaultValue: "{{name}} → v{{version}}",
          name: updated.name,
          version: updated.latestVersion,
        }),
        tone: "success",
      });
      setRotateOpen(false);
      setRotateValue("");
      setRotateExternalRef("");
      setRotateProviderConfigId("");
      setRotateError(null);
      invalidateAll([updated.id]);
    },
    onError: (error) => {
      setRotateError(error instanceof Error ? error.message : t("pages.secrets.rotate_failed.error", { defaultValue: "Rotate failed" }));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SecretStatus }) => {
      switch (status) {
        case "active":
          return secretsApi.enable(id);
        case "disabled":
          return secretsApi.disable(id);
        case "archived":
          return secretsApi.archive(id);
        default:
          return secretsApi.update(id, { status });
      }
    },
    onSuccess: (updated) => {
      pushToast({
        title: t("pages.secrets.secret_status_updated.title", {
          defaultValue: "Secret {{status}}",
          status: updated.status,
        }),
        body: updated.name,
        tone: "info",
      });
      invalidateAll([updated.id]);
    },
    onError: (error) => {
      pushToast({
        title: t("pages.secrets.status_update_failed.title", { defaultValue: "Status update failed" }),
        body: error instanceof Error ? error.message : t("pages.secrets.try_again.error", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: (_response, id) => {
      pushToast({ title: t("pages.secrets.secret_deleted.title", { defaultValue: "Secret deleted" }), tone: "info" });
      setDeleteConfirm(null);
      if (selectedSecretId === id) setSelectedSecretId(null);
      invalidateAll([id]);
    },
    onError: (error) => {
      pushToast({
        title: t("pages.secrets.delete_failed.title", { defaultValue: "Delete failed" }),
        body: error instanceof Error ? error.message : t("pages.secrets.try_again.error", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const saveVaultMutation = useMutation({
    mutationFn: () => {
      const data: CreateSecretProviderConfigInput | UpdateSecretProviderConfigInput = {
        displayName: vaultForm.displayName.trim(),
        status: vaultForm.status,
        isDefault: vaultForm.isDefault,
        config: buildProviderVaultConfig(vaultForm),
      };
      if (editingVault) {
        return secretsApi.updateProviderConfig(editingVault.id, data);
      }
      return secretsApi.createProviderConfig(selectedCompanyId!, {
        ...(data as UpdateSecretProviderConfigInput),
        provider: vaultForm.provider,
      } as CreateSecretProviderConfigInput);
    },
    onSuccess: (saved) => {
      pushToast({
        title: editingVault
          ? t("pages.secrets.provider_vault_updated.title", { defaultValue: "Provider vault updated" })
          : t("pages.secrets.provider_vault_created.title", { defaultValue: "Provider vault created" }),
        body: saved.displayName,
        tone: "success",
      });
      setVaultDialogOpen(false);
      setEditingVault(null);
      setVaultForm(emptyProviderVaultForm());
      setVaultError(null);
      invalidateAll();
    },
    onError: (error) => {
      setVaultError(error instanceof ApiError ? error.message : (error as Error).message);
    },
  });

  const discoverVaultMutation = useMutation({
    mutationFn: () =>
      secretsApi.providerConfigDiscoveryPreview(selectedCompanyId!, {
        provider: "aws_secrets_manager",
        config: buildProviderVaultConfig(vaultForm),
        query: getAwsProviderVaultDiscoveryQuery(vaultForm),
        pageSize: 25,
      }),
    onSuccess: (preview) => {
      setVaultDiscovery(preview);
      setVaultDiscoveryError(null);
    },
    onError: (error) => {
      setVaultDiscovery(null);
      setVaultDiscoveryError(error instanceof ApiError ? error.message : (error as Error).message);
    },
  });

  const disableVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.disableProviderConfig(id),
    onSuccess: (updated) => {
      pushToast({ title: t("pages.secrets.provider_vault_disabled.title", { defaultValue: "Provider vault disabled" }), body: updated.displayName, tone: "info" });
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("pages.secrets.disable_failed.title", { defaultValue: "Disable failed" }),
        body: error instanceof Error ? error.message : t("pages.secrets.try_again.error", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const removeVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.removeProviderConfig(id),
    onSuccess: (removed) => {
      pushToast({
        title: t("pages.secrets.provider_vault_removed.title", { defaultValue: "Provider vault removed" }),
        body: t("pages.secrets.provider_vault_removed.body", {
          defaultValue: "{{name}} was removed from Paperclip only.",
          name: removed.displayName,
        }),
        tone: "info",
      });
      setRemoveVaultConfirm(null);
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("pages.secrets.remove_failed.title", { defaultValue: "Remove failed" }),
        body: error instanceof Error ? error.message : t("pages.secrets.try_again.error", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const defaultVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.setDefaultProviderConfig(id),
    onSuccess: (updated) => {
      pushToast({ title: t("pages.secrets.default_vault_set.title", { defaultValue: "Default vault set" }), body: updated.displayName, tone: "success" });
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("pages.secrets.default_update_failed.title", { defaultValue: "Default update failed" }),
        body: error instanceof Error ? error.message : t("pages.secrets.try_again.error", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const healthVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.checkProviderConfigHealth(id),
    onSuccess: (health) => {
      pushToast({ title: t("pages.secrets.health_checked.title", { defaultValue: "Health checked" }), body: health.message, tone: health.status === "error" ? "error" : "info" });
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("pages.secrets.health_check_failed.title", { defaultValue: "Health check failed" }),
        body: error instanceof Error ? error.message : t("pages.secrets.try_again.error", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (!createOpen || providers.length === 0) return;
    const currentBlockReason = getCreateProviderBlockReason(
      providers.find((provider) => provider.id === createForm.provider) ?? null,
      createMode,
      providerHealthQuery.data ?? null,
      t,
    );
    if (!currentBlockReason) return;
    const replacement = providers.find(
      (provider) =>
        !getCreateProviderBlockReason(provider, createMode, providerHealthQuery.data ?? null, t),
    );
    if (replacement && replacement.id !== createForm.provider) {
      setCreateForm((current) => ({
        ...current,
        provider: replacement.id,
        providerConfigId: getDefaultProviderConfigId(providerConfigs, replacement.id),
      }));
    }
  }, [createForm.provider, createMode, createOpen, providerConfigs, providerHealthQuery.data, providers, t]);

  useEffect(() => {
    if (!createOpen) return;
    const current = providerConfigs.find((config) => config.id === createForm.providerConfigId);
    if (current?.provider === createForm.provider) return;
    setCreateForm((form) => ({
      ...form,
      providerConfigId: getDefaultProviderConfigId(providerConfigs, form.provider),
    }));
  }, [createForm.provider, createForm.providerConfigId, createOpen, providerConfigs]);

  useEffect(() => {
    if (!rotateOpen || !selectedSecret) return;
    setRotateProviderConfigId(
      selectedSecret.providerConfigId ?? getDefaultProviderConfigId(providerConfigs, selectedSecret.provider),
    );
  }, [providerConfigs, rotateOpen, selectedSecret]);

  function openCreateVault(provider: SecretProvider = "local_encrypted") {
    setEditingVault(null);
    setVaultForm(emptyProviderVaultForm(provider));
    setVaultError(null);
    setVaultDiscovery(null);
    setVaultDiscoveryError(null);
    setVaultDialogOpen(true);
  }

  function openEditVault(config: CompanySecretProviderConfig) {
    setEditingVault(config);
    setVaultForm(providerVaultFormFromConfig(config));
    setVaultError(null);
    setVaultDiscovery(null);
    setVaultDiscoveryError(null);
    setVaultDialogOpen(true);
  }

  function applyVaultDiscoveryCandidate(candidate: SecretProviderConfigDiscoveryCandidate) {
    if (candidate.provider !== "aws_secrets_manager") return;
    const config = candidate.config as Record<string, unknown>;
    setVaultForm((current) => ({
      ...current,
      displayName: current.displayName.trim() ? current.displayName : candidate.displayName,
      region: providerConfigValue(config, "region"),
      namespace: providerConfigValue(config, "namespace"),
      secretNamePrefix: providerConfigValue(config, "secretNamePrefix"),
      kmsKeyId: providerConfigValue(config, "kmsKeyId"),
      ownerTag: providerConfigValue(config, "ownerTag"),
      environmentTag: providerConfigValue(config, "environmentTag"),
    }));
  }

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t("pages.secrets.select_a_company_to_manage_secre.jsx-text", { defaultValue: "Select a company to manage secrets." })}</div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("pages.secrets.secrets.jsx-text", { defaultValue: "Secrets" })}</h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SecretsTab)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <PageTabBar
          items={[
            { value: "secrets", label: t("pages.secrets.secrets.tab_label", { defaultValue: "Secrets" }) },
            { value: "vaults", label: t("pages.secrets.provider_vaults.tab_label", { defaultValue: "Provider vaults" }) },
          ]}
          align="start"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SecretsTab)}
        />

        <TabsContent value="secrets" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <SecretsHowToUse />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-64 md:w-80">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("pages.secrets.search_by_name_key_ref.attr_placeholder", { defaultValue: "Search by name, key, ref" })}
                className="pl-7 text-xs sm:text-sm"
                aria-label={t("pages.secrets.search_secrets.attr_aria-label", { defaultValue: "Search secrets" })}
                data-page-search-target="true"
              />
            </div>
            <SecretsFiltersPopover
              statusFilter={statusFilter}
              providerFilter={providerFilter}
              providers={providers}
              activeFilterCount={activeSecretFilterCount}
              onStatusChange={setStatusFilter}
              onProviderChange={setProviderFilter}
            />
            <ImportFromVaultButton
              providerConfigs={providerConfigs}
              onClick={() => setImportOpen(true)}
              onManageVaults={() => setActiveTab("vaults")}
              className="ml-auto"
            />
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.new_secret.jsx-text", { defaultValue: " New secret\n            " })}</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {secretsQuery.isError ? (
              <div className="text-sm text-destructive flex items-center gap-2 py-4">
                <AlertCircle className="h-4 w-4" /> {t("pages.secrets.failed_to_load_secrets.jsx-text", { defaultValue: " Failed to load secrets:" })}{" "}
                {(secretsQuery.error as Error).message}
                <Button variant="ghost" size="sm" onClick={() => secretsQuery.refetch()}>
                  {t("pages.secrets.retry.jsx-text", { defaultValue: "\n                  Retry\n                " })}</Button>
              </div>
            ) : secrets.length === 0 && !secretsQuery.isPending ? (
              <EmptyState
                icon={KeyRound}
                message={t("pages.secrets.no_secrets_yet_create_first.attr_message", { defaultValue: "No secrets yet. Create your first managed secret or link an external reference." })}
                action={t("pages.secrets.new_secret.action", { defaultValue: "New secret" })}
                onAction={() => setCreateOpen(true)}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                message={t("pages.secrets.no_secrets_match_filters.attr_message", { defaultValue: "No secrets match your filters." })}
              />
            ) : (
              <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("pages.secrets.name.table_header", { defaultValue: "Name" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.mode.jsx-text", { defaultValue: "Mode" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.provider.jsx-text", { defaultValue: "Provider" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.status.jsx-text", { defaultValue: "Status" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.version.jsx-text", { defaultValue: "Version" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.last_rotated.jsx-text", { defaultValue: "Last rotated" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.last_resolved.jsx-text", { defaultValue: "Last resolved" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.references.jsx-text", { defaultValue: "References" })}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("pages.secrets.reference.jsx-text", { defaultValue: "Reference" })}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((secret) => (
                  <tr
                    key={secret.id}
                    className={cn(
                      "border-b border-border/60 hover:bg-accent/40 cursor-pointer",
                      selectedSecretId === secret.id && "bg-accent/60",
                    )}
                    onClick={() => setSelectedSecretId(secret.id)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{secret.name}</div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {modeLabel(secret.managedMode, t)}
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      <div>{providerLabel(providers, secret.provider)}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={cn("text-xs font-medium", statusTextTone(secret.status))}>
                        {secret.status}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-xs font-mono">v{secret.latestVersion}</td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {formatRelative(secret.lastRotatedAt)}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {formatRelative(secret.lastResolvedAt)}
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        aria-label={`View references for ${secret.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setUsageDialogSecretId(secret.id);
                        }}
                      >
                        {secret.referenceCount ?? 0}
                      </Button>
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      {secret.managedMode === "external_reference" ? (
                        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                          <Link2 className="h-3 w-3" />
                          {secret.externalRef ?? "—"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("pages.secrets.owned.jsx-text", { defaultValue: "Owned" })}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSecretId(secret.id);
                        }}
                      >
                        {t("pages.secrets.open.jsx-text", { defaultValue: "\n                        Open\n                      " })}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            )}
          </div>
        </TabsContent>
        <TabsContent value="vaults" className="min-h-0 flex-1 overflow-y-auto">
          <ProviderVaultsTab
            providers={providers}
            providerConfigs={providerConfigs}
            loading={providerConfigsQuery.isPending}
            error={providerConfigsQuery.error}
            onRetry={() => providerConfigsQuery.refetch()}
            onCreate={openCreateVault}
            onEdit={openEditVault}
            onDisable={(config) => disableVaultMutation.mutate(config.id)}
            onRemove={(config) => setRemoveVaultConfirm(config)}
            onSetDefault={(config) => defaultVaultMutation.mutate(config.id)}
            onHealthCheck={(config) => healthVaultMutation.mutate(config.id)}
            pendingActionId={
              disableVaultMutation.variables ??
              removeVaultMutation.variables ??
              defaultVaultMutation.variables ??
              healthVaultMutation.variables ??
              null
            }
          />
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selectedSecret)} onOpenChange={(open) => !open && setSelectedSecretId(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0">
          {selectedSecret ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  {selectedSecret.name}
                  <span className={cn("ml-2 text-sm font-normal", statusTextTone(selectedSecret.status))}>
                    {selectedSecret.status}
                  </span>
                </SheetTitle>
                <SheetDescription>
                  {providerLabel(providers, selectedSecret.provider)} {t("pages.secrets.v.jsx-text", { defaultValue: " · v" })}{selectedSecret.latestVersion} · {modeLabel(selectedSecret.managedMode, t)}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRotateOpen(true);
                    setRotateValue("");
                    setRotateExternalRef("");
                    setRotateProviderConfigId(
                      selectedSecret.providerConfigId ??
                        getDefaultProviderConfigId(providerConfigs, selectedSecret.provider),
                    );
                    setRotateError(null);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {selectedSecret.managedMode === "external_reference" ? "Update reference" : "Update value"}
                </Button>
                {selectedSecret.status === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate({ id: selectedSecret.id, status: "disabled" })}
                    disabled={statusMutation.isPending}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.disable.jsx-text", { defaultValue: " Disable\n                  " })}</Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate({ id: selectedSecret.id, status: "active" })}
                    disabled={statusMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.activate.jsx-text", { defaultValue: " Activate\n                  " })}</Button>
                )}
                {selectedSecret.status === "archived" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate({ id: selectedSecret.id, status: "active" })}
                    disabled={statusMutation.isPending}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.unarchive.jsx-text", { defaultValue: " Unarchive\n                  " })}</Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate({ id: selectedSecret.id, status: "archived" })}
                    disabled={statusMutation.isPending}
                  >
                    <Archive className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.archive.jsx-text", { defaultValue: " Archive\n                  " })}</Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirm(selectedSecret)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.delete.jsx-text", { defaultValue: " Delete\n                " })}</Button>
              </div>
              <Tabs value={secretDetailTab} onValueChange={setSecretDetailTab} className="flex-1 min-h-0 flex flex-col">
                <div className="border-b border-border px-4">
                  <PageTabBar
                    items={[
                      { value: "details", label: t("pages.secrets.details.tab_label", { defaultValue: "Details" }) },
                      {
                        value: "usage",
                        label: usageQuery.data
                          ? t("pages.secrets.usage_count.tab_label", { defaultValue: "Usage ({{count}})", count: usageQuery.data.bindings.length })
                          : t("pages.secrets.usage.tab_label", { defaultValue: "Usage" }),
                      },
                      { value: "events", label: t("pages.secrets.access_events.tab_label", { defaultValue: "Access events" }) },
                    ]}
                    align="start"
                    value={secretDetailTab}
                    onValueChange={setSecretDetailTab}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  <TabsContent value="details">
                    <SecretDetailsTab secret={selectedSecret} providerConfigs={providerConfigs} />
                  </TabsContent>
                  <TabsContent value="usage">
                    <SecretUsageTab loading={usageQuery.isPending} bindings={usageQuery.data?.bindings ?? []} />
                  </TabsContent>
                  <TabsContent value="events">
                    <SecretEventsTab loading={eventsQuery.isPending} events={eventsQuery.data ?? []} />
                  </TabsContent>
                </div>
              </Tabs>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(usageDialogSecret)}
        onOpenChange={(open) => !open && setUsageDialogSecretId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pages.secrets.secret_references.jsx-text", { defaultValue: "Secret references" })}</DialogTitle>
            <DialogDescription>
              {usageDialogSecret
                ? `${usageDialogSecret.name} is referenced by ${usageDialogSecret.referenceCount ?? 0} ${
                    (usageDialogSecret.referenceCount ?? 0) === 1 ? "place" : "places"
                  }.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <SecretUsageTab
            loading={usageDialogQuery.isPending}
            bindings={usageDialogQuery.data?.bindings ?? []}
          />
        </DialogContent>
      </Dialog>

      {selectedCompanyId && (
        <ImportFromVaultDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          companyId={selectedCompanyId}
          providerConfigs={providerConfigs}
          existingSecrets={secrets}
          onManageVaults={() => {
            setImportOpen(false);
            setActiveTab("vaults");
          }}
          onImportComplete={() => {
            void secretsQuery.refetch();
          }}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pages.secrets.create_secret.jsx-text", { defaultValue: "Create secret" })}</DialogTitle>
            <DialogDescription>
              {t("pages.secrets.choose_whether_paperclip_should_.jsx-text", { defaultValue: "\n              Choose whether Paperclip should own future provider writes, or only resolve an existing provider reference at runtime.\n            " })}</DialogDescription>
          </DialogHeader>
          <Tabs value={createMode} onValueChange={(value) => setCreateMode(value as CreateMode)}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="managed">{t("pages.secrets.managed_value.jsx-text", { defaultValue: "Managed value" })}</TabsTrigger>
              <TabsTrigger value="external">{t("pages.secrets.external_reference.jsx-text", { defaultValue: "External reference" })}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium" htmlFor="new-secret-name">{t("pages.secrets.name.attr_label", { defaultValue: "Name" })}</label>
                <Input
                  id="new-secret-name"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="OPENAI_API_KEY"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="new-secret-key">
                  Key <span className="text-muted-foreground/70">{t("pages.secrets.optional.jsx-text", { defaultValue: "(optional)" })}</span>
                </label>
                <Input
                  id="new-secret-key"
                  value={createForm.key}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, key: event.target.value }))
                  }
                  placeholder={t("pages.secrets.auto_from_name.attr_placeholder", { defaultValue: "auto from name" })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="new-secret-provider">{t("pages.secrets.provider.jsx-text", { defaultValue: "Provider" })}</label>
              <select
                id="new-secret-provider"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
                value={createForm.provider}
                onChange={(event) =>
                  setCreateForm((current) => {
                    const provider = event.target.value as SecretProvider;
                    return {
                      ...current,
                      provider,
                      providerConfigId: getDefaultProviderConfigId(providerConfigs, provider),
                    };
                  })
                }
              >
                {providers.map((provider) => (
                  <option
                    key={provider.id}
                    value={provider.id}
                    disabled={Boolean(
                      getCreateProviderBlockReason(provider, createMode, providerHealthQuery.data ?? null, t),
                    )}
                  >
                    {provider.label}
                    {provider.configured === false
                      ? t("pages.secrets.not_configured.option_suffix", { defaultValue: " (not configured)" })
                      : provider.requiresExternalRef
                        ? t("pages.secrets.external_only.option_suffix", { defaultValue: " (external only)" })
                        : ""}
                  </option>
                ))}
              </select>
              {createProviderBlockReason ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {createProviderBlockReason}
                </p>
              ) : createProviderHealthText ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{createProviderHealthText}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="new-secret-vault">{t("pages.secrets.provider_vault.jsx-text", { defaultValue: "Provider vault" })}</label>
              <select
                id="new-secret-vault"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
                value={createForm.providerConfigId}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, providerConfigId: event.target.value }))
                }
              >
                <option value="">{t("pages.secrets.deployment_default.jsx-text", { defaultValue: "Deployment default" })}</option>
                {createProviderConfigs.map((config) => {
                  const blockReason = getProviderConfigBlockReason(config, t);
                  return (
                    <option key={config.id} value={config.id} disabled={Boolean(blockReason)}>
                      {config.displayName}
                      {config.isDefault ? t("pages.secrets.default.option_suffix", { defaultValue: " (default)" }) : ""}
                      {blockReason ? ` (${blockReason})` : ""}
                    </option>
                  );
                })}
              </select>
              {selectedCreateProviderConfig ? (
                <ProviderVaultInlineWarning config={selectedCreateProviderConfig} />
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("pages.secrets.existing_deployment_level_provid.jsx-text", { defaultValue: "\n                  Existing deployment-level provider settings stay available for backwards compatibility.\n                " })}</p>
              )}
            </div>
            {createMode === "managed" ? (
              <>
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                  {t("pages.secrets.paperclip_managed_secrets_are_cr.jsx-text", { defaultValue: "\n                  Paperclip-managed secrets are created in the selected provider and future rotations write a new provider version through Paperclip.\n                  " })}{awsManagedPathPreview ? (
                    <div className="mt-1">
                      {t("pages.secrets.aws_managed_path.jsx-text", { defaultValue: "\n                      AWS managed path:" })}{" "}
                      <code className="break-all rounded bg-background/70 px-1 py-0.5">
                        {awsManagedPathPreview}
                      </code>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-medium" htmlFor="new-secret-value">{t("pages.secrets.value.attr_label", { defaultValue: "Value" })}</label>
                  <Textarea
                    id="new-secret-value"
                    value={createForm.value}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, value: event.target.value }))
                    }
                    rows={3}
                    className="min-w-0 overflow-x-hidden break-all font-mono text-xs"
                    placeholder={t("pages.secrets.stored_once_never_re_displayed.attr_placeholder", { defaultValue: "Stored once, never re-displayed" })}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-medium" htmlFor="new-secret-ref">{t("pages.secrets.external_reference.jsx-text", { defaultValue: "External reference" })}</label>
                <Input
                  id="new-secret-ref"
                  value={createForm.externalRef}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, externalRef: event.target.value }))
                  }
                  placeholder={t("pages.secrets.arn_aws_secretsmanager.attr_placeholder", { defaultValue: "arn:aws:secretsmanager:..." })}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("pages.secrets.existing_provider_secrets_are_re.jsx-text", { defaultValue: "\n                  Existing provider secrets are resolve-only in Paperclip. Rotate the value in the provider, then update this reference only if the path, ARN, or version changes.\n                " })}</p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium" htmlFor="new-secret-description">
                {t("pages.secrets.description.jsx-text", { defaultValue: "\n                Description " })}<span className="text-muted-foreground/70">{t("pages.secrets.optional.jsx-text", { defaultValue: "(optional)" })}</span>
              </label>
              <Input
                id="new-secret-description"
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={t("pages.secrets.what_is_this_secret_used_for_no_.attr_placeholder", { defaultValue: "What is this secret used for? (no values)" })}
              />
            </div>
            {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("pages.secrets.cancel.jsx-text", { defaultValue: "\n              Cancel\n            " })}</Button>
            <Button
              onClick={() => {
                setCreateError(null);
                createMutation.mutate();
              }}
              disabled={
                createMutation.isPending ||
                Boolean(createProviderBlockReason) ||
                !createForm.name.trim() ||
                (createMode === "managed" ? !createForm.value : !createForm.externalRef.trim())
              }
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {createMode === "managed" ? "Create secret" : "Link reference"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vaultDialogOpen} onOpenChange={setVaultDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingVault ? "Edit provider vault" : "Create provider vault"}</DialogTitle>
            <DialogDescription>
              {t("pages.secrets.save_only_non_sensitive_routing_.jsx-text", { defaultValue: "\n              Save only non-sensitive routing metadata. Credentials stay in the runtime environment or provider identity.\n            " })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium" htmlFor="vault-provider">{t("pages.secrets.provider.jsx-text", { defaultValue: "Provider" })}</label>
                <select
                  id="vault-provider"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none disabled:opacity-60"
                  value={vaultForm.provider}
                  disabled={Boolean(editingVault)}
                  onChange={(event) => {
                    const provider = event.target.value as SecretProvider;
                    setVaultForm(emptyProviderVaultForm(provider));
                    setVaultDiscovery(null);
                    setVaultDiscoveryError(null);
                  }}
                >
                  {PROVIDER_ORDER.map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLabel(providers, provider)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="vault-name">{t("pages.secrets.display_name.jsx-text", { defaultValue: "Display name" })}</label>
                <Input
                  id="vault-name"
                  value={vaultForm.displayName}
                  onChange={(event) =>
                    setVaultForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder={t("pages.secrets.production_local_vault.attr_placeholder", { defaultValue: "Production local vault" })}
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="vault-status">{t("pages.secrets.status.jsx-text", { defaultValue: "Status" })}</label>
                <select
                  id="vault-status"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
                  value={vaultForm.status}
                  onChange={(event) => {
                    const status = event.target.value as SecretProviderConfigStatus;
                    setVaultForm((current) => ({
                      ...current,
                      status,
                      isDefault:
                        status === "coming_soon" || status === "disabled" ? false : current.isDefault,
                    }));
                  }}
                >
                  <option value="ready" disabled={vaultForm.provider === "gcp_secret_manager" || vaultForm.provider === "vault"}>
                    {t("pages.secrets.ready.jsx-text", { defaultValue: "\n                    Ready\n                  " })}</option>
                  <option value="warning" disabled={vaultForm.provider === "gcp_secret_manager" || vaultForm.provider === "vault"}>
                    {t("pages.secrets.warning.jsx-text", { defaultValue: "\n                    Warning\n                  " })}</option>
                  <option value="coming_soon">{t("pages.secrets.coming_soon.jsx-text", { defaultValue: "Coming soon" })}</option>
                  <option value="disabled">{t("pages.secrets.disabled.jsx-text", { defaultValue: "Disabled" })}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={vaultForm.isDefault}
                  disabled={vaultForm.status === "coming_soon" || vaultForm.status === "disabled"}
                  onChange={(event) =>
                    setVaultForm((current) => ({ ...current, isDefault: event.target.checked }))
                  }
                />
                {t("pages.secrets.default_for.jsx-text", { defaultValue: "\n                Default for " })}{providerLabel(providers, vaultForm.provider)}
              </label>
            </div>

            <ProviderVaultFields form={vaultForm} onChange={setVaultForm} />

            {!editingVault && vaultForm.provider === "aws_secrets_manager" ? (
              <AwsProviderVaultDiscoveryPanel
                form={vaultForm}
                preview={vaultDiscovery}
                error={vaultDiscoveryError}
                loading={discoverVaultMutation.isPending}
                onDiscover={() => {
                  setVaultDiscovery(null);
                  setVaultDiscoveryError(null);
                  discoverVaultMutation.mutate();
                }}
                onApply={applyVaultDiscoveryCandidate}
              />
            ) : null}

            {vaultForm.provider === "gcp_secret_manager" || vaultForm.provider === "vault" ? (
              <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700 dark:text-sky-300">
                {t("pages.secrets.this_provider_can_save_draft_rou.jsx-text", { defaultValue: "\n                This provider can save draft routing metadata, but runtime writes and resolution stay disabled until the provider module is implemented and reviewed.\n              " })}</div>
            ) : null}
            {vaultError ? <p className="text-xs text-destructive">{vaultError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVaultDialogOpen(false)}>
              {t("pages.secrets.cancel.jsx-text", { defaultValue: "\n              Cancel\n            " })}</Button>
            <Button
              onClick={() => {
                setVaultError(null);
                saveVaultMutation.mutate();
              }}
              disabled={
                saveVaultMutation.isPending ||
                !vaultForm.displayName.trim() ||
                (vaultForm.provider === "aws_secrets_manager" && !vaultForm.region.trim())
              }
            >
              {saveVaultMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {editingVault ? "Save vault" : "Create vault"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSecret?.managedMode === "external_reference" ? "Update external reference" : "Update secret value"}
            </DialogTitle>
            <DialogDescription>
              {selectedSecret?.managedMode === "external_reference"
                ? "Creates a new Paperclip metadata version that points at an existing provider secret. Paperclip does not write a new provider value."
                : "Creates a new provider-backed version. Consumers pinned to latest pick up the new value on the next run."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium" htmlFor="rotate-secret-vault">{t("pages.secrets.provider_vault.jsx-text", { defaultValue: "Provider vault" })}</label>
            <select
              id="rotate-secret-vault"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
              value={rotateProviderConfigId}
              onChange={(event) => setRotateProviderConfigId(event.target.value)}
            >
              <option value="">{t("pages.secrets.deployment_default.jsx-text", { defaultValue: "Deployment default" })}</option>
              {selectedRotateProviderConfigs.map((config) => {
                const blockReason = getProviderConfigBlockReason(config);
                return (
                  <option key={config.id} value={config.id} disabled={Boolean(blockReason)}>
                    {config.displayName}
                    {config.isDefault ? " (default)" : ""}
                    {blockReason ? ` (${blockReason})` : ""}
                  </option>
                );
              })}
            </select>
            {selectedRotateProviderConfig ? (
              <ProviderVaultInlineWarning config={selectedRotateProviderConfig} />
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("pages.secrets.rotating_with_the_deployment_def.jsx-text", { defaultValue: "\n                Rotating with the deployment default preserves current fallback behavior.\n              " })}</p>
            )}
          </div>
          {selectedSecret?.managedMode === "external_reference" ? (
            <div>
              <label className="text-xs font-medium" htmlFor="rotate-ref">{t("pages.secrets.external_reference.jsx-text", { defaultValue: "External reference" })}</label>
              <Input
                id="rotate-ref"
                value={rotateExternalRef}
                onChange={(event) => setRotateExternalRef(event.target.value)}
                placeholder={selectedSecret.externalRef ?? "Updated reference"}
                className="font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("pages.secrets.rotate_the_actual_value_in_the_p.jsx-text", { defaultValue: "\n                Rotate the actual value in the provider before changing this Paperclip reference.\n              " })}</p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium" htmlFor="rotate-value">{t("pages.secrets.new_value.jsx-text", { defaultValue: "New value" })}</label>
              <Textarea
                id="rotate-value"
                value={rotateValue}
                onChange={(event) => setRotateValue(event.target.value)}
                rows={3}
                className="font-mono text-xs"
                placeholder={t("pages.secrets.paste_the_new_value.attr_placeholder", { defaultValue: "Paste the new value" })}
              />
            </div>
          )}
          {rotateError ? <p className="text-xs text-destructive">{rotateError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateOpen(false)}>
              {t("pages.secrets.cancel.jsx-text", { defaultValue: "\n              Cancel\n            " })}</Button>
            <Button
              onClick={() => {
                setRotateError(null);
                rotateMutation.mutate();
              }}
              disabled={
                rotateMutation.isPending ||
                Boolean(rotateProviderBlockReason) ||
                (selectedSecret?.managedMode === "external_reference"
                  ? !rotateExternalRef.trim() && !selectedSecret?.externalRef
                  : !rotateValue)
              }
            >
              {rotateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {selectedSecret?.managedMode === "external_reference" ? "Update reference" : "Update value"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages.secrets.delete_secret.jsx-text", { defaultValue: "Delete secret" })}</DialogTitle>
            <DialogDescription>
              {t("pages.secrets.permanently_removes.jsx-text", { defaultValue: "\n              Permanently removes " })}<strong>{deleteConfirm?.name}</strong>{t("pages.secrets.active_bindings_will_fail_until_.jsx-text", { defaultValue: ". Active bindings will fail until you remap them.\n            " })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("pages.secrets.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("pages.secrets.delete.jsx-text", { defaultValue: "\n              Delete\n            " })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeVaultConfirm)} onOpenChange={(open) => !open && setRemoveVaultConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages.secrets.remove_provider_vault.jsx-text", { defaultValue: "Remove provider vault" })}</DialogTitle>
            <DialogDescription>
              {t("pages.secrets.removes.jsx-text", { defaultValue: "\n              Removes " })}<strong>{removeVaultConfirm?.displayName}</strong> {t("pages.secrets.from_paperclip_only.jsx-text", { defaultValue: " from Paperclip only." })}{" "}
              {removeVaultConfirm?.provider === "aws_secrets_manager"
                ? "This does not delete the remote AWS Secrets Manager vault, secrets, or any AWS data."
                : "This does not delete any remote provider data."}{" "}
              {t("pages.secrets.secrets_using_this_vault_will_lo.jsx-text", { defaultValue: "\n              Secrets using this vault will lose the vault association until you assign another one.\n            " })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveVaultConfirm(null)}>{t("pages.secrets.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
            <Button
              variant="destructive"
              onClick={() => removeVaultConfirm && removeVaultMutation.mutate(removeVaultConfirm.id)}
              disabled={removeVaultMutation.isPending}
            >
              {removeVaultMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("pages.secrets.remove_from_paperclip.jsx-text", { defaultValue: "\n              Remove from Paperclip\n            " })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecretsHowToUse() {
const { t } = useTranslation();

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{t("pages.secrets.use_secrets_by_binding_them_to_r.jsx-text", { defaultValue: "Use secrets by binding them to runtime environment variables." })}</p>
        <p>
          {t("pages.secrets.create_or_link_a_secret_here_the.jsx-text", { defaultValue: "\n          Create or link a secret here, then open an agent&apos;s Environment variables or a project&apos;s Env field. Add the env key the process expects, for example " })}<code className="font-mono">GH_TOKEN</code>{t("pages.secrets.choose.jsx-text", { defaultValue: ", choose" })}{" "}
          <span className="font-medium text-foreground">{t("pages.secrets.secret.jsx-text", { defaultValue: "Secret" })}</span>{t("pages.secrets.and_select_the_stored_secret_ver.jsx-text", { defaultValue: ", and select the stored secret version.\n        " })}</p>
        <p>
          {t("pages.secrets.paperclip_resolves_the_value_ser.jsx-text", { defaultValue: "\n          Paperclip resolves the value server-side when the run starts and injects it as that env var. Project env applies to every task in the project and overrides agent env on matching keys.\n        " })}</p>
      </div>
    </div>
  );
}

function SecretsFiltersPopover({
  statusFilter,
  providerFilter,
  providers,
  activeFilterCount,
  onStatusChange,
  onProviderChange,
}: {
  statusFilter: SecretStatus | "all";
  providerFilter: SecretProvider | "all";
  providers: SecretProviderDescriptor[];
  activeFilterCount: number;
  onStatusChange: (value: SecretStatus | "all") => void;
  onProviderChange: (value: SecretProvider | "all") => void;
}) {
const { t } = useTranslation();

  const resetFilters = () => {
    onStatusChange("active");
    onProviderChange("all");
  };

  const statusOptions: Array<{ value: SecretStatus | "all"; label: string }> = [
    { value: "active", label: t("pages.secrets.active.status_label", { defaultValue: "Active" }) },
    { value: "all", label: t("pages.secrets.all_statuses.status_label", { defaultValue: "All statuses" }) },
    { value: "disabled", label: t("pages.secrets.disabled.status_label", { defaultValue: "Disabled" }) },
    { value: "archived", label: t("pages.secrets.archived.status_label", { defaultValue: "Archived" }) },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("relative h-8 w-8 shrink-0", activeFilterCount > 0 && "text-blue-600 dark:text-blue-400")}
          title={activeFilterCount > 0 ? `Filters: ${activeFilterCount}` : "Filter"}
        >
          <Filter className="h-3.5 w-3.5" />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(520px,calc(100vw-2rem))] max-h-[min(80vh,34rem)] overflow-y-auto overscroll-contain p-0"
      >
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("pages.secrets.filters.jsx-text", { defaultValue: "Filters" })}</span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={resetFilters}
              >
                <X className="h-3 w-3" />
                {t("pages.secrets.clear.jsx-text", { defaultValue: "\n                Clear\n              " })}</button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("pages.secrets.status.jsx-text", { defaultValue: "Status" })}</span>
              <div className="space-y-0.5">
                {statusOptions.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={statusFilter === option.value}
                      onCheckedChange={() => onStatusChange(option.value)}
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("pages.secrets.provider.jsx-text", { defaultValue: "Provider" })}</span>
              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                  <Checkbox
                    checked={providerFilter === "all"}
                    onCheckedChange={() => onProviderChange("all")}
                  />
                  <span className="text-sm">{t("pages.secrets.all_providers.jsx-text", { defaultValue: "All providers" })}</span>
                </label>
                {providers.map((provider) => (
                  <label key={provider.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={providerFilter === provider.id}
                      onCheckedChange={() => onProviderChange(provider.id)}
                    />
                    <span className="text-sm">{provider.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function providerConfigStatusTone(status: SecretProviderConfigStatus) {
  switch (status) {
    case "ready":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "coming_soon":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "disabled":
      return "border-muted bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function providerFamilyIcon(provider: SecretProvider) {
  switch (provider) {
    case "local_encrypted":
      return Database;
    case "aws_secrets_manager":
      return Cloud;
    case "gcp_secret_manager":
      return ShieldCheck;
    case "vault":
      return KeyRound;
    default:
      return KeyRound;
  }
}

function ProviderVaultInlineWarning({ config }: { config: CompanySecretProviderConfig }) {
const { t } = useTranslation();

  const blockReason = getProviderConfigBlockReason(config);
  const message = blockReason ?? config.healthMessage;
  if (!message) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        {config.isDefault ? "Default vault" : "Vault"} · {config.status.replace("_", " ")}
      </p>
    );
  }
  const warning = config.status === "warning" || config.healthStatus === "warning";
  return (
    <p className={cn("mt-1 flex items-center gap-1 text-[11px]", warning ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>
      {warning ? <AlertTriangle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {message}
    </p>
  );
}

interface ImportFromVaultButtonProps {
  providerConfigs: CompanySecretProviderConfig[];
  onClick: () => void;
  onManageVaults: () => void;
  className?: string;
}

function ImportFromVaultButton({
  providerConfigs,
  onClick,
  onManageVaults,
  className,
}: ImportFromVaultButtonProps) {
const { t } = useTranslation();

  const awsConfigs = providerConfigs.filter(
    (config) => config.provider === "aws_secrets_manager",
  );
  const eligible = awsConfigs.filter(
    (config) => config.status === "ready" || config.status === "warning",
  );

  if (awsConfigs.length === 0) return null;

  if (eligible.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onManageVaults}
        className={cn("text-xs text-muted-foreground", className)}
        title={t("pages.secrets.configure_an_aws_provider_vault_.attr_title", { defaultValue: "Configure an AWS provider vault to enable remote import" })}
      >
        <Cloud className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.aws_vault_disabled_manage.jsx-text", { defaultValue: " AWS vault disabled — manage\n      " })}</Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={className}
      data-testid="import-from-vault-button"
    >
      <Cloud className="h-3.5 w-3.5 mr-1" /> {t("pages.secrets.import_from_vault.jsx-text", { defaultValue: " Import from vault\n    " })}</Button>
  );
}

export function ProviderVaultsTab({
  providers,
  providerConfigs,
  loading,
  error,
  onRetry,
  onCreate,
  onEdit,
  onDisable,
  onRemove,
  onSetDefault,
  onHealthCheck,
  pendingActionId,
}: {
  providers: SecretProviderDescriptor[];
  providerConfigs: CompanySecretProviderConfig[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onCreate: (provider: SecretProvider) => void;
  onEdit: (config: CompanySecretProviderConfig) => void;
  onDisable: (config: CompanySecretProviderConfig) => void;
  onRemove: (config: CompanySecretProviderConfig) => void;
  onSetDefault: (config: CompanySecretProviderConfig) => void;
  onHealthCheck: (config: CompanySecretProviderConfig) => void;
  pendingActionId: string | null;
}) {
const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("pages.secrets.loading_provider_vaults.jsx-text", { defaultValue: "\n        Loading provider vaults\n      " })}</div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-sm text-destructive flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> {t("pages.secrets.failed_to_load_provider_vaults.jsx-text", { defaultValue: " Failed to load provider vaults: " })}{(error as Error).message}
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t("pages.secrets.retry.jsx-text", { defaultValue: "\n          Retry\n        " })}</Button>
      </div>
    );
  }

  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const providerRows = PROVIDER_ORDER.map((providerId) => ({
    id: providerId,
    provider: providerMap.get(providerId),
    Icon: providerFamilyIcon(providerId),
    isComingSoonFamily: providerId === "gcp_secret_manager" || providerId === "vault",
    configs: providerConfigs.filter((config) => config.provider === providerId),
  }));

  return (
    <div className="flex min-h-full gap-6">
      <aside className="hidden w-56 shrink-0 md:block">
        <nav className="sticky top-0 space-y-1">
          {providerRows.map(({ id, provider, Icon }) => (
            <a
              key={id}
              href={`#provider-vaults-${id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{provider?.label ?? id.replaceAll("_", " ")}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        {providerRows.map(({ id, provider, Icon, isComingSoonFamily, configs }) => (
          <section key={id} id={`provider-vaults-${id}`} className={cn("scroll-mt-6 space-y-2", isComingSoonFamily && "opacity-50")}>
            <div className="flex flex-wrap items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{provider?.label ?? id.replaceAll("_", " ")}</h2>
              {isComingSoonFamily ? (
                <span className="ml-auto text-xs text-muted-foreground">{t("pages.secrets.coming_soon.jsx-text", { defaultValue: "Coming soon" })}</span>
              ) : (
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => onCreate(id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("pages.secrets.add_vault.jsx-text", { defaultValue: "\n                  Add vault\n                " })}</Button>
              )}
            </div>
            {configs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                {isComingSoonFamily
                  ? "Not yet supported."
                  : "No company-specific vaults yet. Secrets can still use the deployment default provider settings."}
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <ProviderVaultCard
                    key={config.id}
                    config={config}
                    pending={pendingActionId === config.id}
                    onEdit={() => onEdit(config)}
                    onDisable={() => onDisable(config)}
                    onRemove={() => onRemove(config)}
                    onSetDefault={() => onSetDefault(config)}
                    onHealthCheck={() => onHealthCheck(config)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function ProviderVaultCard({
  config,
  pending,
  onEdit,
  onDisable,
  onRemove,
  onSetDefault,
  onHealthCheck,
}: {
  config: CompanySecretProviderConfig;
  pending: boolean;
  onEdit: () => void;
  onDisable: () => void;
  onRemove: () => void;
  onSetDefault: () => void;
  onHealthCheck: () => void;
}) {
const { t } = useTranslation();

  const blockReason = getProviderConfigBlockReason(config);
  const details = config.healthDetails;
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium leading-snug">{config.displayName}</h3>
            {config.isDefault ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <Star className="h-3 w-3 fill-current" />
                {t("pages.secrets.default.jsx-text", { defaultValue: "\n                Default\n              " })}</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("font-medium", providerConfigStatusTone(config.status))}>
              {config.status.replace("_", " ")}
            </Badge>
            {config.healthStatus ? (
              <span className="text-xs text-muted-foreground">
                {t("pages.secrets.health.jsx-text", { defaultValue: "\n                Health " })}{config.healthStatus.replace("_", " ")} · {formatRelative(config.healthCheckedAt)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("pages.secrets.health_not_checked.jsx-text", { defaultValue: "Health not checked" })}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {config.healthMessage || blockReason ? (
        <div className={cn("mt-3 rounded-md p-2 text-xs", blockReason ? "bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>
          {blockReason ?? config.healthMessage}
          {details?.guidance?.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {details.guidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onHealthCheck} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {t("pages.secrets.check_health.jsx-text", { defaultValue: "\n          Check health\n        " })}</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSetDefault}
          disabled={pending || Boolean(blockReason) || config.isDefault}
        >
          <Star className="h-3.5 w-3.5 mr-1" />
          {t("pages.secrets.make_default.jsx-text", { defaultValue: "\n          Make default\n        " })}</Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDisable}
          disabled={pending || config.status === "disabled"}
        >
          <Ban className="h-3.5 w-3.5 mr-1" />
          {t("pages.secrets.disable.jsx-text", { defaultValue: "\n          Disable\n        " })}</Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          {t("pages.secrets.remove.jsx-text", { defaultValue: "\n          Remove\n        " })}</Button>
      </div>
    </div>
  );
}

function ProviderVaultFields({
  form,
  onChange,
}: {
  form: ProviderVaultForm;
  onChange: React.Dispatch<React.SetStateAction<ProviderVaultForm>>;
}) {
const { t } = useTranslation();

  const setField = (key: keyof ProviderVaultForm, value: string | boolean) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  if (form.provider === "local_encrypted") {
    return (
      <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border"
          checked={form.backupReminderAcknowledged}
          onChange={(event) => setField("backupReminderAcknowledged", event.target.checked)}
        />
        <span>
          {t("pages.secrets.i_understand_backup_and_restore_.jsx-text", { defaultValue: "\n          I understand backup and restore require both the database metadata and the local encrypted master key file.\n        " })}</span>
      </label>
    );
  }

  if (form.provider === "aws_secrets_manager") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("pages.secrets.aws_region.attr_label", { defaultValue: "AWS region" })} value={form.region} onChange={(value) => setField("region", value)} placeholder={t("pages.secrets.us_east_1.attr_placeholder", { defaultValue: "us-east-1" })} required />
        <TextField label={t("pages.secrets.namespace.attr_label", { defaultValue: "Namespace" })} value={form.namespace} onChange={(value) => setField("namespace", value)} placeholder={t("pages.secrets.production.attr_placeholder", { defaultValue: "production" })} />
        <TextField label={t("pages.secrets.secret_name_prefix.attr_label", { defaultValue: "Secret name prefix" })} value={form.secretNamePrefix} onChange={(value) => setField("secretNamePrefix", value)} placeholder={t("pages.secrets.paperclip.attr_placeholder", { defaultValue: "paperclip" })} />
        <TextField label={t("pages.secrets.kms_key_id.attr_label", { defaultValue: "KMS key id" })} value={form.kmsKeyId} onChange={(value) => setField("kmsKeyId", value)} placeholder={t("pages.secrets.alias_paperclip_secrets.attr_placeholder", { defaultValue: "alias/paperclip-secrets" })} />
        <TextField label={t("pages.secrets.owner_tag.attr_label", { defaultValue: "Owner tag" })} value={form.ownerTag} onChange={(value) => setField("ownerTag", value)} placeholder={t("pages.secrets.platform.attr_placeholder", { defaultValue: "platform" })} />
        <TextField label={t("pages.secrets.environment_tag.attr_label", { defaultValue: "Environment tag" })} value={form.environmentTag} onChange={(value) => setField("environmentTag", value)} placeholder={t("pages.secrets.prod.attr_placeholder", { defaultValue: "prod" })} />
      </div>
    );
  }

  if (form.provider === "gcp_secret_manager") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("pages.secrets.project_id.attr_label", { defaultValue: "Project id" })} value={form.projectId} onChange={(value) => setField("projectId", value)} placeholder={t("pages.secrets.paperclip_prod.attr_placeholder", { defaultValue: "paperclip-prod" })} />
        <TextField label={t("pages.secrets.location.attr_label", { defaultValue: "Location" })} value={form.location} onChange={(value) => setField("location", value)} placeholder={t("pages.secrets.global.attr_placeholder", { defaultValue: "global" })} />
        <TextField label={t("pages.secrets.namespace.attr_label", { defaultValue: "Namespace" })} value={form.namespace} onChange={(value) => setField("namespace", value)} placeholder={t("pages.secrets.production.attr_placeholder", { defaultValue: "production" })} />
        <TextField label={t("pages.secrets.secret_name_prefix.attr_label", { defaultValue: "Secret name prefix" })} value={form.secretNamePrefix} onChange={(value) => setField("secretNamePrefix", value)} placeholder={t("pages.secrets.paperclip.attr_placeholder", { defaultValue: "paperclip" })} />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label={t("pages.secrets.address.attr_label", { defaultValue: "Address" })} value={form.address} onChange={(value) => setField("address", value)} placeholder="https://vault.example.com" />
      <TextField label={t("pages.secrets.namespace.attr_label", { defaultValue: "Namespace" })} value={form.namespace} onChange={(value) => setField("namespace", value)} placeholder={t("pages.secrets.admin.attr_placeholder", { defaultValue: "admin" })} />
      <TextField label={t("pages.secrets.mount_path.attr_label", { defaultValue: "Mount path" })} value={form.mountPath} onChange={(value) => setField("mountPath", value)} placeholder={t("pages.secrets.secret.attr_placeholder", { defaultValue: "secret" })} />
      <TextField label={t("pages.secrets.secret_path_prefix.attr_label", { defaultValue: "Secret path prefix" })} value={form.secretPathPrefix} onChange={(value) => setField("secretPathPrefix", value)} placeholder={t("pages.secrets.paperclip_prod.attr_placeholder", { defaultValue: "paperclip/prod" })} />
    </div>
  );
}

function AwsProviderVaultDiscoveryPanel({
  form,
  preview,
  error,
  loading,
  onDiscover,
  onApply,
}: {
  form: ProviderVaultForm;
  preview: SecretProviderConfigDiscoveryPreviewResult | null;
  error: string | null;
  loading: boolean;
  onDiscover: () => void;
  onApply: (candidate: SecretProviderConfigDiscoveryCandidate) => void;
}) {
const { t } = useTranslation();

  const canDiscover = Boolean(form.region.trim());
  const warnings = preview?.warnings ?? [];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("pages.secrets.aws_discovery.jsx-text", { defaultValue: "AWS discovery" })}</p>
          <p className="text-xs text-muted-foreground">
            {t("pages.secrets.uses_the_current_draft_routing_f.jsx-text", { defaultValue: "\n            Uses the current draft routing fields to inspect AWS Secrets Manager metadata. Values are not read.\n          " })}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDiscover}
          disabled={!canDiscover || loading}
          data-testid="aws-vault-discovery-button"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Search className="h-3.5 w-3.5 mr-1" />
          )}
          {t("pages.secrets.find_existing_aws_values.jsx-text", { defaultValue: "\n          Find existing AWS values\n        " })}</Button>
      </div>

      {!canDiscover ? (
        <p className="text-xs text-muted-foreground">{t("pages.secrets.enter_an_aws_region_before_disco.jsx-text", { defaultValue: "Enter an AWS region before discovery." })}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("pages.secrets.searching_aws_secrets_manager_me.jsx-text", { defaultValue: "\n          Searching AWS Secrets Manager metadata\n        " })}</div>
      ) : null}

      {error ? (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          {warnings.map((warning) => (
            <div key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : null}

      {preview && preview.candidates.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("pages.secrets.no_aws_vault_metadata_candidates.jsx-text", { defaultValue: "\n          No AWS vault metadata candidates found. Manual entry is still available.\n        " })}</div>
      ) : null}

      {preview && preview.candidates.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>
              {preview.candidates.length} {t("pages.secrets.candidate.jsx-text", { defaultValue: " candidate" })}{preview.candidates.length === 1 ? "" : "s"} {t("pages.secrets.from.jsx-text", { defaultValue: " from" })}{" "}
              {preview.sampledSecretCount} {t("pages.secrets.sampled_secret.jsx-text", { defaultValue: " sampled secret" })}{preview.sampledSecretCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-2" data-testid="aws-vault-discovery-candidates">
            {preview.candidates.map((candidate, index) => (
              <AwsProviderVaultDiscoveryCandidateRow
                key={`${candidate.displayName}-${index}`}
                candidate={candidate}
                onApply={() => onApply(candidate)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AwsProviderVaultDiscoveryCandidateRow({
  candidate,
  onApply,
}: {
  candidate: SecretProviderConfigDiscoveryCandidate;
  onApply: () => void;
}) {
const { t } = useTranslation();

  const fieldSummary = [
    providerConfigValue(candidate.config, "region"),
    providerConfigValue(candidate.config, "namespace"),
    providerConfigValue(candidate.config, "secretNamePrefix"),
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium leading-snug">{candidate.displayName}</p>
            <span className="text-xs text-muted-foreground">
              {candidate.sampleCount} {t("pages.secrets.sample.jsx-text", { defaultValue: " sample" })}{candidate.sampleCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {fieldSummary.length > 0 ? fieldSummary.join(" / ") : "No stable namespace or prefix detected"}
          </p>
          {candidate.samples[0] ? (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {candidate.samples[0].name}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onApply}>
          {t("pages.secrets.use_values.jsx-text", { defaultValue: "\n          Use values\n        " })}</Button>
      </div>
      {candidate.warnings.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {candidate.warnings.map((warning) => (
            <div key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
const { t } = useTranslation();

  const id = `provider-vault-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
        {required ? null : <span className="text-muted-foreground/70"> {t("pages.secrets.optional.jsx-text", { defaultValue: " (optional)" })}</span>}
      </label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SecretDetailsTab({
  secret,
  providerConfigs,
}: {
  secret: CompanySecret;
  providerConfigs: CompanySecretProviderConfig[];
}) {
const { t } = useTranslation();

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      <DetailRow label={t("pages.secrets.description.attr_label", { defaultValue: "Description" })}>
        <span>{secret.description ?? <span className="text-muted-foreground">—</span>}</span>
      </DetailRow>
      <DetailRow label={t("pages.secrets.custody.attr_label", { defaultValue: "Custody" })}>{modeLabel(secret.managedMode, t)}</DetailRow>
      <DetailRow label={t("pages.secrets.provider.attr_label", { defaultValue: "Provider" })}>{secret.provider.replaceAll("_", " ")}</DetailRow>
      <DetailRow label={t("pages.secrets.provider_vault.attr_label", { defaultValue: "Provider vault" })}>{providerVaultLabel(providerConfigs, secret.providerConfigId, t)}</DetailRow>
      <DetailRow label={t("pages.secrets.latest_version.attr_label", { defaultValue: "Latest version" })}>v{secret.latestVersion}</DetailRow>
      <DetailRow label={t("pages.secrets.created.attr_label", { defaultValue: "Created" })}>{formatRelative(secret.createdAt)}</DetailRow>
      <DetailRow label={t("pages.secrets.updated.attr_label", { defaultValue: "Updated" })}>{formatRelative(secret.updatedAt)}</DetailRow>
      <DetailRow label={t("pages.secrets.last_rotated.attr_label", { defaultValue: "Last rotated" })}>{formatRelative(secret.lastRotatedAt)}</DetailRow>
      <DetailRow label={t("pages.secrets.last_resolved.attr_label", { defaultValue: "Last resolved" })}>{formatRelative(secret.lastResolvedAt)}</DetailRow>
      {secret.externalRef ? (
        <div className="col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            {secret.managedMode === "external_reference"
              ? t("pages.secrets.linked_provider_reference.jsx-text", { defaultValue: "Linked provider reference" })
              : t("pages.secrets.provider_managed_path.jsx-text", { defaultValue: "Provider-managed path" })}
          </dt>
          <dd className="font-mono text-xs break-all flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> {secret.externalRef}
          </dd>
        </div>
      ) : null}
      <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300">
        {modeDescription(secret.managedMode, t)} {t("pages.secrets.paperclip_never_re_displays_stor.jsx-text", { defaultValue: " Paperclip never re-displays stored values.\n      " })}</div>
    </dl>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
const { t } = useTranslation();

  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function SecretUsageTab({ loading, bindings }: { loading: boolean; bindings: CompanySecretUsageBinding[] }) {
const { t } = useTranslation();

  if (loading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">{t("pages.secrets.loading.jsx-text", { defaultValue: "Loading…" })}</div>;
  }
  if (bindings.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        {t("pages.secrets.no_active_bindings_add_this_secr.jsx-text", { defaultValue: "\n        No active bindings. Add this secret in agent, project, environment, or plugin config to start using it.\n      " })}</div>
    );
  }
  return (
    <div className="space-y-2">
      {bindings.map((binding) => (
        <div
          key={binding.id}
          className="rounded-md border border-border bg-muted/30 p-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium capitalize">{binding.target.type}</span>
            <span className="font-mono text-muted-foreground">v{binding.versionSelector}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            {binding.target.href ? (
              <Link to={binding.target.href} className="truncate font-medium text-primary hover:underline">
                {binding.target.label}
              </Link>
            ) : (
              <span className="truncate font-medium">{binding.target.label}</span>
            )}
            {binding.target.status ? (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                {binding.target.status.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground break-all">
            {binding.targetId}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {binding.configPath} {binding.required ? "· required" : "· optional"}
          </div>
        </div>
      ))}
    </div>
  );
}

function SecretEventsTab({ loading, events }: { loading: boolean; events: SecretAccessEvent[] }) {
const { t } = useTranslation();

  if (loading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">{t("pages.secrets.loading.jsx-text", { defaultValue: "Loading…" })}</div>;
  }
  if (events.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        {t("pages.secrets.no_access_events_recorded_yet_ea.jsx-text", { defaultValue: "\n        No access events recorded yet. Each runtime resolution writes a redacted entry here.\n      " })}</div>
    );
  }
  return (
    <div className="space-y-1.5">
      {events.map((event) => (
        <div key={event.id} className="rounded border border-border px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="capitalize">
              {event.consumerType} · {event.outcome}
            </span>
            <span className="text-[11px] text-muted-foreground">{formatRelative(event.createdAt)}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground break-all">
            {event.consumerId}
          </div>
          {event.errorCode ? (
            <div className="text-[11px] text-destructive">{event.errorCode}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
