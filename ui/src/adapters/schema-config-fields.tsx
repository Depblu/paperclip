import { Fragment, useState, useEffect, useRef, useCallback } from "react";

import type { AdapterConfigSchema, ConfigFieldSchema, CreateConfigValues } from "@paperclipai/adapter-utils";

import type { AdapterConfigFieldsProps } from "./types";
import { agentsApi, type AdapterConfigRemoteOption } from "../api/agents";
import {
  Field,
  DraftInput,
  DraftNumberInput,
  DraftTextarea,
  ToggleField,
} from "../components/agent-config-primitives";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ChevronDown } from "lucide-react";

// ── Select field (extracted to keep hooks at component top level) ──────
function SelectField({
  value,
  options,
  onChange,
  loading,
  disabled,
}: {
  value: string;
  options: Array<{ value: string; label: string; description?: string | null }>;
  onChange: (value: string, option?: { value: string; label: string; setConfig?: Record<string, unknown> }) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedOpt = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
        >
          <span className={!value ? "text-muted-foreground" : ""}>
            {loading ? "Loading..." : selectedOpt?.label ?? value ?? "Select..."}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
        {options.map((opt) => (
          <button
            key={opt.value}
            className={`flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50 ${opt.value === value ? "bg-accent" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(opt.value, opt);
              setOpen(false);
            }}
          >
            <span className="truncate">{opt.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";


// ---------------------------------------------------------------------------
// Combobox: type-to-filter dropdown with free text fallback
// ---------------------------------------------------------------------------

function ComboboxField({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: { label: string; value: string; group?: string }[];
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync filter with external value when it changes (e.g. provider switch resets model)
  useEffect(() => {
    setFilter("");
  }, [value]);

  const filtered = options.filter((opt) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      opt.value.toLowerCase().includes(q) ||
      opt.label.toLowerCase().includes(q) ||
      (opt.group && opt.group.toLowerCase().includes(q))
    );
  });

  const selectedOpt = options.find((o) => o.value === value);
  const displayValue = filter || selectedOpt?.value || value || "";

  // Group filtered options by `group` field if present
  const grouped = new Map<string, typeof filtered>();
  for (const opt of filtered) {
    const g = opt.group ?? "";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(opt);
  }

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setFilter("");
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If exactly one match, select it. Otherwise commit the typed value.
      if (filtered.length === 1) {
        select(filtered[0].value);
      } else if (filter) {
        select(filter);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setFilter("");
    } else if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-0">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 rounded-l-md border border-r-0 border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 focus:z-10"
          value={displayValue}
          placeholder={placeholder ?? "Type or select..."}
          onChange={(e) => {
            setFilter(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!open) setOpen(true);
          }}
          onBlur={() => {
            // Delay close to allow click on option to register
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />
        <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="rounded-r-md border border-border px-2 py-1.5 hover:bg-accent/50 transition-colors">
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="p-1 max-h-60 overflow-y-auto"
            style={{ minWidth: 280 }}
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {Array.from(grouped.entries()).map(([group, opts]) => (
              <div key={group || "_ungrouped"}>
                {group && (
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {group}
                  </div>
                )}
                {opts.map((opt) => (
                  <button
                    key={opt.value}
                    className={`flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50 ${
                      opt.value === value ? "bg-accent" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent input blur
                      select(opt.value);
                    }}
                  >
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            ))}
            {filter && filtered.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                Use &quot;{filter}&quot; as custom value (press Enter)
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SchemaConfigFields component
// ---------------------------------------------------------------------------

const schemaCache = new Map<string, AdapterConfigSchema | null>();
const schemaFetchInflight = new Map<string, Promise<AdapterConfigSchema | null>>();
const failedSchemaTypes = new Set<string>();

async function fetchConfigSchema(adapterType: string): Promise<AdapterConfigSchema | null> {
  const cached = schemaCache.get(adapterType);
  if (cached !== undefined) return cached;
  if (failedSchemaTypes.has(adapterType)) return null;

  const inflight = schemaFetchInflight.get(adapterType);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/adapters/${encodeURIComponent(adapterType)}/config-schema`);
      if (!res.ok) {
        failedSchemaTypes.add(adapterType);
        return null;
      }
      const schema = (await res.json()) as AdapterConfigSchema;
      schemaCache.set(adapterType, schema);
      return schema;
    } catch {
      failedSchemaTypes.add(adapterType);
      return null;
    } finally {
      schemaFetchInflight.delete(adapterType);
    }
  })();

  schemaFetchInflight.set(adapterType, promise);
  return promise;
}

export function invalidateConfigSchemaCache(adapterType: string): void {
  schemaCache.delete(adapterType);
  failedSchemaTypes.delete(adapterType);
}

export function readCachedConfigSchema(adapterType: string): AdapterConfigSchema | null {
  return schemaCache.get(adapterType) ?? null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useConfigSchema(adapterType: string): AdapterConfigSchema | null {
  const [schema, setSchema] = useState<AdapterConfigSchema | null>(
    schemaCache.get(adapterType) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchConfigSchema(adapterType).then((s) => {
      if (!cancelled) setSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, [adapterType]);

  return schema;
}

function isRemoteOptionsField(field: ConfigFieldSchema): boolean {
  const remoteOptions = field.meta?.remoteOptions;
  return Boolean(remoteOptions && typeof remoteOptions === "object" && !Array.isArray(remoteOptions));
}

function useRemoteOptions(input: {
  enabled: boolean;
  companyId?: string | null;
  adapterType: string;
  fieldKey: string;
  config: Record<string, unknown>;
}): { options: AdapterConfigRemoteOption[]; loading: boolean; error: string | null } {
  const [options, setOptions] = useState<AdapterConfigRemoteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configKey = JSON.stringify(input.config);

  useEffect(() => {
    if (!input.enabled || !input.companyId) {
      setOptions([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    agentsApi.adapterConfigOptions(input.companyId, input.adapterType, input.fieldKey, {
      adapterConfig: input.config,
    })
      .then((result) => {
        if (cancelled) return;
        setOptions(result.options ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setOptions([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.enabled, input.companyId, input.adapterType, input.fieldKey, configKey]);

  return { options, loading, error };
}

function RemoteSelectField({
  field,
  value,
  options,
  loading,
  error,
  onChange,
}: {
  field: ConfigFieldSchema;
  value: string;
  options: AdapterConfigRemoteOption[];
  loading: boolean;
  error: string | null;
  onChange: (value: string, option?: AdapterConfigRemoteOption) => void;
}) {
  const disabled = loading || options.length === 0;
  const hint = error ?? (options.length === 0 && !loading ? "No options available." : field.hint);
  return (
    <Field label={field.label} hint={hint}>
      <SelectField
        value={value}
        options={options}
        loading={loading}
        disabled={disabled}
        onChange={onChange}
      />
    </Field>
  );
}

function RemoteSelectWrapper({
  companyId,
  adapterType,
  field,
  value,
  config,
  onChange,
}: {
  companyId?: string | null;
  adapterType: string;
  field: ConfigFieldSchema;
  value: string;
  config: Record<string, unknown>;
  onChange: (value: string, option?: AdapterConfigRemoteOption) => void;
}) {
  const { options, loading, error } = useRemoteOptions({
    enabled: true,
    companyId,
    adapterType,
    fieldKey: field.key,
    config,
  });
  return (
    <RemoteSelectField
      field={field}
      value={value}
      options={options}
      loading={loading}
      error={error}
      onChange={onChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getDefaultValue(field: ConfigFieldSchema): unknown {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "toggle":
      return false;
    case "number":
      return undefined;
    case "text":
    case "textarea":
      return "";
    case "select":
      return field.options?.[0]?.value ?? "";
  }
}

export function fieldMatchesVisibleWhen(
  field: ConfigFieldSchema,
  readValue: (field: ConfigFieldSchema) => unknown,
  schema: AdapterConfigSchema,
): boolean {
  const visibleWhen = field.meta?.visibleWhen;
  if (!visibleWhen || typeof visibleWhen !== "object" || Array.isArray(visibleWhen)) return true;

  const condition = visibleWhen as {
    key?: unknown;
    value?: unknown;
    values?: unknown;
    notValues?: unknown;
  };
  if (typeof condition.key !== "string" || condition.key.length === 0) return true;

  const sourceField = schema.fields.find((candidate) => candidate.key === condition.key);
  if (!sourceField) return true;

  const actual = String(readValue(sourceField) ?? "");
  if (typeof condition.value === "string") return actual === condition.value;
  if (Array.isArray(condition.values)) {
    const values = condition.values.filter((value): value is string => typeof value === "string");
    return values.length > 0 && values.includes(actual);
  }
  if (Array.isArray(condition.notValues)) {
    const values = condition.notValues.filter((value): value is string => typeof value === "string");
    return !values.includes(actual);
  }
  return true;
}

export function getRemoteOptionConfigWrites(
  field: ConfigFieldSchema,
  value: string,
  option?: AdapterConfigRemoteOption,
): Record<string, unknown> {
  const writes: Record<string, unknown> = { [field.key]: value || undefined };
  if (option?.setConfig) {
    for (const [key, nextValue] of Object.entries(option.setConfig)) {
      writes[key] = nextValue;
    }
  }
  return writes;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaConfigFields({
  companyId,
  adapterType,
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  beforeField,
  hideField,
}: AdapterConfigFieldsProps) {
  const schema = useConfigSchema(adapterType);

  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (!schema || !isCreate || defaultsApplied) return;
    const defaults: Record<string, unknown> = {};
    for (const field of schema.fields) {
      const def = getDefaultValue(field);
      if (def !== undefined && def !== "") {
        defaults[field.key] = def;
      }
    }
    if (Object.keys(defaults).length > 0) {
      set?.({
        adapterSchemaValues: { ...values?.adapterSchemaValues, ...defaults },
      });
    }
    setDefaultsApplied(true);
  }, [schema, isCreate, defaultsApplied, set, values?.adapterSchemaValues]);

  if (!schema || schema.fields.length === 0) return null;
  const activeSchema = schema;

  function readValue(field: ConfigFieldSchema): unknown {
    if (field.key === "clawithAgentLink") {
      const tenantId = isCreate
        ? values?.adapterSchemaValues?.clawithTenantId
        : eff("adapterConfig", "clawithTenantId", config.clawithTenantId as string | undefined);
      const agentId = isCreate
        ? values?.adapterSchemaValues?.clawithAgentId
        : eff("adapterConfig", "clawithAgentId", config.clawithAgentId as string | undefined);
      if (typeof tenantId === "string" && typeof agentId === "string" && tenantId && agentId) {
        return `${tenantId}:${agentId}`;
      }
    }
    if (field.key === "nativeClawithAgentLink") {
      const agentId = isCreate
        ? values?.adapterSchemaValues?.clawithAgentId
        : eff("adapterConfig", "clawithAgentId", config.clawithAgentId as string | undefined);
      if (typeof agentId === "string" && agentId) return agentId;
    }
    if (isCreate) {
      return values?.adapterSchemaValues?.[field.key] ?? getDefaultValue(field);
    }
    const stored = config[field.key];
    return eff("adapterConfig", field.key, (stored ?? getDefaultValue(field)) as string);
  }

  function writeValue(field: ConfigFieldSchema, value: unknown): void {
    if (isCreate) {
      const next = {
        adapterSchemaValues: {
          ...values?.adapterSchemaValues,
          [field.key]: value,
        },
      };

      // When provider changes, auto-clear model if it's not in the new provider's list
      if (field.key === "provider" && schema) {
        const modelField = schema.fields.find((f) => f.key === "model");
        if (modelField?.meta?.providerModels) {
          const modelsByProvider = modelField.meta.providerModels as Record<string, string[]>;
          const providerModels = modelsByProvider[String(value)] ?? [];
          const currentModel = values?.adapterSchemaValues?.model;
          if (currentModel && String(value) !== "auto" && !providerModels.includes(String(currentModel))) {
            next.adapterSchemaValues.model = "";
          }
        }
      }

      set?.(next);
    } else {
      mark("adapterConfig", field.key, value);

      // Same logic for edit mode
      if (field.key === "provider" && schema) {
        const modelField = schema.fields.find((f) => f.key === "model");
        if (modelField?.meta?.providerModels) {
          const modelsByProvider = modelField.meta.providerModels as Record<string, string[]>;
          const providerModels = modelsByProvider[String(value)] ?? [];
          const currentModel = eff("adapterConfig", "model", "");
          if (currentModel && String(value) !== "auto" && !providerModels.includes(String(currentModel))) {
            mark("adapterConfig", "model", "");
          }
        }
      }
    }
  }

  function buildCurrentConfig(): Record<string, unknown> {
    if (isCreate) return { ...(values?.adapterSchemaValues ?? {}) };
    const next: Record<string, unknown> = { ...(config as Record<string, unknown>) };
    for (const field of activeSchema.fields) {
      next[field.key] = readValue(field);
    }
    return next;
  }

  function writeSelectValue(field: ConfigFieldSchema, value: string, option?: AdapterConfigRemoteOption): void {
    const writes = getRemoteOptionConfigWrites(field, value, option);
    for (const [key, nextValue] of Object.entries(writes)) {
      const target = activeSchema.fields.find((candidate) => candidate.key === key) ?? ({
        key,
        label: key,
        type: "text",
      } as ConfigFieldSchema);
      writeValue(target, nextValue);
    }
  }

  return (
    <>
      {schema.fields
        .filter((field) => fieldMatchesVisibleWhen(field, readValue, schema))
        .filter((field) => !hideField?.(field))
        .map((field) => {
          const before = beforeField?.({ field, readValue, writeValue, buildCurrentConfig });
          const wrap = (node: React.ReactNode) => (
            <Fragment key={field.key}>
              {before}
              {node}
            </Fragment>
          );
          switch (field.type) {
            case "select": {
              const currentVal = String(readValue(field) ?? "");
              if (isRemoteOptionsField(field)) {
                const currentConfig = buildCurrentConfig();
                return wrap(
                  <RemoteSelectWrapper
                    key={field.key}
                    companyId={companyId}
                    adapterType={adapterType}
                    field={field}
                    value={currentVal}
                    config={currentConfig}
                    onChange={(v, option) => writeSelectValue(field, v, option)}
                  />,
                );
              }
              return wrap(
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <SelectField
                    value={currentVal}
                    options={field.options ?? []}
                    onChange={(v) => writeValue(field, v)}
                  />
                </Field>,
              );
            }

            case "toggle":
              return wrap(
                <ToggleField
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  checked={readValue(field) === true}
                  onChange={(v) => writeValue(field, v)}
                />,
              );

            case "number":
              return wrap(
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <DraftNumberInput
                    value={Number(readValue(field) ?? 0)}
                    onCommit={(v) => writeValue(field, v)}
                    immediate
                    className={inputClass}
                  />
                </Field>,
              );

            case "textarea":
              return wrap(
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <DraftTextarea
                    value={String(readValue(field) ?? "")}
                    onCommit={(v) => writeValue(field, v || undefined)}
                    immediate
                  />
                </Field>,
              );

            case "combobox": {
              const currentVal = String(readValue(field) ?? "");
              // Dynamic options: if meta.providerModels exists, compute options
              // based on the current provider value
              let comboboxOptions = field.options ?? [];
              if (field.meta?.providerModels) {
                const providerVal = String(readValue(schema.fields.find((f) => f.key === "provider")!) ?? "auto");
                const modelsByProvider = field.meta.providerModels as Record<string, string[]>;
                if (providerVal === "auto") {
                  // Auto: show all models from all providers, grouped by provider
                  const providerLabel = schema.fields.find((f) => f.key === "provider");
                  const providerOptions = providerLabel?.options ?? [];
                  comboboxOptions = Object.entries(modelsByProvider).flatMap(([prov, models]) =>
                    models.map((m) => ({
                      label: m,
                      value: m,
                      group: providerOptions.find((p) => p.value === prov)?.label ?? prov,
                    })),
                  );
                } else {
                  const providerModels = modelsByProvider[providerVal] ?? [];
                  const providerLabel = schema.fields.find((f) => f.key === "provider");
                  const provName = providerLabel?.options?.find((p) => p.value === providerVal)?.label ?? providerVal;
                  comboboxOptions = providerModels.map((m) => ({
                    label: m,
                    value: m,
                    group: provName,
                  }));
                }
              }
              return wrap(
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <ComboboxField
                    value={currentVal}
                    options={comboboxOptions}
                    onChange={(v) => writeValue(field, v || undefined)}
                    placeholder={field.hint}
                  />
                </Field>,
              );
            }

            case "text":
            default:
              return wrap(
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <DraftInput
                    value={String(readValue(field) ?? "")}
                    onCommit={(v) => writeValue(field, v || undefined)}
                    immediate
                    className={inputClass}
                  />
                </Field>,
              );
          }
        })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Build adapter config from schema values + standard CreateConfigValues fields
// ---------------------------------------------------------------------------

export function buildSchemaAdapterConfig(
  values: CreateConfigValues,
): Record<string, unknown> {
  const ac: Record<string, unknown> = {};

  if (values.model?.trim()) ac.model = values.model.trim();
  if (values.cwd) ac.cwd = values.cwd;
  if (values.command) ac.command = values.command;
  if (values.instructionsFilePath) ac.instructionsFilePath = values.instructionsFilePath;
  if (values.thinkingEffort) ac.thinkingEffort = values.thinkingEffort;

  if (values.extraArgs) {
    ac.extraArgs = values.extraArgs
      .split(/\s+/)
      .filter(Boolean);
  }

  if (values.adapterSchemaValues) {
    Object.assign(ac, values.adapterSchemaValues);
  }

  return ac;
}
