import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  localeDisplayName,
  supportedLocales,
  type SupportedLocale,
} from "@/i18n/locales";
import { setLocale } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();
  const [current, setCurrent] = useState<SupportedLocale>(
    (i18n.language as SupportedLocale) ?? "en",
  );

  useEffect(() => {
    const sync = (lng: string | undefined) => {
      if (typeof lng === "string" && supportedLocales.includes(lng as SupportedLocale)) {
        setCurrent(lng as SupportedLocale);
      }
    };
    sync(i18n.language);
    i18n.on("languageChanged", sync);
    return () => {
      i18n.off("languageChanged", sync);
    };
  }, [i18n]);

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        void setLocale(value);
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-8 w-[140px] text-xs"
        aria-label={t("common.chooseLanguage", { defaultValue: "Choose interface language" })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {supportedLocales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {localeDisplayName(locale, current)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
