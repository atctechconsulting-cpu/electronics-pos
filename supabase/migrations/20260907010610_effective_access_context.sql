-- ============================================================
-- AlphaPOS v0.7.0
-- Effective Access Context
--
-- Returns the authenticated user's effective roles and
-- permissions for a selected organisation / branch workspace.
--
-- Organisation-scoped roles apply throughout the organisation.
-- Branch-scoped roles apply only to their assigned branch.
-- ============================================================


create or replace function public.get_effective_access(
  target_organization_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
  ) then
    raise exception 'User does not belong to this organization';
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
      (v_roles ? 'super_admin')
  );

end;
$$;


revoke all
on function public.get_effective_access(uuid, uuid)
from public;

grant execute
on function public.get_effective_access(uuid, uuid)
to authenticated;