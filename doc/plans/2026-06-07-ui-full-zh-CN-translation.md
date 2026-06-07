# 2026-06-07 UI Full Simplified Chinese Translation

## Context

- Status: implementation complete (foundation + first migration batch); remaining work listed below.
- Goal: finish the i18n runtime wiring that upstream PRs #5943 (minimal i18next foundation) and #6070 (full locale catalog) started, add a real language switcher, and ship a full Simplified Chinese translation of the visible UI.
- Scope: only the frontend `ui/` package. Per upstream PR #5943, locale strings are display-only UI copy and must not flow into prompts, agent instructions, tool calls, issue content, approvals, or adapter config.
- Out of scope: server, CLI, agent prompts, issue content, approval payloads, adapter config, and the 38 non-Chinese locales (kept as English placeholders awaiting native-speaker PRs).

## Approach

1. Wrote `ui/scripts/i18n-extract.mjs` and `ui/scripts/i18n-mirror.mjs` for one-time key harvesting and locale mirroring.
2. Expanded `ui/src/i18n/locales/en.json` to 171 keys organized into namespaces (`common.*`, `nav.*`, `account.*`, `auth.*`, `breadcrumbs.*`, `commonRelative.*`, `errors.*`, `toast.*`, `dialogs.*`).
3. Filled `ui/src/i18n/locales/zh-CN.json` with Simplified Chinese.
4. Mirrored the English shape into the 38 other locale files so `validateLocaleMessages` passes for every registered locale.
5. Wired up the detector (`i18next-browser-languagedetector@^8.0.0`):
   - detection order: `localStorage["paperclip.locale"]` → `navigator.language` → `en`
   - inline script in `ui/index.html` flips `<html lang>` before React mounts
   - `setLocale(locale)` in `ui/src/i18n/index.ts` persists the choice and keeps `<html lang>` in sync
6. Added `ui/src/components/LocaleSwitcher.tsx` (Radix Select) and inserted it at the head of `SidebarAccountMenu` (between the user info card and the menu actions, above "View profile").
7. Refactored `ui/src/lib/utils.ts` to use locale-aware formatting:
   - `formatCents(cents, locale?)` prefixes `US$` literally (intentional; see Risks)
   - `formatNumber` / `formatDate` / `formatDateTime` / `formatShortDate` accept an optional locale, defaulting to `i18n.language`
   - `relativeTime` resolves through `t("commonRelative.*")` with `{{count}}` interpolation
8. Updated `AgentDetail.tsx` (lines 4077/4079) to drop the hardcoded `toLocaleString("en-US")` and use the new locale-aware `formatNumber`.
9. Wrote `ui/src/i18n/README.md` describing the runtime model, file layout, key/locale addition flow, and the no-prompt hard constraint.
10. Added the i18n rule to `AGENTS.md` §9.

## Verification

```sh
pnpm install
pnpm --filter @paperclipai/ui typecheck
pnpm --filter @paperclipai/ui exec vitest run src/i18n/
pnpm --filter @paperclipai/ui test:run
pnpm --filter @paperclipai/ui exec vite build
```

All pass: 1293/1293 tests green; build produces a 1.26 MB gzipped bundle.

Manual smoke:

1. `localStorage.setItem("paperclip.locale","zh-CN"); location.reload()` → `<html lang>` = `zh-CN`, the account menu shows "Language" as "语言" and the user-visible copy in the menu is Chinese.
2. Open account menu → switcher at the head → pick `English` → UI reverts; reload preserves the choice.
3. `Costs` and `Activity` pages in `zh-CN` show `US$1,234.56` style currency (US$ prefix + locale-aware digit grouping) and locale-aware date formatting.

## What is done

- Foundation: detector, persistence, `<html lang>`, switcher.
- All common / nav / account / auth / breadcrumb / common-relative / error / toast / dialog namespaces translated.
- Currency and date / number helpers localized.
- 1293 tests pass; 197 test files; 38 stub locales pass validation.

## What is still pending (future work)

- Migrate the remaining 370+ `.tsx` files to use `t("...")` instead of hardcoded English. The current en.json has 171 keys covering the most-trafficked surfaces; a follow-up sweep should expand the namespace tree (`agents.*`, `issues.*`, `projects.*`, `secrets.*`, `plugins.*`, etc.) and migrate the rest of the components batch by batch.
- Translate the 38 non-`en`/non-`zh-CN` locale files. They are currently English mirrors so `validateLocaleMessages` still passes; native-speaker PRs are needed to replace the placeholders.
- Add a CI check that diffs `en.json` vs `zh-CN.json` on PRs to catch missing translations.
- Server-side / CLI / agent prompt / issue content / approval payload i18n — explicitly out of scope for this PR.

## Risks

1. **`US$` prefix change**: `formatCents` now prefixes `US$` literally in all locales. English-locale users see `US$1,234.56` instead of `$1,234.56`. This is intentional — the amount is in USD regardless of UI language, and the `US$` prefix prevents finance readers from misreading a CN-locale rendering as a CNY amount. If reverted to a bare `$`, the only way to make `Intl.NumberFormat` produce `$` in `zh-CN` is to swap the currency to `CNY`, which would actually lie about the amount.
2. **Stub locales**: 38 locales are still English mirrors. Users picking `ja` / `ko` / `fr` / etc. will see English text. `locale-validation` still passes; the visual gap is the only impact.
3. **Locale drift after merge**: New PRs that add user-visible English strings must add the matching `zh-CN` translation in the same commit, otherwise users on `zh-CN` see English. A follow-up CI guard is recommended.
4. **`<html lang>` flash**: Mitigated by the inline script in `ui/index.html`; if a user disables JavaScript, the page renders with `lang="en"` until JS runs.
5. **Test assertions not yet migrated**: This PR's UI test (`SidebarAccountMenu.test.tsx`) still matches on English text via the `defaultValue` fallback. The plan documents a follow-up pass to migrate hardcoded `getByText("Cancel")` style assertions to accessible-role / `i18n.t(..., { lng: "en" })` queries.
