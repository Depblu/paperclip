# Internationalization (i18n)

The Paperclip board UI is translated via [i18next](https://www.i18next.com/)
and [react-i18next](https://react.i18next.com/). The runtime is initialized
once at app boot from `ui/src/i18n/index.ts`; every other module imports
`useTranslation` or the `t` helper from there.

## Runtime model

- **Default locale**: `en` (also the fallback language).
- **Detection order**: `localStorage["paperclip.locale"]` → `navigator.language` → `DEFAULT_LOCALE`.
- **Persistence**: the active locale is written to `localStorage["paperclip.locale"]` whenever it changes. The detector is configured with `caches: []` because `setLocale()` in `ui/src/i18n/index.ts` does the persistence itself and tolerates write failures.
- **`<html lang>`**: the inline script in `ui/index.html` sets `<html lang>` before React mounts so screen readers and search engines see the right language on first paint. `setLocale()` keeps the attribute in sync at runtime.
- **Number / date formatting**: `ui/src/lib/utils.ts` reads the active locale from `i18n.language` to localize digit grouping and date formatting. The `US$` currency prefix in `formatCents` is intentional and locale-independent.

## File layout

```
ui/src/i18n/
  index.ts                 # i18next init, useTranslation, setLocale
  locales.ts               # locale registry, supportedLocales, helpers
  locale-validation.ts     # parity/safety checks for every locale file
  locale-validation.test.ts
  i18n-runtime.test.ts     # setLocale, detector, helpers
  locales/
    en.json                # SOURCE OF TRUTH for keys and structure
    zh-CN.json             # full Simplified Chinese translation
    ar.json, bn.json, ...  # English mirrors (await native-speaker PRs)
```

The English file is the single source of truth. Every other locale file
must mirror its structure exactly; `locale-validation.ts` enforces that
on every test run.

## Adding a new translation key

1. Add the key to **both** `ui/src/i18n/locales/en.json` and `ui/src/i18n/locales/zh-CN.json`. The validation harness rejects any locale file that drifts out of sync.
2. Mirror the new key to all other locale files (or run `node ui/scripts/i18n-mirror.mjs` to regenerate them from `en.json`).
3. Use it in a component:

   ```tsx
   import { useTranslation } from "@/i18n";

   function MyComponent() {
     const { t } = useTranslation();
     return <button>{t("common.cancel", { defaultValue: "Cancel" })}</button>;
   }
   ```

   `defaultValue` is the English fallback; it is also what the
   `locale-validation` test asserts against when English itself is the
   active locale.

4. If the value contains an interpolation placeholder (e.g. `{{name}}`),
   the same placeholder must appear in every locale file in the same
   position. The validator rejects drift.

5. Run `pnpm --filter @paperclipai/ui exec vitest run src/i18n/` to
   confirm all 39 locale files still pass validation.

## Adding a new locale

1. Create `ui/src/i18n/locales/<bcp47>.json` (e.g. `en-AU.json`,
   `fr-CA.json`) with the same structure as `en.json`. The 38 non-`en`
   locales currently in the registry are English placeholders, so you
   can copy `en.json` as a starting point.
2. Add the locale to the allowlist in the inline script at
   `ui/index.html` so `<html lang>` flips to it on first paint.
3. Run `pnpm --filter @paperclipai/ui exec vitest run src/i18n/` to
   confirm validation passes.

## Hard constraints (do not violate)

Per upstream commit `e2d7263b` (#5943), locale strings are **display-only UI
copy**. They must never flow into:

- agent prompts or system messages
- agent instructions, adapter config, or tool calls
- issue titles, comments, or descriptions
- approval payloads
- shell commands or any LLM-visible control path

If you need a translated string in a non-UI context, that is a different
problem and requires a new design review.

## Scripts

- `node ui/scripts/i18n-mirror.mjs` — regenerates every non-`en` and non-`zh-CN` locale file as an English mirror of `en.json`. Use after restructuring the key tree.
- `node ui/scripts/i18n-extract.mjs` — scans `ui/src/**/*.{ts,tsx}` and writes `ui/src/i18n/en-key-catalog.json` with candidate user-visible string literals. Review and hand-merge into `en.json`; do not auto-merge.
