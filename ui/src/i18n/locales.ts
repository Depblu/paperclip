import type { Resource } from "i18next";

import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "zh-CN" as const;
export const LOCALE_STORAGE_KEY = "paperclip.locale";

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages) as SupportedLocale[];

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages & string;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && value in localeMessages;
}

/** Human-readable locale label using Intl.DisplayNames. */
export function localeDisplayName(locale: string, inLocale?: string): string {
  try {
    const display = new Intl.DisplayNames([inLocale ?? locale], { type: "language" });
    const name = display.of(locale);
    return name ?? locale;
  } catch {
    return locale;
  }
}

/**
 * Best-effort fallback chain for navigator language values like
 * "zh-Hans-CN" → "zh-CN", "en-US" → "en".
 */
export function normalizeNavigatorLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed: string = raw.trim();
  if (!trimmed) return null;
  if (isSupportedLocale(trimmed)) return trimmed;
  // Compute lower on a non-narrowed value to avoid TS narrowing
  // the input to `never` after the supported-locale check.
  const lower: string = String(trimmed).toLowerCase();
  // Walk the suffix chain: zh-Hans-CN → zh-Hans → zh
  for (const candidate of lower.split("-")) {
    if (isSupportedLocale(candidate)) return candidate;
  }
  // Handle composite region tags: pt-BR, zh-CN, zh-TW
  const parts = lower.split("-");
  if (parts.length >= 2) {
    const lang = parts[0] ?? "";
    const region = parts[parts.length - 1] ?? "";
    if (lang && region) {
      const composite = `${lang}-${region.toUpperCase()}`;
      if (isSupportedLocale(composite)) return composite;
    }
  }
  return null;
}

/**
 * SSR-safe initial locale resolver. Order: explicit stored preference,
 * then navigator.language, then DEFAULT_LOCALE. Used by the inline
 * script in index.html before React mounts.
 */
export function resolveInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
    const fromNavigator = normalizeNavigatorLanguage(window.navigator?.language);
    if (fromNavigator && isSupportedLocale(fromNavigator)) return fromNavigator;
  } catch {
    // localStorage may be unavailable in sandboxed contexts
  }
  return DEFAULT_LOCALE;
}
