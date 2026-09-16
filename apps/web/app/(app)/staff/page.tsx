"use client";

import {
  Building2,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { InviteStaffDialog } from "@/components/staff/invite-staff-dialog";

import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/ui/alpha-components";

import {
  getOrganizationStaff,
  getStaffAdministrationOptions,
  type StaffAdministrationOptions,
  type StaffMember,
} from "@/lib/services/staff";

export default function StaffPage() {
  const { organization } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [options, setOptions] = useState<StaffAdministrationOptions | null>(
    null
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    if (!organization?.id) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [staffData, optionsData] = await Promise.all([
        getOrganizationStaff(organization.id),
        getStaffAdministrationOptions(organization.id),
      ]);

      setStaff(staffData);
      setOptions(optionsData);
    } catch (err) {
      console.error("Failed to load staff:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load staff administration."
      );
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.is_active),
    [staff]
  );

  const inactiveStaff = useMemo(
    () => staff.filter((member) => !member.is_active),
    [staff]
  );

  const administrators = useMemo(
    () =>
      staff.filter((member) =>
        member.roles.some(
          (assignment) =>
            assignment.role_name === "super_admin" &&
            assignment.scope === "organization"
        )
      ),
    [staff]
  );

  const filteredStaff = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return staff.filter((member) => {
      if (statusFilter === "active" && !member.is_active) {
        return false;
      }

      if (statusFilter === "inactive" && member.is_active) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        member.full_name,
        member.phone,
        member.job_title,
        ...member.branches.map((branch) => branch.name),
        ...member.roles.map((role) => role.role_name),
        ...member.roles.map((role) => role.branch_name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [search, staff, statusFilter]);

  function formatRoleName(roleName: string) {
    return roleName
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function formatLastLogin(value: string | null) {
    if (!value) {
      return "Never";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  if (!organization) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Building2}
          title="No organisation selected"
          description="Select an organisation before managing staff."
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 p-6">
        <PageHeader
          title="Staff Management"
          description="Manage your team, branch access and AlphaPOS permissions."
          actions={
            options?.can_manage_staff && options?.can_manage_roles ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              >
                <UserPlus className="h-4 w-4" />
                Invite Staff
              </button>
            ) : undefined
          }
        />

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <UserX className="mt-0.5 h-5 w-5 text-red-600" />

              <div>
                <p className="font-medium text-red-900">Unable to load staff</p>

                <p className="mt-1 text-sm text-red-700">{error}</p>

                <button
                  type="button"
                  onClick={() => void loadStaff()}
                  className="mt-3 text-sm font-medium text-red-900 underline underline-offset-4"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Staff"
            value={loading ? "—" : staff.length.toString()}
            icon={Users}
            description="Organisation members"
          />

          <StatCard
            label="Active"
            value={loading ? "—" : activeStaff.length.toString()}
            icon={UserCheck}
            description="Staff with active access"
          />

          <StatCard
            label="Inactive"
            value={loading ? "—" : inactiveStaff.length.toString()}
            icon={UserX}
            description="Suspended staff access"
          />

          <StatCard
            label="Administrators"
            value={loading ? "—" : administrators.length.toString()}
            icon={ShieldCheck}
            description="Organisation super administrators"
          />
        </div>

        <SectionCard
          title="Team"
          description="Staff members with access to this organisation."
        >
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search staff, roles or branches..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-400"
              />
            </div>

            <div className="flex items-center gap-2">
              {(["all", "active", "inactive"] as const).map((status) => {
                const selected = statusFilter === status;

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={[
                      "rounded-lg border px-3 py-2 text-sm font-medium transition",
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-20 animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          ) : filteredStaff.length === 0 ? (
            <EmptyState
              icon={Users}
              title={staff.length === 0 ? "No staff yet" : "No staff found"}
              description={
                staff.length === 0
                  ? "Invite your first team member to begin managing staff access."
                  : "Try changing your search or status filter."
              }
              action={
                staff.length === 0 &&
                options?.can_manage_staff &&
                options?.can_manage_roles ? (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white"
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite Staff
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Staff Member
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Role
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Branch Access
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Last Login
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredStaff.map((member) => (
                      <tr
                        key={member.user_id}
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                              {(member.full_name || "U")
                                .split(" ")
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join("") || "U"}
                            </div>

                            <div>
                              <p className="font-medium text-slate-900">
                                {member.full_name || "Unnamed staff member"}
                              </p>

                              <p className="mt-0.5 text-sm text-slate-500">
                                {member.job_title || "No job title"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          {member.roles.length === 0 ? (
                            <span className="text-sm text-slate-400">
                              No role assigned
                            </span>
                          ) : (
                            <div className="flex max-w-xs flex-wrap gap-1.5">
                              {member.roles.map((role) => (
                                <span
                                  key={role.assignment_id}
                                  title={
                                    role.scope === "organization"
                                      ? "Organisation-wide access"
                                      : role.branch_name || "Branch access"
                                  }
                                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                  {formatRoleName(role.role_name)}

                                  {role.scope === "branch" &&
                                  role.branch_name ? (
                                    <span className="ml-1 text-slate-400">
                                      · {role.branch_name}
                                    </span>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {member.branches.length === 0 ? (
                            member.roles.some(
                              (role) => role.scope === "organization"
                            ) ? (
                              <span className="text-sm font-medium text-slate-600">
                                All branches
                              </span>
                            ) : (
                              <span className="text-sm text-slate-400">
                                No branch access
                              </span>
                            )
                          ) : (
                            <div className="space-y-1">
                              {member.branches.map((branch) => (
                                <div
                                  key={branch.id}
                                  className="flex items-center gap-1.5 text-sm text-slate-600"
                                >
                                  <Building2 className="h-3.5 w-3.5 text-slate-400" />

                                  <span>{branch.name}</span>

                                  {branch.is_default ? (
                                    <span className="text-xs text-slate-400">
                                      (Default)
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">
                          {formatLastLogin(member.last_login_at)}
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge
                            status={member.is_active ? "ACTIVE" : "INACTIVE"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && staff.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {filteredStaff.length} of {staff.length} staff members
              </span>

              <span>
                {options?.can_manage_roles
                  ? "Role administration enabled"
                  : options?.can_manage_staff
                    ? "Staff administration enabled"
                    : "View only"}
              </span>
            </div>
          ) : null}
        </SectionCard>
      </div>

      {options?.can_manage_staff && options.can_manage_roles ? (
        <InviteStaffDialog
          open={inviteOpen}
          organizationId={organization.id}
          roles={options.roles}
          branches={options.branches}
          onClose={() => setInviteOpen(false)}
          onInvited={loadStaff}
        />
      ) : null}
    </>
  );
}
