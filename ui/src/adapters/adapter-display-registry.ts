/**
 * Single source of truth for adapter display metadata.
 *
 * Built-in adapters have entries in `adapterDisplayMap`. External (plugin)
 * adapters get sensible defaults derived from their type string via
 * `getAdapterDisplay()`.
 */
import type { ComponentType } from "react";
import {
  Bot,
  Code,
  Gem,
  MousePointer2,
  Sparkles,
  Terminal,
  Cpu,
} from "lucide-react";
import { OpenCodeLogoIcon } from "@/components/OpenCodeLogoIcon";
import { HermesIcon } from "@/components/HermesIcon";
import { t as translate } from "@/i18n";

// ---------------------------------------------------------------------------
// Type suffix parsing
// ---------------------------------------------------------------------------

const TYPE_SUFFIXES: Record<string, string> = {
  _local: "local",
  _gateway: "gateway",
};

function getTypeSuffix(type: string): string | null {
  for (const [suffix, mode] of Object.entries(TYPE_SUFFIXES)) {
    if (type.endsWith(suffix)) return mode;
  }
  return null;
}

function withSuffix(label: string, suffix: string | null): string {
  return suffix ? `${label} (${suffix})` : label;
}

// ---------------------------------------------------------------------------
// Display metadata per adapter type
// ---------------------------------------------------------------------------

type TranslateFn = typeof translate;

export interface AdapterDisplayInfo {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  recommended?: boolean;
  comingSoon?: boolean;
  disabledLabel?: string;
  experimental?: boolean;
  hideFromVisualSelection?: boolean;
}

type AdapterDisplayEntry = Omit<AdapterDisplayInfo, "description" | "disabledLabel">;

const adapterDisplayMap: Record<string, AdapterDisplayEntry> = {
  acpx_local: {
    label: "ACPX",
    icon: Bot,
    experimental: true,
    hideFromVisualSelection: true,
  },
  claude_local: {
    label: "Claude Code",
    icon: Sparkles,
    recommended: true,
  },
  codex_local: {
    label: "Codex",
    icon: Code,
    recommended: true,
  },
  gemini_local: {
    label: "Gemini CLI",
    icon: Gem,
  },
  grok_local: {
    label: "Grok Build",
    icon: Bot,
  },
  opencode_local: {
    label: "OpenCode",
    icon: OpenCodeLogoIcon,
  },
  hermes_local: {
    label: "Hermes Agent",
    icon: HermesIcon,
  },
  pi_local: {
    label: "Pi",
    icon: Terminal,
  },
  cursor: {
    label: "Cursor",
    icon: MousePointer2,
  },
  cursor_cloud: {
    label: "Cursor Cloud",
    icon: MousePointer2,
  },
  openclaw_gateway: {
    label: "OpenClaw Gateway",
    icon: Bot,
    comingSoon: true,
    hideFromVisualSelection: true,
  },
  process: {
    label: "Process",
    icon: Cpu,
    comingSoon: true,
  },
  http: {
    label: "HTTP",
    icon: Cpu,
    comingSoon: true,
  },
};

function adapterDescription(type: string, suffix: string | null, t: TranslateFn): string {
  switch (type) {
    case "acpx_local":
      return t("adapters.display.acpx_local.description", { defaultValue: "Experimental local ACPX multi-agent adapter" });
    case "claude_local":
      return t("adapters.display.claude_local.description", { defaultValue: "Local Claude agent" });
    case "codex_local":
      return t("adapters.display.codex_local.description", { defaultValue: "Local Codex agent" });
    case "gemini_local":
      return t("adapters.display.gemini_local.description", { defaultValue: "Local Gemini agent" });
    case "grok_local":
      return t("adapters.display.grok_local.description", { defaultValue: "Local Grok Build agent" });
    case "opencode_local":
      return t("adapters.display.opencode_local.description", { defaultValue: "Local multi-provider agent" });
    case "hermes_local":
      return t("adapters.display.hermes_local.description", { defaultValue: "Local Hermes CLI agent" });
    case "pi_local":
      return t("adapters.display.pi_local.description", { defaultValue: "Local Pi agent" });
    case "cursor":
      return t("adapters.display.cursor.description", { defaultValue: "Local Cursor agent" });
    case "cursor_cloud":
      return t("adapters.display.cursor_cloud.description", { defaultValue: "Managed remote Cursor agent" });
    case "openclaw_gateway":
      return t("adapters.display.openclaw_gateway.description", { defaultValue: "External gateway adapter" });
    case "process":
      return t("adapters.display.process.description", { defaultValue: "Internal process adapter" });
    case "http":
      return t("adapters.display.http.description", { defaultValue: "Internal HTTP adapter" });
    default:
      return suffix
        ? t("adapters.display.external_with_suffix.description", { defaultValue: "External {{suffix}} adapter", suffix })
        : t("adapters.display.external.description", { defaultValue: "External adapter" });
  }
}

export function getAdapterDescription(type: string, t: TranslateFn = translate): string {
  return adapterDescription(type, getTypeSuffix(type), t);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function humanizeType(type: string): string {
  // Strip known type suffixes so "droid_local" → "Droid", not "Droid Local"
  let base = type;
  for (const suffix of Object.keys(TYPE_SUFFIXES)) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAdapterLabel(type: string): string {
  const base = adapterDisplayMap[type]?.label ?? humanizeType(type);
  return withSuffix(base, getTypeSuffix(type));
}

export function getAdapterLabels(): Record<string, string> {
  const suffixed: Record<string, string> = {};
  for (const [type, info] of Object.entries(adapterDisplayMap)) {
    suffixed[type] = withSuffix(info.label, getTypeSuffix(type));
  }
  return suffixed;
}

export function getAdapterDisplay(type: string, t: TranslateFn = translate): AdapterDisplayInfo {
  const known = adapterDisplayMap[type];
  const suffix = getTypeSuffix(type);
  if (known) {
    return {
      ...known,
      description: adapterDescription(type, suffix, t),
      disabledLabel: type === "openclaw_gateway"
        ? t("adapters.display.openclaw_gateway.disabled_label", { defaultValue: "Invite external agents from the add-agent modal" })
        : undefined,
    };
  }

  const label = withSuffix(humanizeType(type), suffix);
  return {
    label,
    description: adapterDescription(type, suffix, t),
    icon: Cpu,
  };
}

export function isKnownAdapterType(type: string): boolean {
  return type in adapterDisplayMap;
}
