-- ============================================================
-- AlphaPOS v0.7.0
-- Staff Administration Backend
--
-- Provides:
-- 1. Staff directory RPC
-- 2. Staff administration metadata
-- 3. Secure staff profile updates
-- 4. Branch assignment management
-- 5. Role assignment management
-- 6. Staff activation/deactivation
-- 7. Protection for the final active super administrator
--
-- New-user invitation itself will be handled separately by a
-- secure Next.js server endpoint because Supabase Auth admin
-- operations must never use a service-role key in the browser.
-- ============================================================


-- ============================================================
-- 1. HELPER: USER BELONGS TO ORGANISATION
-- ============================================================

create or replace function public.user_belongs_to_organization(
  target_user_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_organizations uo
    where uo.user_id = target_user_id
      and uo.organization_id = target_organization_id
  );
$$;


-- ============================================================
-- 2. HELPER: BRANCH BELONGS TO ORGANISATION
-- ============================================================

create or replace function public.branch_belongs_to_organization(
  target_branch_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branches b
    where b.id = target_branch_id
      and b.organization_id = target_organization_id
  );
$$;


-- ============================================================
-- 3. HELPER: ACTIVE SUPER ADMIN COUNT
-- ============================================================

create or replace function public.active_super_admin_count(
  target_organization_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct ur.user_id)
  from public.user_roles ur
  join public.roles r
    on r.id = ur.role_id
  join public.profiles p
    on p.id = ur.user_id
  join public.user_organizations uo
    on uo.user_id = ur.user_id
   and uo.organization_id = ur.organization_id
  where ur.organization_id = target_organization_id
    and ur.branch_id is null
    and r.name = 'super_admin'
    and p.is_active = true;
$$;


-- ============================================================
-- 4. HELPER: IS ACTIVE ORGANISATION SUPER ADMIN
-- ============================================================

create or replace function public.is_active_organization_super_admin(
  target_user_id uuid,
  target_organization_id uuid
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
    join public.roles r
      on r.id = ur.role_id
    join public.profiles p
      on p.id = ur.user_id
    where ur.user_id = target_user_id
      and ur.organization_id = target_organization_id
      and ur.branch_id is null
      and r.name = 'super_admin'
      and p.is_active = true
  );
$$;


-- ============================================================
-- 5. STAFF DIRECTORY
-- ============================================================
--
-- Returns one JSON object per organisation member.
--
-- Branches and roles are nested arrays so the frontend does not
-- need to reconstruct the RBAC model from several independent
-- queries.
-- ============================================================

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
  roles jsonb
)
language plpgsql
stable
security definer
set search_path = public
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
    p.is_active,
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
    ) as roles

  from public.profiles p

  join public.user_organizations uo
    on uo.user_id = p.id

  where uo.organization_id = target_organization_id

  order by
    p.is_active desc,
    lower(coalesce(p.full_name, '')),
    p.created_at;

end;
$$;


-- ============================================================
-- 6. STAFF ADMINISTRATION METADATA
-- ============================================================
--
-- Gives the frontend the roles and branches that can be used
-- when creating/editing staff assignments.
-- ============================================================

create or replace function public.get_staff_administration_options(
  target_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_roles jsonb;
  v_branches jsonb;
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
    raise exception 'You do not have permission to view staff administration options';
  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'description', r.description,
        'is_system_role', r.is_system_role
      )
      order by
        case r.name
          when 'super_admin' then 1
          when 'branch_manager' then 2
          when 'cashier' then 3
          when 'inventory_officer' then 4
          when 'accountant' then 5
          else 99
        end,
        r.name
    ),
    '[]'::jsonb
  )
  into v_roles
  from public.roles r;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'code', b.code,
        'is_head_office', b.is_head_office
      )
      order by b.is_head_office desc, b.name
    ),
    '[]'::jsonb
  )
  into v_branches
  from public.branches b
  where b.organization_id = target_organization_id;


  return jsonb_build_object(
    'roles', v_roles,
    'branches', v_branches,
    'can_manage_staff',
      public.has_permission(
        'users.manage',
        target_organization_id,
        null
      ),
    'can_manage_roles',
      public.has_permission(
        'roles.manage',
        target_organization_id,
        null
      )
  );

end;
$$;


-- ============================================================
-- 7. UPDATE STAFF PROFILE
-- ============================================================

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
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin

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
    'is_active', v_profile.is_active
  );

end;
$$;


-- ============================================================
-- 8. ASSIGN STAFF TO BRANCH
-- ============================================================

create or replace function public.assign_staff_branch(
  target_organization_id uuid,
  target_user_id uuid,
  target_branch_id uuid,
  make_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin

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


-- ============================================================
-- 9. REMOVE STAFF FROM BRANCH
-- ============================================================

create or replace function public.remove_staff_branch(
  target_organization_id uuid,
  target_user_id uuid,
  target_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_default boolean;
  v_next_branch_id uuid;
begin

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


-- ============================================================
-- 10. SET DEFAULT STAFF BRANCH
-- ============================================================

create or replace function public.set_staff_default_branch(
  target_organization_id uuid,
  target_user_id uuid,
  target_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin

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


-- ============================================================
-- 11. ASSIGN STAFF ROLE
-- ============================================================

create or replace function public.assign_staff_role(
  target_organization_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
begin

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


-- ============================================================
-- 12. REMOVE STAFF ROLE
-- ============================================================

create or replace function public.remove_staff_role(
  target_organization_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
begin

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


-- ============================================================
-- 13. SET STAFF ACTIVE STATUS
-- ============================================================

create or replace function public.set_staff_active_status(
  target_organization_id uuid,
  target_user_id uuid,
  new_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin

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


  if new_is_active = false
     and public.is_active_organization_super_admin(
       target_user_id,
       target_organization_id
     )
     and public.active_super_admin_count(
       target_organization_id
     ) <= 1 then

    raise exception 'Cannot deactivate the organization''s last active super administrator';

  end if;


  update public.profiles
  set
    is_active = new_is_active,
    updated_at = now()
  where id = target_user_id;


  return jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'is_active', new_is_active
  );

end;
$$;


-- ============================================================
-- 14. REGISTER INVITED USER WITH ORGANISATION
-- ============================================================
--
-- This function is deliberately NOT callable by authenticated
-- browser users.
--
-- Our future server-side invitation endpoint will use the
-- Supabase service role and call this function after the Auth
-- user has been created/invited.
-- ============================================================

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
set search_path = public
as $$
begin

  if target_user_id is null then
    raise exception 'User ID is required';
  end if;


  if target_organization_id is null then
    raise exception 'Organization ID is required';
  end if;


  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
  ) then
    raise exception 'Organization not found';
  end if;


  if not exists (
    select 1
    from public.profiles
    where id = target_user_id
  ) then
    raise exception 'User profile not found';
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
    is_active = true,
    updated_at = now()
  where id = target_user_id;


  insert into public.user_organizations (
    user_id,
    organization_id,
    is_default
  )
  values (
    target_user_id,
    target_organization_id,
    not exists (
      select 1
      from public.user_organizations
      where user_id = target_user_id
    )
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


-- ============================================================
-- 15. GRANTS
-- ============================================================

grant execute
on function public.get_organization_staff(uuid)
to authenticated;

grant execute
on function public.get_staff_administration_options(uuid)
to authenticated;

grant execute
on function public.update_staff_profile(uuid, uuid, text, text, text)
to authenticated;

grant execute
on function public.assign_staff_branch(uuid, uuid, uuid, boolean)
to authenticated;

grant execute
on function public.remove_staff_branch(uuid, uuid, uuid)
to authenticated;

grant execute
on function public.set_staff_default_branch(uuid, uuid, uuid)
to authenticated;

grant execute
on function public.assign_staff_role(uuid, uuid, uuid, uuid)
to authenticated;

grant execute
on function public.remove_staff_role(uuid, uuid, uuid, uuid)
to authenticated;

grant execute
on function public.set_staff_active_status(uuid, uuid, boolean)
to authenticated;


-- ============================================================
-- 16. SERVICE-ROLE-ONLY INVITATION REGISTRATION
-- ============================================================

revoke all
on function public.register_invited_staff(
  uuid,
  uuid,
  text,
  text,
  text
)
from public;

revoke all
on function public.register_invited_staff(
  uuid,
  uuid,
  text,
  text,
  text
)
from anon;

revoke all
on function public.register_invited_staff(
  uuid,
  uuid,
  text,
  text,
  text
)
from authenticated;

grant execute
on function public.register_invited_staff(
  uuid,
  uuid,
  text,
  text,
  text
)
to service_role;


-- ============================================================
-- 17. HELPER FUNCTION SECURITY
-- ============================================================

revoke all
on function public.user_belongs_to_organization(uuid, uuid)
from public;

revoke all
on function public.branch_belongs_to_organization(uuid, uuid)
from public;

revoke all
on function public.active_super_admin_count(uuid)
from public;

revoke all
on function public.is_active_organization_super_admin(uuid, uuid)
from public;