import type { AdapterConfigFieldsProps } from "../types";
import { useTranslation } from "@/i18n";
import {
  Field,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function formatArgList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }
  return typeof value === "string" ? value : "";
}

function parseCommaArgs(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProcessConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
const { t } = useTranslation();

  return (
    <>
      <Field label={t("misc.config_fields.command.attr_label", { defaultValue: "Command" })} hint={help.command}>
        <DraftInput
          value={
            isCreate
              ? values!.command
              : eff("adapterConfig", "command", String(config.command ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ command: v })
              : mark("adapterConfig", "command", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder={t("misc.config_fields.e_g_node_python.attr_placeholder", { defaultValue: "e.g. node, python" })}
        />
      </Field>
      <Field label={t("misc.config_fields.args_comma_separated.attr_label", { defaultValue: "Args (comma-separated)" })} hint={help.args}>
        <DraftInput
          value={
            isCreate
              ? values!.args
              : eff("adapterConfig", "args", formatArgList(config.args))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ args: v })
              : mark(
                  "adapterConfig",
                  "args",
                  v ? parseCommaArgs(v) : undefined,
                )
          }
          immediate
          className={inputClass}
          placeholder={t("misc.config_fields.e_g_script_js_flag.attr_placeholder", { defaultValue: "e.g. script.js, --flag" })}
        />
      </Field>
    </>
  );
}
