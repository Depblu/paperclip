import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { Loader2, ShieldCheck, Terminal, TriangleAlert } from "lucide-react";
import { BOOTSTRAP_FALLBACK_COMMAND } from "@/bootstrapSetup";
import { Button } from "@/components/ui/button";

type LabFixtureKey =
  | "signed-out-private"
  | "signed-in-private"
  | "claiming"
  | "claim-error"
  | "claim-success"
  | "public-invite-only";

const FIXTURE_LABELS: Record<LabFixtureKey, string> = {
  "signed-out-private": "1 · authenticated/private — signed out (browser claim available)",
  "signed-in-private": "2 · authenticated/private — signed in (claim CTA primary)",
  claiming: "3 · authenticated/private — claim in flight",
  "claim-error": "4 · authenticated/private — claim error (e.g. 409 already claimed)",
  "claim-success": "5 · authenticated/private — claim succeeded, redirect pending",
  "public-invite-only": "6 · authenticated/public — invite-only (no browser claim)",
};

const FIXTURE_ORDER: LabFixtureKey[] = [
  "signed-out-private",
  "signed-in-private",
  "claiming",
  "claim-error",
  "claim-success",
  "public-invite-only",
];

function CliFallback({ hasActiveInvite }: { hasActiveInvite: boolean }) {
const { t } = useTranslation();

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Terminal className="size-4 text-muted-foreground" aria-hidden />
        <span>{t("pages.bootstrapsetupuxlab.prefer_to_finish_setup_from_the_.jsx-text", { defaultValue: "Prefer to finish setup from the host?" })}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasActiveInvite
          ? "A bootstrap invite is already active. Check your Paperclip startup logs for the first‑admin URL, or run this command on the host to rotate it:"
          : "Run this command on the host that runs Paperclip to print a one‑time first‑admin invite URL:"}
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
{BOOTSTRAP_FALLBACK_COMMAND}
      </pre>
    </div>
  );
}

function StateChrome({ children }: { children: ReactNode }) {
const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">{children}</div>
    </div>
  );
}

function SignedOutPrivate() {
const { t } = useTranslation();

  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("pages.bootstrapsetupuxlab.finish_setting_up_this_paperclip.jsx-text", { defaultValue: "Finish setting up this Paperclip" })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.no_admin_has_claimed_this_instan.jsx-text", { defaultValue: "\n        No admin has claimed this instance yet. Sign in or create your Paperclip account to become the first admin from this browser.\n      " })}</p>
      <div className="mt-5">
        <Button asChild>
          <a href="/auth?next=/">{t("pages.bootstrapsetupuxlab.sign_in_create_account.jsx-text", { defaultValue: "Sign in / Create account" })}</a>
        </Button>
      </div>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function SignedInPrivate() {
const { t } = useTranslation();

  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("pages.bootstrapsetupuxlab.finish_setting_up_this_paperclip.jsx-text", { defaultValue: "Finish setting up this Paperclip" })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.no_admin_has_claimed_this_instan.jsx-text", { defaultValue: "\n        No admin has claimed this instance yet. Claim it now to become the first admin and start onboarding.\n      " })}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button>{t("pages.bootstrapsetupuxlab.claim_this_instance.jsx-text", { defaultValue: "Claim this instance" })}</Button>
        <span className="text-sm text-muted-foreground">
          {t("pages.bootstrapsetupuxlab.signed_in_as.jsx-text", { defaultValue: "\n          Signed in as " })}<span className="font-medium text-foreground">{t("pages.bootstrapsetupuxlab.jane_appliance_local.jsx-text", { defaultValue: "jane@appliance.local" })}</span>
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.wrong_account.jsx-text", { defaultValue: "\n        Wrong account?" })}{" "}
        <a href="/auth?next=/" className="underline underline-offset-2">
          {t("pages.bootstrapsetupuxlab.switch_account.jsx-text", { defaultValue: "\n          Switch account\n        " })}</a>
        .
      </p>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function ClaimingPrivate() {
const { t } = useTranslation();

  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("pages.bootstrapsetupuxlab.finish_setting_up_this_paperclip.jsx-text", { defaultValue: "Finish setting up this Paperclip" })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.no_admin_has_claimed_this_instan.jsx-text", { defaultValue: "\n        No admin has claimed this instance yet. Claim it now to become the first admin and start onboarding.\n      " })}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled>
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          {t("pages.bootstrapsetupuxlab.claiming.jsx-text", { defaultValue: "\n          Claiming…\n        " })}</Button>
        <span className="text-sm text-muted-foreground">
          {t("pages.bootstrapsetupuxlab.signed_in_as.jsx-text", { defaultValue: "\n          Signed in as " })}<span className="font-medium text-foreground">{t("pages.bootstrapsetupuxlab.jane_appliance_local.jsx-text", { defaultValue: "jane@appliance.local" })}</span>
        </span>
      </div>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function ClaimErrorPrivate() {
const { t } = useTranslation();

  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("pages.bootstrapsetupuxlab.finish_setting_up_this_paperclip.jsx-text", { defaultValue: "Finish setting up this Paperclip" })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.no_admin_has_claimed_this_instan.jsx-text", { defaultValue: "\n        No admin has claimed this instance yet. Claim it now to become the first admin and start onboarding.\n      " })}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button>{t("pages.bootstrapsetupuxlab.claim_this_instance.jsx-text", { defaultValue: "Claim this instance" })}</Button>
        <span className="text-sm text-muted-foreground">
          {t("pages.bootstrapsetupuxlab.signed_in_as.jsx-text", { defaultValue: "\n          Signed in as " })}<span className="font-medium text-foreground">{t("pages.bootstrapsetupuxlab.jane_appliance_local.jsx-text", { defaultValue: "jane@appliance.local" })}</span>
        </span>
      </div>
      <div
        role="alert"
        className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <TriangleAlert className="mt-0.5 size-4 flex-shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{t("pages.bootstrapsetupuxlab.someone_else_has_already_claimed.jsx-text", { defaultValue: "Someone else has already claimed this instance." })}</p>
          <p className="mt-1 text-destructive/90">
            {t("pages.bootstrapsetupuxlab.refresh_to_sign_in_or_ask_the_ex.jsx-text", { defaultValue: "\n            Refresh to sign in, or ask the existing admin to invite you from" })}{" "}
            <span className="font-mono">{t("pages.bootstrapsetupuxlab.instance_settings_access.jsx-text", { defaultValue: "Instance settings → Access" })}</span>.
          </p>
        </div>
      </div>
      <CliFallback hasActiveInvite={false} />
    </StateChrome>
  );
}

function ClaimSuccess() {
const { t } = useTranslation();

  return (
    <StateChrome>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{t("pages.bootstrapsetupuxlab.you_rsquo_re_the_instance_admin.jsx-text", { defaultValue: "You&rsquo;re the instance admin" })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("pages.bootstrapsetupuxlab.setup_is_complete_taking_you_to_.jsx-text", { defaultValue: "\n            Setup is complete. Taking you to onboarding to create your first company&hellip;\n          " })}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">{t("pages.bootstrapsetupuxlab.redirecting_hellip.jsx-text", { defaultValue: "Redirecting&hellip;" })}</span>
      </div>
      <div className="mt-5">
        <Button asChild variant="outline">
          <a href="/">{t("pages.bootstrapsetupuxlab.continue_to_dashboard.jsx-text", { defaultValue: "Continue to dashboard" })}</a>
        </Button>
      </div>
    </StateChrome>
  );
}

function PublicInviteOnly() {
const { t } = useTranslation();

  return (
    <StateChrome>
      <h1 className="text-xl font-semibold">{t("pages.bootstrapsetupuxlab.this_paperclip_is_waiting_on_its.jsx-text", { defaultValue: "This Paperclip is waiting on its first admin" })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.this_instance_runs_in_invite_onl.jsx-text", { defaultValue: "\n        This instance runs in invite‑only mode. The operator must generate a one‑time first‑admin invite URL from the host. Once you have the link, open it from this browser to finish setup.\n      " })}</p>
      <CliFallback hasActiveInvite />
      <p className="mt-4 text-xs text-muted-foreground">
        {t("pages.bootstrapsetupuxlab.browser_based_claim_is_intention.jsx-text", { defaultValue: "\n        Browser‑based claim is intentionally disabled in public mode so anyone on the network can&rsquo;t promote themselves.\n      " })}</p>
    </StateChrome>
  );
}

const FIXTURE_BODIES: Record<LabFixtureKey, ReactElement> = {
  "signed-out-private": <SignedOutPrivate />,
  "signed-in-private": <SignedInPrivate />,
  claiming: <ClaimingPrivate />,
  "claim-error": <ClaimErrorPrivate />,
  "claim-success": <ClaimSuccess />,
  "public-invite-only": <PublicInviteOnly />,
};

export function BootstrapSetupUxLab() {
const { t } = useTranslation();

  return (
    <div className="bg-background min-h-screen pb-16">
      <header className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("pages.bootstrapsetupuxlab.ux_lab.jsx-text", { defaultValue: "UX Lab" })}</p>
          <h1 className="mt-1 text-2xl font-semibold">{t("pages.bootstrapsetupuxlab.bootstrap_pending_setup_states.jsx-text", { defaultValue: "Bootstrap-pending setup states" })}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("pages.bootstrapsetupuxlab.fixtures_for_the_bootstrap_pendi.jsx-text", { defaultValue: "\n            Fixtures for the bootstrap-pending screen in " })}<span className="font-mono">{t("pages.bootstrapsetupuxlab.cloudaccessgate.jsx-text", { defaultValue: "CloudAccessGate" })}</span>{t("pages.bootstrapsetupuxlab.used_as_the_ux_spec_for.jsx-text", { defaultValue: ". Used as the UX spec for" })}{" "}
            <a className="underline underline-offset-2" href="/PAP/issues/PAP-10113">
              PAP-10113
            </a>{" "}
            {t("pages.bootstrapsetupuxlab.and_the_implementation_reference.jsx-text", { defaultValue: "\n            and the implementation reference for" })}{" "}
            <a className="underline underline-offset-2" href="/PAP/issues/PAP-10114">
              PAP-10114
            </a>
            {t("pages.bootstrapsetupuxlab.the_browser_claim_cta_only_appea.jsx-text", { defaultValue: "\n            . The browser claim CTA only appears when" })}{" "}
            <span className="font-mono">{t("pages.bootstrapsetupuxlab.deploymentmode_quot_authenticate.jsx-text", { defaultValue: "deploymentMode === &quot;authenticated&quot;" })}</span> {t("pages.bootstrapsetupuxlab.and.jsx-text", { defaultValue: " and" })}{" "}
            <span className="font-mono">{t("pages.bootstrapsetupuxlab.deploymentexposure_quot_private_.jsx-text", { defaultValue: "deploymentExposure === &quot;private&quot;" })}</span>.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-12 px-6 pt-10">
        {FIXTURE_ORDER.map((key) => (
          <section key={key} aria-labelledby={`lab-${key}`}>
            <h2
              id={`lab-${key}`}
              className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {FIXTURE_LABELS[key]}
            </h2>
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-2">
              {FIXTURE_BODIES[key]}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
