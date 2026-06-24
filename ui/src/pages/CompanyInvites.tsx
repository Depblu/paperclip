import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import type { TFunction } from "i18next";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, MailPlus } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

const inviteRoleOptions = [
  {
    value: "viewer",
  },
  {
    value: "operator",
  },
  {
    value: "admin",
  },
  {
    value: "owner",
  },
] as const;

function inviteRoleLabel(role: (typeof inviteRoleOptions)[number]["value"], t: TFunction) {
  switch (role) {
    case "viewer": return t("pages.companyinvites.viewer.role_label", { defaultValue: "Viewer" });
    case "operator": return t("pages.companyinvites.operator.role_label", { defaultValue: "Operator" });
    case "admin": return t("pages.companyinvites.admin.role_label", { defaultValue: "Admin" });
    case "owner": return t("pages.companyinvites.owner.role_label", { defaultValue: "Owner" });
  }
}

function inviteRoleDescription(role: (typeof inviteRoleOptions)[number]["value"], t: TFunction) {
  switch (role) {
    case "viewer": return t("pages.companyinvites.viewer.role_description", { defaultValue: "Can view company work and follow along." });
    case "operator": return t("pages.companyinvites.operator.role_description", { defaultValue: "Recommended for people who need to help run work without managing access." });
    case "admin": return t("pages.companyinvites.admin.role_description", { defaultValue: "Recommended for operators who need to invite people, create agents, and approve joins." });
    case "owner": return t("pages.companyinvites.owner.role_description", { defaultValue: "Full company access, including membership management." });
  }
}

function inviteRoleGets(role: (typeof inviteRoleOptions)[number]["value"], t: TFunction) {
  switch (role) {
    case "viewer": return t("pages.companyinvites.viewer.role_gets", { defaultValue: "View-only company membership." });
    case "operator": return t("pages.companyinvites.operator.role_gets", { defaultValue: "Can assign tasks." });
    case "admin": return t("pages.companyinvites.admin.role_gets", { defaultValue: "Can create agents, invite users, assign tasks, and approve join requests." });
    case "owner": return t("pages.companyinvites.owner.role_gets", { defaultValue: "Everything in Admin, plus managing members." });
  }
}

const INVITE_HISTORY_PAGE_SIZE = 5;

function isInviteHistoryRow(value: unknown): value is Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number] {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "state" in value && "createdAt" in value;
}

export function CompanyInvites() {
const { t } = useTranslation();

  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [humanRole, setHumanRole] = useState<"owner" | "admin" | "operator" | "viewer">("operator");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteCopied, setLatestInviteCopied] = useState(false);
  const latestInviteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!latestInviteCopied) return;
    const timeout = window.setTimeout(() => {
      setLatestInviteCopied(false);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [latestInviteCopied]);

  function selectLatestInviteUrl() {
    latestInviteInputRef.current?.focus();
    latestInviteInputRef.current?.select();
  }

  async function copyText(text: string, unavailableBody: string, afterFallback?: () => void) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the unavailable message below.
    }

    const canUseLegacyCopy =
      typeof document !== "undefined" &&
      typeof document.execCommand === "function" &&
      (typeof document.queryCommandSupported !== "function" || document.queryCommandSupported("copy"));
    if (canUseLegacyCopy) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      try {
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        afterFallback?.();
        if (copied) return true;
      } catch {
        document.body.removeChild(textarea);
      }
    }

    afterFallback?.();
    pushToast({
      title: t("pages.companyinvites.clipboard_unavailable.toast_title", { defaultValue: "Clipboard unavailable" }),
      body: unavailableBody,
      tone: "warn",
    });
    return false;
  }

  async function copyInviteUrl(url: string) {
    return copyText(
      url,
      t("pages.companyinvites.invite_url_selected_copy_manually.toast_body", {
        defaultValue: "The invite URL is selected. Copy it manually from the field.",
      }),
      selectLatestInviteUrl,
    );
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("pages.companyinvites.company.breadcrumb", { defaultValue: "Company" }), href: "/dashboard" },
      { label: t("pages.companyinvites.settings.breadcrumb", { defaultValue: "Settings" }), href: "/company/settings" },
      { label: t("pages.companyinvites.invites.breadcrumb", { defaultValue: "Invites" }) },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const inviteHistoryQueryKey = queryKeys.access.invites(selectedCompanyId ?? "", "all", INVITE_HISTORY_PAGE_SIZE);
  const invitesQuery = useInfiniteQuery({
    queryKey: inviteHistoryQueryKey,
    queryFn: ({ pageParam }) =>
      accessApi.listInvites(selectedCompanyId!, {
        limit: INVITE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const inviteHistory = useMemo(
    () =>
      invitesQuery.data?.pages.flatMap((page) =>
        Array.isArray(page?.invites) ? page.invites.filter(isInviteHistoryRow) : [],
      ) ?? [],
    [invitesQuery.data?.pages],
  );

  const createInviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        humanRole,
        agentMessage: null,
      }),
    onSuccess: async (invite) => {
      setLatestInviteUrl(invite.inviteUrl);
      setLatestInviteCopied(false);
      const copied = await copyText(
        invite.inviteUrl,
        t("pages.companyinvites.copy_invite_url_manually.toast_body", {
          defaultValue: "Copy the invite URL manually from the field below.",
        }),
      );

      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({
        title: t("pages.companyinvites.invite_created.toast_title", { defaultValue: "Invite created" }),
        body: copied
          ? t("pages.companyinvites.invite_ready_copied.toast_body", { defaultValue: "Invite ready below and copied to clipboard." })
          : t("pages.companyinvites.invite_ready.toast_body", { defaultValue: "Invite ready below." }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("pages.companyinvites.failed_to_create_invite.toast_title", { defaultValue: "Failed to create invite" }),
        body: error instanceof Error ? error.message : t("pages.companyinvites.unknown_error", { defaultValue: "Unknown error" }),
        tone: "error",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => accessApi.revokeInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({ title: t("pages.companyinvites.invite_revoked.toast_title", { defaultValue: "Invite revoked" }), tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: t("pages.companyinvites.failed_to_revoke_invite.toast_title", { defaultValue: "Failed to revoke invite" }),
        body: error instanceof Error ? error.message : t("pages.companyinvites.unknown_error", { defaultValue: "Unknown error" }),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("pages.companyinvites.select_a_company_to_manage_invit.jsx-text", { defaultValue: "Select a company to manage invites." })}</div>;
  }

  if (invitesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("pages.companyinvites.loading_invites.jsx-text", { defaultValue: "Loading invites…" })}</div>;
  }

  if (invitesQuery.error) {
    const message =
      invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403
        ? "You do not have permission to manage company invites."
        : invitesQuery.error instanceof Error
          ? invitesQuery.error.message
          : "Failed to load invites.";
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("pages.companyinvites.company_invites.jsx-text", { defaultValue: "Company Invites" })}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("pages.companyinvites.invite_people_to_request_access_.jsx-text", { defaultValue: "\n          Invite people to request access to this company. New invite links are copied to your clipboard when they are generated.\n        " })}</p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("pages.companyinvites.invite_a_person.jsx-text", { defaultValue: "Invite a person" })}</h2>
          <p className="text-sm text-muted-foreground">
            {t("pages.companyinvites.generate_a_human_invite_link_and.jsx-text", { defaultValue: "\n            Generate a human invite link and choose the default access it should request.\n          " })}</p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("pages.companyinvites.choose_a_role.jsx-text", { defaultValue: "Choose a role" })}</legend>
          <div className="rounded-xl border border-border">
            {inviteRoleOptions.map((option, index) => {
              const checked = humanRole === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={option.value}
                    checked={checked}
                    onChange={() => setHumanRole(option.value)}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{inviteRoleLabel(option.value, t)}</span>
                      {option.value === "operator" ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {t("pages.companyinvites.default.jsx-text", { defaultValue: "\n                          Default\n                        " })}</span>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{inviteRoleDescription(option.value, t)}</span>
                    <span className="block text-sm text-foreground">{inviteRoleGets(option.value, t)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          {t("pages.companyinvites.each_invite_link_is_single_use_h.jsx-text", { defaultValue: "\n          Each invite link is single-use. Human invitees get the selected role immediately after sign-in; agent invites still create a join request for approval.\n        " })}</div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending ? "Creating…" : "Create invite"}
          </Button>
          <span className="text-sm text-muted-foreground">{t("pages.companyinvites.invite_history_below_keeps_the_a.jsx-text", { defaultValue: "Invite history below keeps the audit trail." })}</span>
        </div>

        {latestInviteUrl ? (
          <div className="space-y-3 rounded-lg border border-border px-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{t("pages.companyinvites.latest_invite_link.jsx-text", { defaultValue: "Latest invite link" })}</div>
                {latestInviteCopied ? (
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <Check className="h-3.5 w-3.5" />
                    {t("pages.companyinvites.copied.jsx-text", { defaultValue: "\n                    Copied\n                  " })}</div>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("pages.companyinvites.this_url_includes_the_current_pa.jsx-text", { defaultValue: "\n                This URL includes the current Paperclip domain returned by the server.\n              " })}</div>
            </div>
            <label className="block space-y-1">
              <span className="sr-only">{t("pages.companyinvites.latest_invite_url.jsx-text", { defaultValue: "Latest invite URL" })}</span>
              <input
                ref={latestInviteInputRef}
                readOnly
                value={latestInviteUrl}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground outline-none transition-colors selection:bg-primary selection:text-primary-foreground focus:border-ring"
                aria-label={t("pages.companyinvites.latest_invite_url.attr_aria-label", { defaultValue: "Latest invite URL" })}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const copied = await copyInviteUrl(latestInviteUrl);
                  setLatestInviteCopied(copied);
                }}
              >
                <Copy className="h-4 w-4" />
                {t("pages.companyinvites.copy_link.jsx-text", { defaultValue: "\n                Copy link\n              " })}</Button>
              <Button size="sm" variant="outline" asChild>
                <a href={latestInviteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {t("pages.companyinvites.open_invite.jsx-text", { defaultValue: "\n                  Open invite\n                " })}</a>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t("pages.companyinvites.invite_history.jsx-text", { defaultValue: "Invite history" })}</h2>
            <p className="text-sm text-muted-foreground">
              {t("pages.companyinvites.review_invite_status_audience_in.jsx-text", { defaultValue: "\n              Review invite status, audience, inviter, and any linked join request.\n            " })}</p>
          </div>
          <Link to="/inbox/requests" className="text-sm underline underline-offset-4">
            {t("pages.companyinvites.open_join_request_queue.jsx-text", { defaultValue: "\n            Open join request queue\n          " })}</Link>
        </div>

        {inviteHistory.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
            {t("pages.companyinvites.no_invites_have_been_created_for.jsx-text", { defaultValue: "\n            No invites have been created for this company yet.\n          " })}</div>
        ) : (
          <div className="border-t border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("pages.companyinvites.state.jsx-text", { defaultValue: "State" })}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("pages.companyinvites.for.jsx-text", { defaultValue: "For" })}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("pages.companyinvites.invited_by.jsx-text", { defaultValue: "Invited by" })}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("pages.companyinvites.created.jsx-text", { defaultValue: "Created" })}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("pages.companyinvites.join_request.jsx-text", { defaultValue: "Join request" })}</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">{t("pages.companyinvites.action.jsx-text", { defaultValue: "Action" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map((invite) => (
                    <tr key={invite.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 align-top">
                        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {formatInviteState(invite.state, t)}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">{formatInviteAudience(invite, t)}</td>
                      <td className="px-5 py-3 align-top">
                        <div>{invite.invitedByUser?.name || invite.invitedByUser?.email || t("pages.companyinvites.unknown_inviter", { defaultValue: "Unknown inviter" })}</div>
                        {invite.invitedByUser?.email && invite.invitedByUser.name ? (
                          <div className="text-xs text-muted-foreground">{invite.invitedByUser.email}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.relatedJoinRequestId ? (
                          <Link to="/inbox/requests" className="underline underline-offset-4">
                            {t("pages.companyinvites.review_request.jsx-text", { defaultValue: "\n                            Review request\n                          " })}</Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        {invite.state === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending}
                          >
                            {t("pages.companyinvites.revoke.jsx-text", { defaultValue: "\n                            Revoke\n                          " })}</Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("pages.companyinvites.inactive.jsx-text", { defaultValue: "Inactive" })}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitesQuery.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invitesQuery.fetchNextPage()}
                  disabled={invitesQuery.isFetchingNextPage}
                >
                  {invitesQuery.isFetchingNextPage
                    ? t("pages.companyinvites.loading_more.action", { defaultValue: "Loading more…" })
                    : t("pages.companyinvites.view_more.action", { defaultValue: "View more" })}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function formatInviteState(state: "active" | "accepted" | "expired" | "revoked", t: ReturnType<typeof useTranslation>["t"]) {
  switch (state) {
    case "active":
      return t("pages.companyinvites.state_active", { defaultValue: "Active" });
    case "accepted":
      return t("pages.companyinvites.state_accepted", { defaultValue: "Accepted" });
    case "expired":
      return t("pages.companyinvites.state_expired", { defaultValue: "Expired" });
    case "revoked":
      return t("pages.companyinvites.state_revoked", { defaultValue: "Revoked" });
  }
}

function formatInviteAudience(
  invite: Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number],
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (invite.allowedJoinTypes === "agent") return t("pages.companyinvites.audience_agent", { defaultValue: "Agent" });
  if (invite.allowedJoinTypes === "both") {
    return invite.humanRole
      ? t("pages.companyinvites.audience_human_or_agent_with_role", {
        role: invite.humanRole,
        defaultValue: "Human or agent · {{role}}",
      })
      : t("pages.companyinvites.audience_human_or_agent", { defaultValue: "Human or agent" });
  }
  return invite.humanRole ?? t("pages.companyinvites.audience_human", { defaultValue: "Human" });
}
