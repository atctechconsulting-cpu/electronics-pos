import { supabase } from "@/lib/supabase/client";
import { branchCreateSchema, branchUpdateSchema, parseBranchInput, type BranchDetails, type NewBranch } from "@/lib/validations/branch";

export type BranchRecord = BranchDetails & {
  id: string; organization_id: string; code: string;
  is_head_office: boolean; is_active: boolean; created_at: string; updated_at: string;
};
export type BranchDirectory = { branches: BranchRecord[]; can_manage: boolean };

function organizationArgs(organizationId: string) {
  if (!organizationId) throw new Error("Select an organisation.");
  return { p_org: organizationId };
}
async function branchRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === "23505") throw new Error("A branch with this code already exists in this organisation.");
    if (error.code === "42501") throw new Error("You do not have permission for this branch operation.");
    if (error.code === "40P01" || error.code === "40001") throw new Error("The branch changed during this request. Refresh and try again.");
    if (error.code === "P0001") throw new Error(error.message);
    throw new Error("Unable to complete the branch operation. Refresh and try again.");
  }
  return data as T;
}
export function getOrganizationBranches(organizationId: string) {
  return branchRpc<BranchDirectory>("get_organization_branches", organizationArgs(organizationId));
}
export function createBranch(organizationId: string, input: NewBranch) {
  return branchRpc<string>("create_branch", { ...organizationArgs(organizationId), p_data: parseBranchInput(branchCreateSchema, input) });
}
export function updateBranch(organizationId: string, branchId: string, input: BranchDetails) {
  if (!branchId) throw new Error("Select a branch.");
  return branchRpc<void>("update_branch", { ...organizationArgs(organizationId), p_branch: branchId, p_data: parseBranchInput(branchUpdateSchema, input) });
}
export function setBranchActiveStatus(organizationId: string, branchId: string, active: boolean) {
  if (!branchId) throw new Error("Select a branch.");
  return branchRpc<void>("set_branch_active_status", { ...organizationArgs(organizationId), p_branch: branchId, p_active: active });
}
