// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setLocale, t } from ".";
import zhCN from "./locales/zh-CN.json";
import { LOCALE_STORAGE_KEY, localeDisplayName, normalizeNavigatorLanguage, supportedLocales } from "./locales";

describe("i18n runtime", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {}
    document.documentElement.lang = "en";
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
    try {
      window.localStorage.clear();
    } catch {}
    document.documentElement.lang = "en";
  });

  it("ships Simplified Chinese by default", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(t("app.noCompanies.title")).toBe(zhCN.app.noCompanies.title);
    expect(t("common.cancel")).toBe(zhCN.common.cancel);
  });

  it("switches to Simplified Chinese and syncs <html lang>", async () => {
    await setLocale("zh-CN");
    expect(i18n.language).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(t("common.cancel")).toBe("取消");
    expect(t("nav.issues")).toBe("任务");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
  });

  it("rejects unsupported locales without mutating state", async () => {
    const before = i18n.language;
    await expect(setLocale("xx-YY")).rejects.toThrow("Unsupported locale");
    expect(i18n.language).toBe(before);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("tolerates localStorage write failures", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    try {
      await setLocale("zh-CN");
      expect(i18n.language).toBe("zh-CN");
      expect(document.documentElement.lang).toBe("zh-CN");
    } finally {
      setItem.mockRestore();
    }
  });

  it("exposes supported locales for the switcher", () => {
    expect(supportedLocales).toContain("en");
    expect(supportedLocales).toContain("zh-CN");
    expect(supportedLocales).toHaveLength(2);
  });

  it("renders a human-readable label for each supported locale", () => {
    for (const locale of supportedLocales) {
      const label = localeDisplayName(locale);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
    // Intl.DisplayNames is locale-dependent; we only assert the
    // Chinese region label contains the language name.
    const zhLabel = localeDisplayName("zh-CN");
    expect(zhLabel).toContain("中文");
  });

  it("normalizes navigator language values to supported locales", () => {
    expect(normalizeNavigatorLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeNavigatorLanguage("en-US")).toBe("en");
    expect(normalizeNavigatorLanguage("pt-BR")).toBeNull();
    expect(normalizeNavigatorLanguage(null)).toBeNull();
    expect(normalizeNavigatorLanguage("xx-YY")).toBeNull();
  });
});
