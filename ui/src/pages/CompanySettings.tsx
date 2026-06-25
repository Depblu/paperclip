import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES,
  MAX_COMPANY_ATTACHMENT_MAX_BYTES,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { assetsApi } from "../api/assets";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, CloudUpload, Download, Upload } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_COMPANY_ATTACHMENT_MAX_MIB = DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
const MAX_COMPANY_ATTACHMENT_MAX_MIB = MAX_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
export function CompanySettings() {
const { t } = useTranslation();

  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [attachmentMaxMiB, setAttachmentMaxMiB] = useState(String(DEFAULT_COMPANY_ATTACHMENT_MAX_MIB));
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setAttachmentMaxMiB(String(Math.round((selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES) / BYTES_PER_MIB)));
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const attachmentMaxBytes = Number.parseInt(attachmentMaxMiB, 10) * BYTES_PER_MIB;
  const attachmentMaxValid =
    Number.isInteger(attachmentMaxBytes)
    && attachmentMaxBytes >= BYTES_PER_MIB
    && attachmentMaxBytes <= MAX_COMPANY_ATTACHMENT_MAX_BYTES;
  const cloudSyncEnabled = experimentalSettings?.enableCloudSync === true;

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? "") ||
      attachmentMaxBytes !== (selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
      attachmentMaxBytes: number;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
      setLogoFileName("");
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) {
      setLogoFileName("");
      return;
    }
    setLogoFileName(file.name);
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("pages.companysettings.company.breadcrumb", { defaultValue: "Company" }), href: "/dashboard" },
      { label: t("pages.companysettings.settings.breadcrumb", { defaultValue: "Settings" }) }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("pages.companysettings.no_company_selected_select_a_com.jsx-text", { defaultValue: "\n        No company selected. Select a company from the switcher above.\n      " })}</div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
      attachmentMaxBytes
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("pages.companysettings.company_settings.jsx-text", { defaultValue: "Company Settings" })}</h1>
      </div>

      {/* General */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("pages.companysettings.general.jsx-text", { defaultValue: "\n          General\n        " })}</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field
            label={t("pages.companysettings.company_name.attr_label", { defaultValue: "Company name" })}
            hint={t("pages.companysettings.the_display_name_for_your_comp.attr_hint", { defaultValue: "The display name for your company." })}
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field
            label={t("pages.companysettings.description.attr_label", { defaultValue: "Description" })}
            hint={t("pages.companysettings.optional_description_shown_in_.attr_hint", { defaultValue: "Optional description shown in the company profile." })}
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder={t("pages.companysettings.optional_company_description.attr_placeholder", { defaultValue: "Optional company description" })}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("pages.companysettings.appearance.jsx-text", { defaultValue: "\n          Appearance\n        " })}</div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label={t("pages.companysettings.logo.attr_label", { defaultValue: "Logo" })}
                hint={t("pages.companysettings.upload_a_png_jpeg_webp_gif_.attr_hint", { defaultValue: "Upload a PNG, JPEG, WEBP, GIF, or SVG logo image." })}
              >
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploadMutation.isPending}
                    >
                      {t("pages.companysettings.browse_logo.jsx-text", { defaultValue: "Browse..." })}
                    </Button>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {logoFileName || t("pages.companysettings.no_file_selected.jsx-text", { defaultValue: "No file selected." })}
                    </span>
                  </div>
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending
                          ? t("pages.companysettings.removing.jsx-text", { defaultValue: "Removing..." })
                          : t("pages.companysettings.remove_logo.jsx-text", { defaultValue: "Remove logo" })}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : t("pages.companysettings.logo_upload_failed.jsx-text", { defaultValue: "Logo upload failed" }))}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">{t("pages.companysettings.uploading_logo.jsx-text", { defaultValue: "Uploading logo..." })}</span>
                  )}
                </div>
              </Field>
              <Field
                label={t("pages.companysettings.brand_color.attr_label", { defaultValue: "Brand color" })}
                hint={t("pages.companysettings.sets_the_hue_for_the_compan.attr_hint", { defaultValue: "Sets the hue for the company icon. Leave empty for auto-generated color." })}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder={t("pages.companysettings.auto.attr_placeholder", { defaultValue: "Auto" })}
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      {t("pages.companysettings.clear.jsx-text", { defaultValue: "\n                      Clear\n                    " })}</Button>
                  )}
                </div>
              </Field>
              <Field
                label={t("pages.companysettings.attachment_size_limit.attr_label", { defaultValue: "Attachment size limit" })}
                hint={t("pages.companysettings.accepted_range_1_max_mib.attr_hint", { max: MAX_COMPANY_ATTACHMENT_MAX_MIB, defaultValue: "Accepted range: 1-{{max}} MiB." })}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_COMPANY_ATTACHMENT_MAX_MIB}
                      step={1}
                      value={attachmentMaxMiB}
                      onChange={(e) => setAttachmentMaxMiB(e.target.value)}
                      className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    />
                    <span className="text-xs text-muted-foreground">{t("pages.companysettings.mib.jsx-text", { defaultValue: "MiB" })}</span>
                  </div>
                  {!attachmentMaxValid && (
                    <span className="text-xs text-destructive">
                      {t("pages.companysettings.enter_a_whole_number_from_1_to.jsx-text", { defaultValue: "\n                      Enter a whole number from 1 to " })}{MAX_COMPANY_ATTACHMENT_MAX_MIB}.
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim() || !attachmentMaxValid}
          >
            {generalMutation.isPending
              ? t("pages.companysettings.saving.jsx-text", { defaultValue: "Saving..." })
              : t("pages.companysettings.save_changes.jsx-text", { defaultValue: "Save changes" })}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">{t("pages.companysettings.saved.jsx-text", { defaultValue: "Saved" })}</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : t("pages.companysettings.failed_to_save.jsx-text", { defaultValue: "Failed to save" })}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="space-y-4" data-testid="company-settings-team-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("pages.companysettings.hiring.jsx-text", { defaultValue: "\n          Hiring\n        " })}</div>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label={t("pages.companysettings.require_board_approval_for_new_h.attr_label", { defaultValue: "Require board approval for new hires" })}
            hint={t("pages.companysettings.new_agent_hires_stay_pending.attr_hint", { defaultValue: "New agent hires stay pending until approved by board." })}
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
            toggleTestId="company-settings-team-approval-toggle"
          />
        </div>
      </div>

      {/* Import / Export */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("pages.companysettings.company_packages.jsx-text", { defaultValue: "\n          Company Packages\n        " })}</div>
        <div className="rounded-md border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t("pages.companysettings.import_and_export_have_moved_to_.jsx-text", { defaultValue: "\n            Import and export have moved to dedicated pages accessible from the" })}{" "}
            <a href="/org" className="underline hover:text-foreground">{t("pages.companysettings.org_chart.jsx-text", { defaultValue: "Org Chart" })}</a> {t("pages.companysettings.header.jsx-text", { defaultValue: " header.\n          " })}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {cloudSyncEnabled ? (
              <Button size="sm" asChild>
                <a href="/company/settings/cloud-upstream">
                  <CloudUpload className="mr-1.5 h-3.5 w-3.5" />
                  {t("pages.companysettings.send_to_paperclip_cloud.jsx-text", { defaultValue: "\n                  Send to Paperclip Cloud\n                " })}</a>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <a href="/company/export">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("pages.companysettings.export.jsx-text", { defaultValue: "\n                Export\n              " })}</a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/company/import">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t("pages.companysettings.import.jsx-text", { defaultValue: "\n                Import\n              " })}</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          {t("pages.companysettings.danger_zone.jsx-text", { defaultValue: "\n          Danger Zone\n        " })}</div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t("pages.companysettings.archive_this_company_to_hide_it_.jsx-text", { defaultValue: "\n            Archive this company to hide it from the sidebar. This persists in the database.\n          " })}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  t("pages.companysettings.archive_company_confirm", { name: selectedCompany.name, defaultValue: "Archive company \"{{name}}\"? It will be hidden from the sidebar." })
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? t("pages.companysettings.archiving.jsx-text", { defaultValue: "Archiving..." })
                : selectedCompany.status === "archived"
                ? t("pages.companysettings.already_archived.jsx-text", { defaultValue: "Already archived" })
                : t("pages.companysettings.archive_company.jsx-text", { defaultValue: "Archive company" })}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : t("pages.companysettings.failed_to_archive_company.jsx-text", { defaultValue: "Failed to archive company" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
