import { useState } from "react";
import { useTranslation } from "@/i18n";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";
import {
  PayloadTemplateJsonField,
  RuntimeServicesJsonField,
} from "../runtime-json-fields";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
const { t } = useTranslation();

  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

function parseScopes(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join(", ");
  }
  return typeof value === "string" ? value : "";
}

export function OpenClawGatewayConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
const { t } = useTranslation();

  const configuredHeaders =
    config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)
      ? (config.headers as Record<string, unknown>)
      : {};
  const effectiveHeaders =
    (eff("adapterConfig", "headers", configuredHeaders) as Record<string, unknown>) ?? {};

  const effectiveGatewayToken = typeof effectiveHeaders["x-openclaw-token"] === "string"
    ? String(effectiveHeaders["x-openclaw-token"])
    : typeof effectiveHeaders["x-openclaw-auth"] === "string"
      ? String(effectiveHeaders["x-openclaw-auth"])
      : "";

  const commitGatewayToken = (rawValue: string) => {
    const nextValue = rawValue.trim();
    const nextHeaders: Record<string, unknown> = { ...effectiveHeaders };
    if (nextValue) {
      nextHeaders["x-openclaw-token"] = nextValue;
      delete nextHeaders["x-openclaw-auth"];
    } else {
      delete nextHeaders["x-openclaw-token"];
      delete nextHeaders["x-openclaw-auth"];
    }
    mark("adapterConfig", "headers", Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined);
  };

  const sessionStrategy = eff(
    "adapterConfig",
    "sessionKeyStrategy",
    String(config.sessionKeyStrategy ?? "fixed"),
  );

  return (
    <>
      <Field label={t("misc.config_fields.gateway_url.attr_label", { defaultValue: "Gateway URL" })} hint={help.webhookUrl}>
        <DraftInput
          value={
            isCreate
              ? values!.url
              : eff("adapterConfig", "url", String(config.url ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ url: v })
              : mark("adapterConfig", "url", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder={t("misc.config_fields.ws_127_0_0_1_18789.attr_placeholder", { defaultValue: "ws://127.0.0.1:18789" })}
        />
      </Field>

      <PayloadTemplateJsonField
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
      />

      <RuntimeServicesJsonField
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
      />

      {!isCreate && (
        <>
          <Field label={t("misc.config_fields.paperclip_api_url_override.attr_label", { defaultValue: "Paperclip API URL override" })}>
            <DraftInput
              value={
                eff(
                  "adapterConfig",
                  "paperclipApiUrl",
                  String(config.paperclipApiUrl ?? ""),
                )
              }
              onCommit={(v) => mark("adapterConfig", "paperclipApiUrl", v || undefined)}
              immediate
              className={inputClass}
              placeholder="https://paperclip.example"
            />
          </Field>

          <Field label={t("misc.config_fields.claimed_api_key_path.attr_label", { defaultValue: "Claimed API key path" })}>
            <DraftInput
              value={eff("adapterConfig", "claimedApiKeyPath", String(config.claimedApiKeyPath ?? ""))}
              onCommit={(v) => mark("adapterConfig", "claimedApiKeyPath", v || undefined)}
              immediate
              className={inputClass}
              placeholder={t("misc.config_fields.openclaw_workspace_paperclip_cla.attr_placeholder", { defaultValue: "~/.openclaw/workspace/paperclip-claimed-api-key.json" })}
            />
          </Field>

          <Field label={t("misc.config_fields.session_strategy.attr_label", { defaultValue: "Session strategy" })}>
            <select
              value={sessionStrategy}
              onChange={(e) => mark("adapterConfig", "sessionKeyStrategy", e.target.value)}
              className={inputClass}
            >
              <option value="fixed">{t("misc.config_fields.fixed.jsx-text", { defaultValue: "Fixed" })}</option>
              <option value="issue">{t("misc.config_fields.per_issue.jsx-text", { defaultValue: "Per issue" })}</option>
              <option value="run">{t("misc.config_fields.per_run.jsx-text", { defaultValue: "Per run" })}</option>
            </select>
          </Field>

          {sessionStrategy === "fixed" && (
            <Field label={t("misc.config_fields.session_key.attr_label", { defaultValue: "Session key" })}>
              <DraftInput
                value={eff("adapterConfig", "sessionKey", String(config.sessionKey ?? "paperclip"))}
                onCommit={(v) => mark("adapterConfig", "sessionKey", v || undefined)}
                immediate
                className={inputClass}
                placeholder={t("misc.config_fields.paperclip.attr_placeholder", { defaultValue: "paperclip" })}
              />
            </Field>
          )}

          <SecretField
            label={t("misc.config_fields.gateway_auth_token_x_openclaw_to.attr_label", { defaultValue: "Gateway auth token (x-openclaw-token)" })}
            value={effectiveGatewayToken}
            onCommit={commitGatewayToken}
            placeholder={t("misc.config_fields.openclaw_gateway_token.attr_placeholder", { defaultValue: "OpenClaw gateway token" })}
          />

          <Field label={t("misc.config_fields.role.attr_label", { defaultValue: "Role" })}>
            <DraftInput
              value={eff("adapterConfig", "role", String(config.role ?? "operator"))}
              onCommit={(v) => mark("adapterConfig", "role", v || undefined)}
              immediate
              className={inputClass}
              placeholder={t("misc.config_fields.operator.attr_placeholder", { defaultValue: "operator" })}
            />
          </Field>

          <Field label={t("misc.config_fields.scopes_comma_separated.attr_label", { defaultValue: "Scopes (comma-separated)" })}>
            <DraftInput
              value={eff("adapterConfig", "scopes", parseScopes(config.scopes ?? ["operator.admin"]))}
              onCommit={(v) => {
                const parsed = v
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean);
                mark("adapterConfig", "scopes", parsed.length > 0 ? parsed : undefined);
              }}
              immediate
              className={inputClass}
              placeholder={t("misc.config_fields.operator_admin.attr_placeholder", { defaultValue: "operator.admin" })}
            />
          </Field>

          <Field label={t("misc.config_fields.wait_timeout_ms.attr_label", { defaultValue: "Wait timeout (ms)" })}>
            <DraftInput
              value={eff("adapterConfig", "waitTimeoutMs", String(config.waitTimeoutMs ?? "120000"))}
              onCommit={(v) => {
                const parsed = Number.parseInt(v.trim(), 10);
                mark(
                  "adapterConfig",
                  "waitTimeoutMs",
                  Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
                );
              }}
              immediate
              className={inputClass}
              placeholder="120000"
            />
          </Field>

          <Field label={t("misc.config_fields.device_auth.attr_label", { defaultValue: "Device auth" })}>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {t("misc.config_fields.always_enabled_for_gateway_agent.jsx-text", { defaultValue: "\n              Always enabled for gateway agents. Paperclip persists a device key during onboarding so pairing approvals remain stable across runs.\n            " })}</div>
          </Field>
        </>
      )}
    </>
  );
}
