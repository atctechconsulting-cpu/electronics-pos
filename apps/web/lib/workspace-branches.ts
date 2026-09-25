export type WorkspaceBranch = {
  id: string; organization_id: string; name: string; code: string | null;
  is_head_office: boolean; is_default: boolean; is_active: boolean;
};

export function operationalBranches(branches: WorkspaceBranch[], organizationId: string) {
  return branches.filter(item => item.organization_id === organizationId && item.is_active).sort((a, b) =>
    Number(b.is_default) - Number(a.is_default) || Number(b.is_head_office) - Number(a.is_head_office) || a.name.localeCompare(b.name));
}
export function selectOperationalBranch(branches: WorkspaceBranch[], organizationId: string, preferred?: string | null, stored?: string | null) {
  const available = operationalBranches(branches, organizationId);
  return available.find(item => item.id === preferred) ?? available.find(item => item.id === stored) ?? available[0] ?? null;
}
