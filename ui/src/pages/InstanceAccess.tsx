import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

export function InstanceAccess() {
  const { t } = useTranslation();

  const { companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([
      { label: t("pages.instanceaccess.instance_settings.breadcrumb", { defaultValue: "Instance Settings" }), href: "/instance/settings/general" },
      { label: t("pages.instanceaccess.access.breadcrumb", { defaultValue: "Access" }) },
    ]);
  }, [setBreadcrumbs, t]);

  const usersQuery = useQuery({
    queryKey: queryKeys.access.adminUsers(search),
    queryFn: () => accessApi.searchAdminUsers(search),
  });

  const selectedUser = useMemo(
    () => usersQuery.data?.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, usersQuery.data],
  );

  const userAccessQuery = useQuery({
    queryKey: queryKeys.access.userCompanyAccess(selectedUserId ?? ""),
    queryFn: () => accessApi.getUserCompanyAccess(selectedUserId!),
    enabled: !!selectedUserId,
  });

  function membershipRoleLabel(role: string | null | undefined) {
    switch (role) {
      case "owner":
        return t("pages.instanceaccess.role_owner.jsx-text", { defaultValue: "owner" });
      case "admin":
        return t("pages.instanceaccess.role_admin.jsx-text", { defaultValue: "admin" });
      case "operator":
        return t("pages.instanceaccess.role_operator.jsx-text", { defaultValue: "operator" });
      case "viewer":
        return t("pages.instanceaccess.role_viewer.jsx-text", { defaultValue: "viewer" });
      default:
        return t("pages.instanceaccess.unset.jsx-text", { defaultValue: "unset" });
    }
  }

  function membershipStatusLabel(status: string) {
    switch (status) {
      case "active":
        return t("pages.instanceaccess.status_active.jsx-text", { defaultValue: "active" });
      case "pending":
        return t("pages.instanceaccess.status_pending.jsx-text", { defaultValue: "pending" });
      case "suspended":
        return t("pages.instanceaccess.status_suspended.jsx-text", { defaultValue: "suspended" });
      case "archived":
        return t("pages.instanceaccess.status_archived.jsx-text", { defaultValue: "archived" });
      default:
        return status;
    }
  }

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.[0]) {
      setSelectedUserId(usersQuery.data[0].id);
    }
  }, [selectedUserId, usersQuery.data]);

  useEffect(() => {
    if (!userAccessQuery.data) return;
    setSelectedCompanyIds(
      new Set(
        userAccessQuery.data.companyAccess
          .filter((membership) => membership.status === "active")
          .map((membership) => membership.companyId),
      ),
    );
  }, [userAccessQuery.data]);

  const updateCompanyAccessMutation = useMutation({
    mutationFn: () => accessApi.setUserCompanyAccess(selectedUserId!, [...selectedCompanyIds]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      pushToast({ title: t("pages.instanceaccess.company_access_updated.title", { defaultValue: "Company access updated" }), tone: "success" });
    },
  });

  const setAdminMutation = useMutation({
    mutationFn: async (makeAdmin: boolean) => {
      if (!selectedUserId) throw new Error(t("pages.instanceaccess.no_user_selected.error", { defaultValue: "No user selected" }));
      if (makeAdmin) return accessApi.promoteInstanceAdmin(selectedUserId);
      return accessApi.demoteInstanceAdmin(selectedUserId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      if (selectedUserId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId) });
      }
      pushToast({ title: t("pages.instanceaccess.instance_role_updated.title", { defaultValue: "Instance role updated" }), tone: "success" });
    },
  });

  if (usersQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("pages.instanceaccess.loading_instance_users.jsx-text", { defaultValue: "Loading instance users…" })}</div>;
  }

  if (usersQuery.error) {
    const message =
      usersQuery.error instanceof ApiError && usersQuery.error.status === 403
        ? "Instance admin access is required to manage users."
        : usersQuery.error instanceof Error
          ? usersQuery.error.message
          : "Failed to load users.";
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("pages.instanceaccess.instance_access.jsx-text", { defaultValue: "Instance Access" })}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("pages.instanceaccess.search_users_manage_instance_adm.jsx-text", { defaultValue: "\n          Search users, manage instance-admin status, and control which companies they can access.\n        " })}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("pages.instanceaccess.search_users.jsx-text", { defaultValue: "Search users" })}</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("pages.instanceaccess.search_by_name_or_email.attr_placeholder", { defaultValue: "Search by name or email" })}
            />
          </label>
          <div className="space-y-2">
            {(usersQuery.data ?? []).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  user.id === selectedUserId
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.name || user.email || user.id}</div>
                    <div className="truncate text-sm text-muted-foreground">{user.email || user.id}</div>
                  </div>
                  {user.isInstanceAdmin ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("pages.instanceaccess.active_company_memberships_count.jsx-text", {
                    count: user.activeCompanyMembershipCount,
                    defaultValue: "{{count}} active company memberships",
                  })}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          {!selectedUserId ? (
            <div className="text-sm text-muted-foreground">{t("pages.instanceaccess.select_a_user_to_inspect_instanc.jsx-text", { defaultValue: "Select a user to inspect instance access." })}</div>
          ) : userAccessQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">{t("pages.instanceaccess.loading_user_access.jsx-text", { defaultValue: "Loading user access…" })}</div>
          ) : userAccessQuery.error ? (
            <div className="text-sm text-destructive">
              {userAccessQuery.error instanceof Error ? userAccessQuery.error.message : "Failed to load user access."}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    {selectedUser?.name || selectedUser?.email || selectedUserId}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedUser?.email || selectedUserId}
                  </div>
                </div>
                <Button
                  variant={selectedUser?.isInstanceAdmin ? "outline" : "default"}
                  onClick={() => setAdminMutation.mutate(!(selectedUser?.isInstanceAdmin ?? false))}
                  disabled={setAdminMutation.isPending}
                >
                  {selectedUser?.isInstanceAdmin
                    ? t("pages.instanceaccess.remove_instance_admin.jsx-text", { defaultValue: "Remove instance admin" })
                    : t("pages.instanceaccess.promote_to_instance_admin.jsx-text", { defaultValue: "Promote to instance admin" })}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">{t("pages.instanceaccess.company_access.jsx-text", { defaultValue: "Company access" })}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("pages.instanceaccess.toggle_company_membership_for_th.jsx-text", { defaultValue: "\n                    Toggle company membership for this user. New access defaults to an active operator membership.\n                  " })}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-start gap-3 rounded-lg border border-border px-3 py-3"
                    >
                      <Checkbox
                        checked={selectedCompanyIds.has(company.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCompanyIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(company.id);
                            else next.delete(company.id);
                            return next;
                          });
                        }}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{company.name}</span>
                        <span className="block text-xs text-muted-foreground">{company.issuePrefix}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateCompanyAccessMutation.mutate()}
                    disabled={updateCompanyAccessMutation.isPending}
                  >
                    {updateCompanyAccessMutation.isPending
                      ? t("pages.instanceaccess.saving.jsx-text", { defaultValue: "Saving…" })
                      : t("pages.instanceaccess.save_company_access.jsx-text", { defaultValue: "Save company access" })}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold">{t("pages.instanceaccess.current_memberships.jsx-text", { defaultValue: "Current memberships" })}</h2>
                <div className="space-y-2">
                  {(userAccessQuery.data?.companyAccess ?? []).map((membership) => (
                    <div
                      key={membership.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{membership.companyName || membership.companyId}</div>
                        <div className="text-muted-foreground">
                          {membershipRoleLabel(membership.membershipRole)} • {membershipStatusLabel(membership.status)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(membership.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
