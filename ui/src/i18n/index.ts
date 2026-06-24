import i18n, { type InitOptions, type TOptions } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  i18nextResources,
  isSupportedLocale,
  supportedLocales,
} from "./locales";

const DEFAULT_LOCALE_MIGRATION_KEY = "paperclip.locale.default.zh-CN.v1";

function migrateStoredDefaultLocale() {
  if (typeof window === "undefined") return;
  try {
    const migrated = window.localStorage.getItem(DEFAULT_LOCALE_MIGRATION_KEY);
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!migrated && (!stored || stored === "en")) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, DEFAULT_LOCALE);
      window.localStorage.setItem(DEFAULT_LOCALE_MIGRATION_KEY, "true");
      if (typeof document !== "undefined") {
        document.documentElement.lang = DEFAULT_LOCALE;
      }
      return;
    }
    if (!migrated) {
      window.localStorage.setItem(DEFAULT_LOCALE_MIGRATION_KEY, "true");
    }
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

migrateStoredDefaultLocale();

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales as string[],
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  detection: {
    order: ["localStorage", "navigator", "htmlTag"],
    lookupLocalStorage: LOCALE_STORAGE_KEY,
    // No automatic cache write: setLocale handles persistence itself and
    // can swallow write failures; the detector's own cache write would
    // abort changeLanguage if storage is unavailable.
    caches: [],
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(i18nextOptions)
  .catch((error: unknown) => {
    console.error("Failed to initialize i18next", error);
  });

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

/**
 * Switch the active locale, persist the choice to localStorage, and
 * keep <html lang> in sync. The detector writes localStorage on its
 * own during changeLanguage, so we keep the same key (paperclip.locale)
 * for both and tolerate write failures.
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isSupportedLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage may be unavailable in restricted contexts; the
    // detector below will also fail silently in that case.
  }
  try {
    await i18n.changeLanguage(locale);
  } catch (error) {
    console.error("Failed to switch locale", error);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
export { DEFAULT_LOCALE, supportedLocales, isSupportedLocale, localeDisplayName } from "./locales";
