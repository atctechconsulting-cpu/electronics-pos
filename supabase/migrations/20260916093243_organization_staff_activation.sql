-- Stage 2: organisation-specific staff eligibility.
-- Apply atomically: no session can observe the new column with old helpers.
begin;

alter table public.user_organizations
  add column is_active boolean not null default false;

update public.user_organizations uo
set is_active = p.is_active
from public.profiles p
where p.id = uo.user_id;

comment on column public.user_organizations.is_active is
  'Organisation eligibility only. Effective access also requires an active global profile.';
comment on column public.profiles.is_active is
  'Global platform account eligibility. Tenant staff administration must not change this field.';

-- Existing target-membership existence helpers intentionally remain unchanged.
create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organizations uo
    join public.profiles p on p.id = uo.user_id
    where uo.user_id = auth.uid()
      and uo.organization_id = target_organization_id
      and uo.is_active and p.is_active
  );
$$;

create or replace function public.is_branch_member(target_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_branches ub
    join public.branches b on b.id = ub.branch_id
    where ub.user_id = auth.uid()
      and ub.branch_id = target_branch_id
      and public.is_org_member(b.organization_id)
  );
$$;

create or replace function public.has_permission(
  target_permission_key text,
  target_organization_id uuid default null,
  target_branch_id uuid default null
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where ur.user_id = auth.uid()
      and perm.key = target_permission_key
      and public.is_org_member(ur.organization_id)
      and (
        (target_branch_id is null
          and target_organization_id is not null
          and ur.organization_id = target_organization_id
          and ur.branch_id is null)
        or
        (target_branch_id is not null
          and (ur.branch_id is null or ur.branch_id = target_branch_id)
          and exists (
            select 1 from public.branches b
            where b.id = target_branch_id
              and b.organization_id = ur.organization_id
              and (target_organization_id is null
                or b.organization_id = target_organization_id)
          ))
      )
  );
$$;

create or replace function public.is_super_admin(target_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_org_member(target_organization_id) and exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.organization_id = target_organization_id
      and ur.branch_id is null and r.name = 'super_admin'
  );
$$;

create or replace function public.has_organization_permission_any_scope(
  target_permission_key text, target_organization_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_org_member(target_organization_id) and (
    public.has_permission(target_permission_key, target_organization_id, null)
    or exists (
      select 1 from public.branches b
      where b.organization_id = target_organization_id
        and public.has_permission(target_permission_key, target_organization_id, b.id)
    )
  );
$$;

create or replace function public.active_super_admin_count(target_organization_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select count(distinct ur.user_id)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  join public.user_organizations uo
    on uo.user_id = ur.user_id and uo.organization_id = ur.organization_id
  where ur.organization_id = target_organization_id
    and ur.branch_id is null and r.name = 'super_admin'
    and p.is_active and uo.is_active;
$$;

create or replace function public.is_active_organization_super_admin(
  target_user_id uuid, target_organization_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    join public.user_organizations uo
      on uo.user_id = ur.user_id and uo.organization_id = ur.organization_id
    where ur.user_id = target_user_id
      and ur.organization_id = target_organization_id
      and ur.branch_id is null and r.name = 'super_admin'
      and p.is_active and uo.is_active
  );
$$;

-- Preserve existing co-organisation profile visibility and membership RLS.
-- Only the caller must be active; staff may still read inactive target names.
-- is_org_member performs its profile lookup as a definer, avoiding recursion.
alter policy "Users can view profiles in their organizations"
on public.profiles to authenticated
using (
  exists (
    select 1 from public.user_organizations current_user_orgs
    join public.user_organizations target_user_orgs
      on target_user_orgs.organization_id = current_user_orgs.organization_id
    where current_user_orgs.user_id = auth.uid()
      and target_user_orgs.user_id = profiles.id
      and public.is_org_member(current_user_orgs.organization_id)
  )
);

-- Preserve SELECT policies (including own inactive membership rows needed
-- to distinguish suspension from first-time onboarding). Browser writes must
-- use staff RPCs; privileges and policies independently enforce this boundary.
revoke all privileges on table
  public.user_organizations, public.user_branches, public.user_roles
from public, anon, authenticated;
grant select on table
  public.user_organizations, public.user_branches, public.user_roles
to authenticated;
grant select, insert, update, delete on table
  public.user_organizations, public.user_branches, public.user_roles
to service_role;

drop policy "Authorized admins can manage organization users" on public.user_organizations;
drop policy "Authorized managers can manage branch users" on public.user_branches;
drop policy "Authorized admins can manage user roles" on public.user_roles;

-- Internal RPC lock/authorization boundary. All staff mutation RPCs use this
-- same organisation row before touching memberships, branches or roles.
-- READ COMMITTED is required so checks after waiting see committed changes;
-- the VOLATILE PL/pgSQL caller issues those checks as separate statements.
-- Reject older transaction snapshots rather than risk a stale admin count.
create function public.lock_staff_administration(
  target_organization_id uuid, required_permission text
)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if required_permission not in ('users.manage', 'roles.manage')
    or required_permission is null
    or not public.has_permission(required_permission, target_organization_id, null) then
    raise exception 'You do not have permission to manage this organization';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Staff administration requires READ COMMITTED isolation';
  end if;

  perform 1 from public.organizations
  where id = target_organization_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  if not public.has_permission(required_permission, target_organization_id, null) then
    raise exception 'Your staff administration access has changed';
  end if;
end;
$$;

create or replace function public.set_staff_active_status(
  target_organization_id uuid, target_user_id uuid, new_is_active boolean
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  account_active boolean;
begin
  perform public.lock_staff_administration(target_organization_id, 'users.manage');
  if new_is_active is null then
    raise exception 'Membership active status is required';
  end if;
  if not public.user_belongs_to_organization(target_user_id, target_organization_id) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  select p.is_active into account_active from public.profiles p
  where p.id = target_user_id for share;
  if not found then
    raise exception 'Staff profile not found';
  end if;
  if new_is_active and not account_active then
    raise exception 'A globally inactive account cannot be activated by an organization';
  end if;

  if not new_is_active
    and public.is_active_organization_super_admin(target_user_id, target_organization_id)
    and public.active_super_admin_count(target_organization_id) <= 1 then
    raise exception 'Cannot deactivate the organization''s last active super administrator';
  end if;

  update public.user_organizations
  set is_active = new_is_active
  where user_id = target_user_id and organization_id = target_organization_id;

  return jsonb_build_object(
    'success', true, 'user_id', target_user_id,
    'organization_id', target_organization_id,
    'account_is_active', account_active,
    'organization_is_active', new_is_active,
    'is_active', account_active and new_is_active
  );
end;
$$;

create or replace function public.get_effective_access(
  target_organization_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_branch_organization_id uuid;
  v_roles jsonb;
  v_permissions jsonb;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- ----------------------------------------------------------
  -- USER MUST BE ACTIVE
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
  ) then
    raise exception 'User account is inactive';
  end if;

  -- ----------------------------------------------------------
  -- VERIFY ORGANISATION MEMBERSHIP
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.user_organizations uo
    where uo.user_id = v_user_id
      and uo.organization_id = target_organization_id
      and uo.is_active = true
  ) then
    raise exception 'User has no active membership in this organization';
  end if;

  -- ----------------------------------------------------------
  -- VERIFY BRANCH
  -- ----------------------------------------------------------

  if target_branch_id is not null then

    select b.organization_id
    into v_branch_organization_id
    from public.branches b
    where b.id = target_branch_id;

    if v_branch_organization_id is null then
      raise exception 'Branch not found';
    end if;

    if v_branch_organization_id <> target_organization_id then
      raise exception 'Branch does not belong to this organization';
    end if;

    -- The selected branch must be one the user is actually
    -- assigned to.
    --
    -- Organisation-scoped roles may apply across the whole
    -- organisation, but the current AlphaPOS workspace selector
    -- is based on explicit user_branches membership.

    if not exists (
      select 1
      from public.user_branches ub
      where ub.user_id = v_user_id
        and ub.branch_id = target_branch_id
    ) then
      raise exception 'User does not belong to this branch';
    end if;

  end if;

  -- ----------------------------------------------------------
  -- EFFECTIVE ROLES
  -- ----------------------------------------------------------
  --
  -- Organisation workspace:
  --   organisation-scoped roles only.
  --
  -- Branch workspace:
  --   organisation-scoped roles
  --   +
  --   roles assigned specifically to the selected branch.

  select coalesce(
    jsonb_agg(role_name order by role_name),
    '[]'::jsonb
  )
  into v_roles
  from (
    select distinct r.name as role_name

    from public.user_roles ur

    join public.roles r
      on r.id = ur.role_id

    where ur.user_id = v_user_id

      and ur.organization_id = target_organization_id

      and (
        (
          target_branch_id is null
          and ur.branch_id is null
        )

        or

        (
          target_branch_id is not null
          and (
            ur.branch_id is null
            or ur.branch_id = target_branch_id
          )
        )
      )
  ) effective_roles;

  -- ----------------------------------------------------------
  -- EFFECTIVE PERMISSIONS
  -- ----------------------------------------------------------

  select coalesce(
    jsonb_agg(permission_key order by permission_key),
    '[]'::jsonb
  )
  into v_permissions
  from (
    select distinct perm.key as permission_key

    from public.user_roles ur

    join public.role_permissions rp
      on rp.role_id = ur.role_id

    join public.permissions perm
      on perm.id = rp.permission_id

    where ur.user_id = v_user_id

      and ur.organization_id = target_organization_id

      and (
        (
          target_branch_id is null
          and ur.branch_id is null
        )

        or

        (
          target_branch_id is not null
          and (
            ur.branch_id is null
            or ur.branch_id = target_branch_id
          )
        )
      )
  ) effective_permissions;

  -- ----------------------------------------------------------
  -- RESULT
  -- ----------------------------------------------------------

  return jsonb_build_object(
    'organization_id', target_organization_id,
    'branch_id', target_branch_id,
    'roles', v_roles,
    'permissions', v_permissions,
    'is_super_admin',
      public.is_super_admin(target_organization_id)
  );

end;
$$;

-- Return columns change: recreate the RPC without CASCADE, then restore explicit grants.
-- No repository database object depends on this RPC. Unexpected dependencies abort.
drop function public.get_organization_staff(uuid);
create or replace function public.get_organization_staff(
  target_organization_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  avatar_url text,
  job_title text,
  is_active boolean,
  last_login_at timestamptz,
  created_at timestamptz,
  branches jsonb,
  roles jsonb,
  account_is_active boolean,
  organization_is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_permission(
      'users.view',
      target_organization_id,
      null
    )
    or
    public.has_permission(
      'users.manage',
      target_organization_id,
      null
    )
  ) then
    raise exception 'You do not have permission to view organization staff';
  end if;

  return query

  select
    p.id,
    p.full_name,
    p.phone,
    p.avatar_url,
    p.job_title,
    (p.is_active and uo.is_active),
    p.last_login_at,
    p.created_at,

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'code', b.code,
            'is_head_office', b.is_head_office,
            'is_default', ub.is_default
          )
          order by ub.is_default desc, b.name
        )
        from public.user_branches ub
        join public.branches b
          on b.id = ub.branch_id
        where ub.user_id = p.id
          and b.organization_id = target_organization_id
      ),
      '[]'::jsonb
    ) as branches,

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assignment_id', ur.id,
            'role_id', r.id,
            'role_name', r.name,
            'role_description', r.description,
            'organization_id', ur.organization_id,
            'branch_id', ur.branch_id,
            'scope',
              case
                when ur.branch_id is null
                  then 'organization'
                else 'branch'
              end,
            'branch_name', rb.name
          )
          order by
            case when ur.branch_id is null then 0 else 1 end,
            r.name,
            rb.name
        )
        from public.user_roles ur
        join public.roles r
          on r.id = ur.role_id
        left join public.branches rb
          on rb.id = ur.branch_id
        where ur.user_id = p.id
          and ur.organization_id = target_organization_id
      ),
      '[]'::jsonb
    ) as roles,
    p.is_active as account_is_active,
    uo.is_active as organization_is_active

  from public.profiles p

  join public.user_organizations uo
    on uo.user_id = p.id

  where uo.organization_id = target_organization_id

  order by
    (p.is_active and uo.is_active) desc,
    lower(coalesce(p.full_name, '')),
    p.created_at;

end;
$$;

create or replace function public.update_staff_profile(
  target_organization_id uuid,
  target_user_id uuid,
  new_full_name text,
  new_phone text default null,
  new_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.lock_staff_administration(target_organization_id, 'users.manage');

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission(
    'users.manage',
    target_organization_id,
    null
  ) then
    raise exception 'You do not have permission to manage staff';
  end if;

  if not public.user_belongs_to_organization(
    target_user_id,
    target_organization_id
  ) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  if nullif(trim(coalesce(new_full_name, '')), '') is null then
    raise exception 'Full name is required';
  end if;

  update public.profiles
  set
    full_name = trim(new_full_name),
    phone = nullif(trim(coalesce(new_phone, '')), ''),
    job_title = nullif(trim(coalesce(new_job_title, '')), ''),
    updated_at = now()
  where id = target_user_id
  returning *
  into v_profile;

  return jsonb_build_object(
    'user_id', v_profile.id,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'job_title', v_profile.job_title,
    'account_is_active', v_profile.is_active,
    'organization_is_active', (select uo.is_active from public.user_organizations uo
      where uo.user_id = target_user_id and uo.organization_id = target_organization_id),
    'is_active', v_profile.is_active and (select uo.is_active from public.user_organizations uo
      where uo.user_id = target_user_id and uo.organization_id = target_organization_id)
  );

end;
$$;

create or replace function public.assign_staff_branch(
  target_organization_id uuid,
  target_user_id uuid,
  target_branch_id uuid,
  make_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_staff_administration(target_organization_id, 'users.manage');

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission(
    'users.manage',
    target_organization_id,
    null
  ) then
    raise exception 'You do not have permission to manage staff';
  end if;

  if not public.user_belongs_to_organization(
    target_user_id,
    target_organization_id
  ) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  if not public.branch_belongs_to_organization(
    target_branch_id,
    target_organization_id
  ) then
    raise exception 'Branch does not belong to this organization';
  end if;

  if make_default then

    update public.user_branches ub
    set is_default = false
    from public.branches b
    where ub.user_id = target_user_id
      and ub.branch_id = b.id
      and b.organization_id = target_organization_id;

  end if;

  insert into public.user_branches (
    user_id,
    branch_id,
    is_default
  )
  values (
    target_user_id,
    target_branch_id,
    make_default
  )
  on conflict (user_id, branch_id)
  do update
  set is_default = excluded.is_default;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'branch_id', target_branch_id,
    'is_default', make_default
  );

end;
$$;

create or replace function public.remove_staff_branch(
  target_organization_id uuid,
  target_user_id uuid,
  target_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_default boolean;
  v_next_branch_id uuid;
begin
  perform public.lock_staff_administration(target_organization_id, 'users.manage');

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission(
    'users.manage',
    target_organization_id,
    null
  ) then
    raise exception 'You do not have permission to manage staff';
  end if;

  if not public.user_belongs_to_organization(
    target_user_id,
    target_organization_id
  ) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  if not public.branch_belongs_to_organization(
    target_branch_id,
    target_organization_id
  ) then
    raise exception 'Branch does not belong to this organization';
  end if;

  -- Do not remove a branch while a branch-scoped role still
  -- depends on that branch.

  if exists (
    select 1
    from public.user_roles ur
    where ur.user_id = target_user_id
      and ur.organization_id = target_organization_id
      and ur.branch_id = target_branch_id
  ) then
    raise exception 'Remove the staff member''s branch-scoped roles before removing branch access';
  end if;

  select ub.is_default
  into v_was_default
  from public.user_branches ub
  where ub.user_id = target_user_id
    and ub.branch_id = target_branch_id;

  delete from public.user_branches
  where user_id = target_user_id
    and branch_id = target_branch_id;

  -- If their default branch was removed, promote another branch.

  if coalesce(v_was_default, false) then

    select ub.branch_id
    into v_next_branch_id
    from public.user_branches ub
    join public.branches b
      on b.id = ub.branch_id
    where ub.user_id = target_user_id
      and b.organization_id = target_organization_id
    order by b.is_head_office desc, b.name
    limit 1;

    if v_next_branch_id is not null then

      update public.user_branches
      set is_default = true
      where user_id = target_user_id
        and branch_id = v_next_branch_id;

    end if;

  end if;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'branch_id', target_branch_id
  );

end;
$$;

create or replace function public.set_staff_default_branch(
  target_organization_id uuid,
  target_user_id uuid,
  target_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_staff_administration(target_organization_id, 'users.manage');

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission(
    'users.manage',
    target_organization_id,
    null
  ) then
    raise exception 'You do not have permission to manage staff';
  end if;

  if not public.user_belongs_to_organization(
    target_user_id,
    target_organization_id
  ) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  if not public.branch_belongs_to_organization(
    target_branch_id,
    target_organization_id
  ) then
    raise exception 'Branch does not belong to this organization';
  end if;

  if not exists (
    select 1
    from public.user_branches
    where user_id = target_user_id
      and branch_id = target_branch_id
  ) then
    raise exception 'Staff member is not assigned to this branch';
  end if;

  update public.user_branches ub
  set is_default = false
  from public.branches b
  where ub.user_id = target_user_id
    and ub.branch_id = b.id
    and b.organization_id = target_organization_id;

  update public.user_branches
  set is_default = true
  where user_id = target_user_id
    and branch_id = target_branch_id;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'branch_id', target_branch_id
  );

end;
$$;

create or replace function public.assign_staff_role(
  target_organization_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_name text;
begin
  perform public.lock_staff_administration(target_organization_id, 'roles.manage');

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission(
    'roles.manage',
    target_organization_id,
    null
  ) then
    raise exception 'You do not have permission to assign roles';
  end if;

  if not public.user_belongs_to_organization(
    target_user_id,
    target_organization_id
  ) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  select name
  into v_role_name
  from public.roles
  where id = target_role_id;

  if v_role_name is null then
    raise exception 'Role not found';
  end if;

  -- Super administrator and accountant are organisation-wide
  -- roles in AlphaPOS V1.

  if v_role_name in ('super_admin', 'accountant')
     and target_branch_id is not null then
    raise exception '% must be assigned at organization scope', v_role_name;
  end if;

  -- Operational roles are branch scoped.

  if v_role_name in (
    'branch_manager',
    'cashier',
    'inventory_officer'
  )
  and target_branch_id is null then
    raise exception '% must be assigned to a branch', v_role_name;
  end if;

  if target_branch_id is not null then

    if not public.branch_belongs_to_organization(
      target_branch_id,
      target_organization_id
    ) then
      raise exception 'Branch does not belong to this organization';
    end if;

    -- A branch role also requires branch membership.

    insert into public.user_branches (
      user_id,
      branch_id,
      is_default
    )
    values (
      target_user_id,
      target_branch_id,
      not exists (
        select 1
        from public.user_branches ub
        join public.branches b
          on b.id = ub.branch_id
        where ub.user_id = target_user_id
          and b.organization_id = target_organization_id
      )
    )
    on conflict (user_id, branch_id)
    do nothing;

  end if;

  insert into public.user_roles (
    user_id,
    role_id,
    organization_id,
    branch_id
  )
  values (
    target_user_id,
    target_role_id,
    target_organization_id,
    target_branch_id
  )
  on conflict do nothing;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'role_id', target_role_id,
    'role_name', v_role_name,
    'organization_id', target_organization_id,
    'branch_id', target_branch_id
  );

end;
$$;

create or replace function public.remove_staff_role(
  target_organization_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_name text;
begin
  perform public.lock_staff_administration(target_organization_id, 'roles.manage');

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission(
    'roles.manage',
    target_organization_id,
    null
  ) then
    raise exception 'You do not have permission to remove roles';
  end if;

  if not public.user_belongs_to_organization(
    target_user_id,
    target_organization_id
  ) then
    raise exception 'Staff member does not belong to this organization';
  end if;

  if target_branch_id is not null
    and not public.branch_belongs_to_organization(target_branch_id, target_organization_id) then
    raise exception 'Branch does not belong to this organization';
  end if;

  select name
  into v_role_name
  from public.roles
  where id = target_role_id;

  if v_role_name is null then
    raise exception 'Role not found';
  end if;

  -- Protect the organisation from losing its final active
  -- super administrator.

  if v_role_name = 'super_admin'
     and target_branch_id is null
     and public.is_active_organization_super_admin(
       target_user_id,
       target_organization_id
     )
     and public.active_super_admin_count(
       target_organization_id
     ) <= 1 then

    raise exception 'Cannot remove the organization''s last active super administrator';

  end if;

  delete from public.user_roles
  where user_id = target_user_id
    and role_id = target_role_id
    and organization_id = target_organization_id
    and (
      (target_branch_id is null and branch_id is null)
      or
      branch_id = target_branch_id
    );

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'role_id', target_role_id,
    'role_name', v_role_name,
    'branch_id', target_branch_id
  );

end;
$$;

create or replace function public.create_initial_business(
  business_name text,
  business_slug text,
  branch_name text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_org_id uuid;
  new_branch_id uuid;
  super_admin_role_id uuid;
begin

  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize repeated onboarding for the same identity, including concurrent requests.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Business onboarding requires READ COMMITTED isolation';
  end if;
  perform 1 from public.profiles p
  where p.id = current_user_id and p.is_active = true for update;
  if not found then
    raise exception 'An active global profile is required';
  end if;

  if exists (
    select 1
    from public.user_organizations
    where user_id = current_user_id
  ) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (
    name,
    slug
  )
  values (
    business_name,
    business_slug
  )
  returning id into new_org_id;

  insert into public.branches (
    organization_id,
    name,
    code,
    is_head_office
  )
  values (
    new_org_id,
    branch_name,
    'MAIN',
    true
  )
  returning id into new_branch_id;

  select id
  into super_admin_role_id
  from public.roles
  where name = 'super_admin';

  if super_admin_role_id is null then
    raise exception 'Super admin role not found';
  end if;

  insert into public.user_organizations (
    user_id,
    organization_id,
    is_default,
    is_active
  )
  values (
    current_user_id,
    new_org_id,
    true,
    true
  );

  insert into public.user_branches (
    user_id,
    branch_id,
    is_default
  )
  values (
    current_user_id,
    new_branch_id,
    true
  );

  -- Organisation-scoped super admin.
  insert into public.user_roles (
    user_id,
    role_id,
    organization_id,
    branch_id
  )
  values (
    current_user_id,
    super_admin_role_id,
    new_org_id,
    null
  );

  return json_build_object(
    'organization_id', new_org_id,
    'branch_id', new_branch_id
  );

end;
$$;

-- Explicit activation for new-user provisioning; existing memberships are never reactivated.
create or replace function public.register_invited_staff(
  target_user_id uuid,
  target_organization_id uuid,
  target_full_name text,
  target_job_title text default null,
  target_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Stage 2 compatibility only: trusted server provisioning, not caller authorization.
  -- Stage 3 will replace the invitation API authorization path.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted service role required';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Staff provisioning requires READ COMMITTED isolation';
  end if;
  if target_user_id is null then
    raise exception 'User ID is required';
  end if;

  if target_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  perform 1
  from public.organizations
  where id = target_organization_id
  for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  perform 1
  from public.profiles
  where id = target_user_id and is_active = true
  for update;
  if not found then
    raise exception 'An active global profile is required';
  end if;

  update public.profiles
  set
    full_name = coalesce(
      nullif(trim(coalesce(target_full_name, '')), ''),
      full_name
    ),
    job_title = nullif(
      trim(coalesce(target_job_title, '')),
      ''
    ),
    phone = nullif(
      trim(coalesce(target_phone, '')),
      ''
    ),
    updated_at = now()
  where id = target_user_id;

  insert into public.user_organizations (
    user_id,
    organization_id,
    is_default,
    is_active
  )
  values (
    target_user_id,
    target_organization_id,
    not exists (
      select 1
      from public.user_organizations
      where user_id = target_user_id
    ),
    true
  )
  on conflict (user_id, organization_id)
  do nothing;

  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'organization_id', target_organization_id
  );

end;
$$;

-- Explicit RPC execution privileges; existing metadata helpers inherit has_permission.

revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

revoke all on function public.is_branch_member(uuid) from public, anon, authenticated;
grant execute on function public.is_branch_member(uuid) to authenticated;

revoke all on function public.has_permission(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.has_permission(text, uuid, uuid) to authenticated;

revoke all on function public.is_super_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;

revoke all on function public.has_organization_permission_any_scope(text, uuid) from public, anon, authenticated;
grant execute on function public.has_organization_permission_any_scope(text, uuid) to authenticated;

revoke all on function public.get_effective_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_effective_access(uuid, uuid) to authenticated;

revoke all on function public.get_organization_staff(uuid) from public, anon, authenticated;
grant execute on function public.get_organization_staff(uuid) to authenticated;

revoke all on function public.get_staff_administration_options(uuid) from public, anon, authenticated;
grant execute on function public.get_staff_administration_options(uuid) to authenticated;

revoke all on function public.can_view_organization_staff(uuid) from public, anon, authenticated;
grant execute on function public.can_view_organization_staff(uuid) to authenticated;

revoke all on function public.can_manage_organization_staff(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_organization_staff(uuid) to authenticated;

revoke all on function public.create_initial_business(text, text, text) from public, anon, authenticated;
grant execute on function public.create_initial_business(text, text, text) to authenticated;

revoke all on function public.update_staff_profile(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_staff_profile(uuid, uuid, text, text, text) to authenticated;

revoke all on function public.assign_staff_branch(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.assign_staff_branch(uuid, uuid, uuid, boolean) to authenticated;

revoke all on function public.remove_staff_branch(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_staff_branch(uuid, uuid, uuid) to authenticated;

revoke all on function public.set_staff_default_branch(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_staff_default_branch(uuid, uuid, uuid) to authenticated;

revoke all on function public.assign_staff_role(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_staff_role(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.remove_staff_role(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_staff_role(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.set_staff_active_status(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_staff_active_status(uuid, uuid, boolean) to authenticated;

revoke all on function public.lock_staff_administration(uuid, text) from public, anon, authenticated, service_role;

revoke all on function public.active_super_admin_count(uuid) from public, anon, authenticated, service_role;

revoke all on function public.is_active_organization_super_admin(uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function public.user_belongs_to_organization(uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function public.branch_belongs_to_organization(uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function public.register_invited_staff(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.register_invited_staff(uuid, uuid, text, text, text) to service_role;

-- Abort on unexpected inherited privileges or write-policy drift rather than
-- silently deploying a bypass. Table REVOKE also removes matching column grants.
do $$
declare
  relation_name text;
  browser_role text;
begin
  foreach relation_name in array array[
    'public.user_organizations', 'public.user_branches', 'public.user_roles'
  ] loop
    foreach browser_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(browser_role, relation_name,
        'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
        or has_any_column_privilege(browser_role, relation_name, 'INSERT, UPDATE, REFERENCES') then
        raise exception 'Unexpected mutation privileges on % for %', relation_name, browser_role;
      end if;
      if has_table_privilege(browser_role, relation_name, 'SELECT')
        is distinct from (browser_role = 'authenticated')
        or has_any_column_privilege(browser_role, relation_name, 'SELECT')
        is distinct from (browser_role = 'authenticated') then
        raise exception 'Unexpected SELECT privileges on % for %', relation_name, browser_role;
      end if;
    end loop;
    if exists (
      select 1 from pg_catalog.pg_policy
      where polrelid = relation_name::regclass and polcmd <> 'r'
    ) then
      raise exception 'Unexpected write policy remains on %', relation_name;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_class
      where oid = relation_name::regclass and relrowsecurity
    ) then
      raise exception 'RLS must remain enabled on %', relation_name;
    end if;
  end loop;
end;
$$;

commit;
