import { supabase } from "@/lib/supabase/client";

export type StaffBranch = {
  id: string;
  name: string;
  code: string | null;
  is_head_office: boolean;
  is_default: boolean;
};

export type StaffRoleAssignment = {
  assignment_id: string;
  role_id: string;
  role_name: string;
  role_description: string | null;
  organization_id: string;
  branch_id: string | null;
  scope: "organization" | "branch";
  branch_name: string | null;
};

export type StaffMember = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  is_active: boolean;
  account_is_active: boolean;
  organization_is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  branches: StaffBranch[];
  roles: StaffRoleAssignment[];
};

export type StaffAdministrationRole = {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
};

export type StaffAdministrationBranch = {
  id: string;
  name: string;
  code: string | null;
  is_head_office: boolean;
};

export type StaffAdministrationOptions = {
  roles: StaffAdministrationRole[];
  branches: StaffAdministrationBranch[];
  can_manage_staff: boolean;
  can_manage_roles: boolean;
};

export async function getOrganizationStaff(
  organizationId: string
): Promise<StaffMember[]> {
  const { data, error } = await supabase.rpc("get_organization_staff", {
    target_organization_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StaffMember[];
}

export async function getStaffAdministrationOptions(
  organizationId: string
): Promise<StaffAdministrationOptions> {
  const { data, error } = await supabase.rpc(
    "get_staff_administration_options",
    {
      target_organization_id: organizationId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const result = data as StaffAdministrationOptions | null;

  return {
    roles: result?.roles ?? [],
    branches: result?.branches ?? [],
    can_manage_staff: result?.can_manage_staff ?? false,
    can_manage_roles: result?.can_manage_roles ?? false,
  };
}

export async function updateStaffProfile(params: {
  organizationId: string;
  userId: string;
  fullName: string;
  phone?: string | null;
  jobTitle?: string | null;
}) {
  const { data, error } = await supabase.rpc("update_staff_profile", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    new_full_name: params.fullName,
    new_phone: params.phone ?? null,
    new_job_title: params.jobTitle ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function assignStaffBranch(params: {
  organizationId: string;
  userId: string;
  branchId: string;
  makeDefault?: boolean;
}) {
  const { data, error } = await supabase.rpc("assign_staff_branch", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    target_branch_id: params.branchId,
    make_default: params.makeDefault ?? false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function removeStaffBranch(params: {
  organizationId: string;
  userId: string;
  branchId: string;
}) {
  const { data, error } = await supabase.rpc("remove_staff_branch", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    target_branch_id: params.branchId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function setStaffDefaultBranch(params: {
  organizationId: string;
  userId: string;
  branchId: string;
}) {
  const { data, error } = await supabase.rpc("set_staff_default_branch", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    target_branch_id: params.branchId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function assignStaffRole(params: {
  organizationId: string;
  userId: string;
  roleId: string;
  branchId?: string | null;
}) {
  const { data, error } = await supabase.rpc("assign_staff_role", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    target_role_id: params.roleId,
    target_branch_id: params.branchId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function removeStaffRole(params: {
  organizationId: string;
  userId: string;
  roleId: string;
  branchId?: string | null;
}) {
  const { data, error } = await supabase.rpc("remove_staff_role", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    target_role_id: params.roleId,
    target_branch_id: params.branchId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function setStaffActiveStatus(params: {
  organizationId: string;
  userId: string;
  isActive: boolean;
}) {
  const { data, error } = await supabase.rpc("set_staff_active_status", {
    target_organization_id: params.organizationId,
    target_user_id: params.userId,
    new_is_active: params.isActive,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
