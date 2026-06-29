alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_organizations enable row level security;
alter table public.user_branches enable row level security;
alter table public.user_roles enable row level security;

create policy "Users can view organizations they belong to"
on public.organizations
for select
to authenticated
using (
  public.is_org_member(id)
);

create policy "Super admins can update their organization"
on public.organizations
for update
to authenticated
using (
  public.is_super_admin(id)
)
with check (
  public.is_super_admin(id)
);

create policy "Users can view branches they belong to"
on public.branches
for select
to authenticated
using (
  public.is_branch_member(id)
  or public.is_org_member(organization_id)
);

create policy "Super admins can manage branches"
on public.branches
for all
to authenticated
using (
  public.has_permission('branches.manage', organization_id, null)
)
with check (
  public.has_permission('branches.manage', organization_id, null)
);

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

create policy "Users can view profiles in their organizations"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.user_organizations current_user_orgs
    join public.user_organizations target_user_orgs
      on target_user_orgs.organization_id = current_user_orgs.organization_id
    where current_user_orgs.user_id = auth.uid()
      and target_user_orgs.user_id = profiles.id
  )
);

create policy "Authenticated users can view system roles"
on public.roles
for select
to authenticated
using (true);

create policy "Authenticated users can view permissions"
on public.permissions
for select
to authenticated
using (true);

create policy "Authenticated users can view role permissions"
on public.role_permissions
for select
to authenticated
using (true);

create policy "Users can view their organization links"
on public.user_organizations
for select
to authenticated
using (
  user_id = auth.uid()
);

create policy "Super admins can manage organization users"
on public.user_organizations
for all
to authenticated
using (
  public.has_permission('users.manage', organization_id, null)
)
with check (
  public.has_permission('users.manage', organization_id, null)
);

create policy "Users can view their branch links"
on public.user_branches
for select
to authenticated
using (
  user_id = auth.uid()
);

create policy "Branch managers can manage branch users"
on public.user_branches
for all
to authenticated
using (
  exists (
    select 1
    from public.branches b
    where b.id = user_branches.branch_id
      and public.has_permission('users.manage', b.organization_id, b.id)
  )
)
with check (
  exists (
    select 1
    from public.branches b
    where b.id = user_branches.branch_id
      and public.has_permission('users.manage', b.organization_id, b.id)
  )
);

create policy "Users can view their role assignments"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
);

create policy "Admins can manage user roles"
on public.user_roles
for all
to authenticated
using (
  (
    organization_id is not null
    and public.has_permission('roles.manage', organization_id, null)
  )
  or
  (
    branch_id is not null
    and public.has_permission('roles.manage', null, branch_id)
  )
)
with check (
  (
    organization_id is not null
    and public.has_permission('roles.manage', organization_id, null)
  )
  or
  (
    branch_id is not null
    and public.has_permission('roles.manage', null, branch_id)
  )
);