create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_organizations uo
    where uo.user_id = auth.uid()
      and uo.organization_id = target_organization_id
  );
$$;

create or replace function public.is_branch_member(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_branches ub
    where ub.user_id = auth.uid()
      and ub.branch_id = target_branch_id
  );
$$;

create or replace function public.has_permission(
  target_permission_key text,
  target_organization_id uuid default null,
  target_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp
      on rp.role_id = ur.role_id
    join public.permissions p
      on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.key = target_permission_key
      and (
        (
          target_organization_id is not null
          and ur.organization_id = target_organization_id
        )
        or
        (
          target_branch_id is not null
          and ur.branch_id = target_branch_id
        )
      )
  );
$$;

create or replace function public.is_super_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r
      on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.organization_id = target_organization_id
      and r.name = 'super_admin'
  );
$$;