"use client";

import { Building2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogFooter,
} from "@/components/ui/app-dialog";

import { supabase } from "@/lib/supabase/client";

import type {
  StaffAdministrationBranch,
  StaffAdministrationRole,
} from "@/lib/services/staff";

type InviteStaffDialogProps = {
  open: boolean;
  organizationId: string;
  roles: StaffAdministrationRole[];
  branches: StaffAdministrationBranch[];
  onClose: () => void;
  onInvited: () => Promise<void> | void;
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  roleId: string;
  branchId: string;
};

const initialForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  jobTitle: "",
  roleId: "",
  branchId: "",
};

const organizationScopedRoles = new Set(["super_admin", "accountant"]);

const branchScopedRoles = new Set([
  "branch_manager",
  "cashier",
  "inventory_officer",
]);

function formatRoleName(roleName: string) {
  return roleName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function InviteStaffDialog({
  open,
  organizationId,
  roles,
  branches,
  onClose,
  onInvited,
}: InviteStaffDialogProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const assignableRoles = useMemo(
    () =>
      roles.filter(
        (role) =>
          organizationScopedRoles.has(role.name) ||
          branchScopedRoles.has(role.name)
      ),
    [roles]
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === form.roleId) ?? null,
    [form.roleId, roles]
  );

  const requiresBranch = selectedRole
    ? branchScopedRoles.has(selectedRole.name)
    : false;

  const isOrganizationRole = selectedRole
    ? organizationScopedRoles.has(selectedRole.name)
    : false;

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setError(null);
      setSuccess(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (selectedRole && !requiresBranch && form.branchId) {
      setForm((current) => ({
        ...current,
        branchId: "",
      }));
    }
  }, [form.branchId, requiresBranch, selectedRole]);

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError(null);
    setSuccess(null);
  }

  function validateForm() {
    if (form.fullName.trim().length < 2) {
      return "Enter the staff member's full name.";
    }

    if (!form.email.trim()) {
      return "Enter the staff member's email address.";
    }

    if (!form.email.includes("@")) {
      return "Enter a valid email address.";
    }

    if (!form.roleId) {
      return "Select a staff role.";
    }

    if (requiresBranch && !form.branchId) {
      return "Select the branch this staff member will work in.";
    }

    return null;
  }

  async function handleInvite() {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/staff/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizationId,
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          jobTitle: form.jobTitle.trim() || null,
          roleId: form.roleId,
          branchId: requiresBranch ? form.branchId : null,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to send the staff invitation.");
      }

      setSuccess(
        result.message ||
          `Invitation sent to ${form.email.trim().toLowerCase()}.`
      );

      await onInvited();

      setForm(initialForm);
    } catch (inviteError) {
      console.error("Staff invitation failed:", inviteError);

      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Unable to send the staff invitation."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) {
      return;
    }

    onClose();
  }

  return (
    <AppDialog
      open={open}
      title="Invite Staff"
      description="Create secure AlphaPOS access for a member of your team."
      onClose={handleClose}
      closeDisabled={submitting}
      maxWidth="lg"
      footer={
        <AppDialogFooter>
          <AppDialogCancelButton onClick={handleClose} disabled={submitting}>
            Cancel
          </AppDialogCancelButton>

          <AppDialogActionButton
            onClick={() => void handleInvite()}
            disabled={submitting || Boolean(success)}
          >
            {submitting ? "Sending Invitation..." : "Send Invitation"}
          </AppDialogActionButton>
        </AppDialogFooter>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-emerald-600" />

              <div>
                <p className="font-medium text-emerald-900">Invitation sent</p>

                <p className="mt-1 text-sm text-emerald-700">{success}</p>

                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-3 text-sm font-medium text-emerald-900 underline underline-offset-4"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Staff Details
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Enter the details of the person you want to invite.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    Full name *
                  </span>

                  <input
                    value={form.fullName}
                    onChange={(event) =>
                      updateField("fullName", event.target.value)
                    }
                    disabled={submitting}
                    placeholder="e.g. Sarah Johnson"
                    autoComplete="name"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 disabled:bg-slate-50"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Email address *
                  </span>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField("email", event.target.value)
                    }
                    disabled={submitting}
                    placeholder="staff@example.com"
                    autoComplete="email"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 disabled:bg-slate-50"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Phone
                  </span>

                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                      updateField("phone", event.target.value)
                    }
                    disabled={submitting}
                    placeholder="+44..."
                    autoComplete="tel"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 disabled:bg-slate-50"
                  />
                </label>

                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    Job title
                  </span>

                  <input
                    value={form.jobTitle}
                    onChange={(event) =>
                      updateField("jobTitle", event.target.value)
                    }
                    disabled={submitting}
                    placeholder="e.g. Store Manager"
                    autoComplete="organization-title"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 disabled:bg-slate-50"
                  />
                </label>
              </div>
            </section>

            <div className="border-t border-slate-200" />

            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2">
                  <ShieldCheck className="h-4 w-4 text-slate-600" />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Access & Role
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    The selected role determines what this staff member can
                    access in AlphaPOS.
                  </p>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  Role *
                </span>

                <select
                  value={form.roleId}
                  onChange={(event) =>
                    updateField("roleId", event.target.value)
                  }
                  disabled={submitting}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 disabled:bg-slate-50"
                >
                  <option value="">Select role</option>

                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {formatRoleName(role.name)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedRole ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-700">
                    {formatRoleName(selectedRole.name)}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {selectedRole.description ||
                      (isOrganizationRole
                        ? "This role has organisation-wide access."
                        : "This role is limited to its assigned branch.")}
                  </p>

                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    {isOrganizationRole
                      ? "Organisation-wide role"
                      : "Branch role"}
                  </p>
                </div>
              ) : null}

              {requiresBranch ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Branch *
                  </span>

                  <select
                    value={form.branchId}
                    onChange={(event) =>
                      updateField("branchId", event.target.value)
                    }
                    disabled={submitting}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 disabled:bg-slate-50"
                  >
                    <option value="">Select branch</option>

                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.is_head_office ? " — Head Office" : ""}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Building2 className="h-3.5 w-3.5" />
                    Access will initially be limited to this branch.
                  </div>
                </label>
              ) : null}
            </section>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <UserPlus className="mt-0.5 h-4 w-4 text-slate-500" />

                <p className="text-sm leading-6 text-slate-600">
                  AlphaPOS will create the staff account and send an invitation
                  to the email address above. Access is controlled by the
                  assigned role and branch.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </AppDialog>
  );
}
