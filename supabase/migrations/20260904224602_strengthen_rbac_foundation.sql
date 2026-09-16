-- ============================================================
-- AlphaPOS v0.7.0
-- Strengthen RBAC Foundation
--
-- Goals:
-- 1. Correct role scoping so roles can genuinely be
--    organisation-scoped OR branch-scoped.
-- 2. Prevent branch-scoped roles from satisfying
--    organisation-wide permission checks.
-- 3. Allow authorised administrators/managers to view
--    staff membership and role assignments.
-- 4. Add reusable access helpers for the Staff/Admin UI.
-- ============================================================


-- ============================================================
-- 1. FIX USER_ROLES SCOPE MODEL
-- ============================================================

-- The original primary key included organization_id and branch_id.
-- Primary-key columns are implicitly NOT NULL, which prevented
-- genuine organisation-only or branch-only role assignments.
--
-- We replace that composite primary key with an ID and enforce
-- scope-specific uniqueness using partial unique indexes.

alter table public.user_roles
drop constraint if exists user_roles_pkey;

-- organization_id remains mandatory for every AlphaPOS role assignment.
-- branch_id must be nullable so that organisation-scoped roles such as
-- super_admin and accountant can exist without being tied to one branch.
alter table public.user_roles
alter column organization_id set not null;

alter table public.user_roles
alter column branch_id drop not null;

alter table public.user_roles
add column if not exists id uuid default gen_random_uuid();

update public.user_roles
set id = gen_random_uuid()
where id is null;

alter table public.user_roles
alter column id set not null;

alter table public.user_roles
add constraint user_roles_pkey primary key (id);


-- A role assignment must be either:
--
-- ORGANISATION SCOPED:
-- organization_id IS NOT NULL
-- branch_id IS NULL
--
-- OR BRANCH SCOPED:
-- organization_id IS NOT NULL
-- branch_id IS NOT NULL
--
-- We deliberately retain organization_id on branch assignments.
-- This makes organisation ownership explicit and simplifies
-- secure validation/reporting.

alter table public.user_roles
drop constraint if exists user_roles_scope_check;

alter table public.user_roles
add constraint user_roles_scope_check
check (
  organization_id is not null
);


-- Organisation-scoped role uniqueness.

create unique index if not exists
user_roles_unique_organization_role_idx
on public.user_roles (
  user_id,
  role_id,
  organization_id
)
where branch_id is null;


-- Branch-scoped role uniqueness.

create unique index if not exists
user_roles_unique_branch_role_idx
on public.user_roles (
  user_id,
  role_id,
  organization_id,
  branch_id
)
where branch_id is not null;


-- ============================================================
-- 2. VALIDATE BRANCH / ORGANISATION RELATIONSHIP
-- ============================================================

create or replace function public.validate_user_role_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_branch_organization_id uuid;
begin

  if new.organization_id is null then
    raise exception 'Role assignment requires an organization';
  end if;

  if new.branch_id is not null then

    select organization_id
    into v_branch_organization_id
    from public.branches
    where id = new.branch_id;

    if v_branch_organization_id is null then
      raise exception 'Branch not found';
    end if;

    if v_branch_organization_id <> new.organization_id then
      raise exception 'Branch does not belong to the specified organization';
    end if;

  end if;

  return new;
end;
$$;


drop trigger if exists validate_user_role_scope_trigger
on public.user_roles;

create trigger validate_user_role_scope_trigger
before insert or update
on public.user_roles
for each row
execute function public.validate_user_role_scope();


-- ============================================================
-- 3. STRENGTHEN ORGANISATION MEMBERSHIP CHECK
-- ============================================================

create or replace function public.is_org_member(
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
    join public.profiles p
      on p.id = uo.user_id
    where uo.user_id = auth.uid()
      and uo.organization_id = target_organization_id
      and p.is_active = true
  );
$$;


-- ============================================================
-- 4. STRENGTHEN BRANCH MEMBERSHIP CHECK
-- ============================================================

create or replace function public.is_branch_member(
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_branches ub
    join public.profiles p
      on p.id = ub.user_id
    where ub.user_id = auth.uid()
      and ub.branch_id = target_branch_id
      and p.is_active = true
  );
$$;


-- ============================================================
-- 5. FIX PERMISSION SCOPE RESOLUTION
-- ============================================================
--
-- Behaviour:
--
-- Organisation request:
--   has_permission('finance.view', org_id, NULL)
--
--   Only organisation-scoped roles can satisfy it.
--
-- Branch request:
--   has_permission('sales.create', org_id, branch_id)
--
--   Organisation-scoped roles OR roles assigned specifically
--   to that branch can satisfy it.
--
-- This prevents a role assigned to Branch A from accidentally
-- granting organisation-wide or Branch B access.

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
  select
    case

      -- No valid scope supplied.
      when target_organization_id is null
       and target_branch_id is null
      then false


      -- ------------------------------------------------------
      -- ORGANISATION-SCOPED PERMISSION CHECK
      -- ------------------------------------------------------

      when target_organization_id is not null
       and target_branch_id is null
      then exists (

        select 1
        from public.user_roles ur

        join public.role_permissions rp
          on rp.role_id = ur.role_id

        join public.permissions perm
          on perm.id = rp.permission_id

        join public.profiles prof
          on prof.id = ur.user_id

        where ur.user_id = auth.uid()

          and prof.is_active = true

          and perm.key = target_permission_key

          and ur.organization_id = target_organization_id

          -- Critical:
          -- organisation-wide permission must come from an
          -- organisation-scoped role.
          and ur.branch_id is null
      )


      -- ------------------------------------------------------
      -- BRANCH-SCOPED PERMISSION CHECK
      -- ------------------------------------------------------

      when target_branch_id is not null
      then exists (

        select 1
        from public.user_roles ur

        join public.role_permissions rp
          on rp.role_id = ur.role_id

        join public.permissions perm
          on perm.id = rp.permission_id

        join public.profiles prof
          on prof.id = ur.user_id

        join public.branches b
          on b.id = target_branch_id

        where ur.user_id = auth.uid()

          and prof.is_active = true

          and perm.key = target_permission_key

          -- Requested branch must belong to the requested
          -- organisation when organisation_id is supplied.
          and (
            target_organization_id is null
            or b.organization_id = target_organization_id
          )

          and ur.organization_id = b.organization_id

          and (

            -- Organisation-scoped roles apply to every branch
            -- within that organisation.
            ur.branch_id is null

            or

            -- Branch-scoped roles apply only to their branch.
            ur.branch_id = target_branch_id

          )
      )

      else false

    end;
$$;


-- ============================================================
-- 6. SUPER ADMIN CHECK
-- ============================================================

create or replace function public.is_super_admin(
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

    where ur.user_id = auth.uid()

      and p.is_active = true

      and ur.organization_id = target_organization_id

      -- Super admin must be organisation scoped.
      and ur.branch_id is null

      and r.name = 'super_admin'
  );
$$;


-- ============================================================
-- 7. NORMALISE EXISTING SUPER ADMIN ASSIGNMENTS
-- ============================================================
--
-- The previous onboarding workaround stored both organisation
-- and branch IDs for super_admin because the old primary key
-- effectively required both.
--
-- Super admins should now be organisation-scoped.

update public.user_roles ur
set branch_id = null
from public.roles r
where ur.role_id = r.id
  and r.name = 'super_admin'
  and ur.organization_id is not null
  and ur.branch_id is not null;


-- ============================================================
-- 8. UPDATE ONBOARDING FOR CORRECT SUPER ADMIN SCOPE
-- ============================================================

create or replace function public.create_initial_business(
  business_name text,
  business_slug text,
  branch_name text
)
returns json
language plpgsql
security definer
set search_path = public
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
    is_default
  )
  values (
    current_user_id,
    new_org_id,
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


grant execute
on function public.create_initial_business(text, text, text)
to authenticated;


-- ============================================================
-- 9. STAFF VISIBILITY HELPERS
-- ============================================================

create or replace function public.can_view_organization_staff(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
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
    );
$$;


create or replace function public.can_manage_organization_staff(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(
    'users.manage',
    target_organization_id,
    null
  );
$$;


-- ============================================================
-- 10. IMPROVE STAFF-RELATED RLS
-- ============================================================


-- ------------------------------------------------------------
-- USER ORGANISATIONS
-- ------------------------------------------------------------

drop policy if exists
"Users can view their organization links"
on public.user_organizations;


create policy
"Users can view organization user links"
on public.user_organizations
for select
to authenticated
using (
  user_id = auth.uid()

  or

  public.has_permission(
    'users.view',
    organization_id,
    null
  )

  or

  public.has_permission(
    'users.manage',
    organization_id,
    null
  )
);


-- Existing management policy is recreated to ensure it uses
-- the strengthened permission function.

drop policy if exists
"Super admins can manage organization users"
on public.user_organizations;


create policy
"Authorized admins can manage organization users"
on public.user_organizations
for all
to authenticated
using (
  public.has_permission(
    'users.manage',
    organization_id,
    null
  )
)
with check (
  public.has_permission(
    'users.manage',
    organization_id,
    null
  )
);


-- ------------------------------------------------------------
-- USER BRANCHES
-- ------------------------------------------------------------

drop policy if exists
"Users can view their branch links"
on public.user_branches;


create policy
"Users can view authorized branch user links"
on public.user_branches
for select
to authenticated
using (

  user_id = auth.uid()

  or

  exists (
    select 1
    from public.branches b
    where b.id = user_branches.branch_id

      and (
        public.has_permission(
          'users.view',
          b.organization_id,
          b.id
        )

        or

        public.has_permission(
          'users.manage',
          b.organization_id,
          b.id
        )
      )
  )

);


drop policy if exists
"Branch managers can manage branch users"
on public.user_branches;


create policy
"Authorized managers can manage branch users"
on public.user_branches
for all
to authenticated
using (
  exists (
    select 1
    from public.branches b
    where b.id = user_branches.branch_id

      and public.has_permission(
        'users.manage',
        b.organization_id,
        b.id
      )
  )
)
with check (
  exists (
    select 1
    from public.branches b
    where b.id = user_branches.branch_id

      and public.has_permission(
        'users.manage',
        b.organization_id,
        b.id
      )
  )
);


-- ------------------------------------------------------------
-- USER ROLES
-- ------------------------------------------------------------

drop policy if exists
"Users can view their role assignments"
on public.user_roles;


create policy
"Users can view authorized role assignments"
on public.user_roles
for select
to authenticated
using (

  user_id = auth.uid()

  or

  (
    branch_id is null

    and (
      public.has_permission(
        'users.view',
        organization_id,
        null
      )

      or

      public.has_permission(
        'users.manage',
        organization_id,
        null
      )
    )
  )

  or

  (
    branch_id is not null

    and (
      public.has_permission(
        'users.view',
        organization_id,
        branch_id
      )

      or

      public.has_permission(
        'users.manage',
        organization_id,
        branch_id
      )
    )
  )

);


drop policy if exists
"Admins can manage user roles"
on public.user_roles;


create policy
"Authorized admins can manage user roles"
on public.user_roles
for all
to authenticated
using (

  (
    branch_id is null

    and public.has_permission(
      'roles.manage',
      organization_id,
      null
    )
  )

  or

  (
    branch_id is not null

    and public.has_permission(
      'roles.manage',
      organization_id,
      branch_id
    )
  )

)
with check (

  (
    branch_id is null

    and public.has_permission(
      'roles.manage',
      organization_id,
      null
    )
  )

  or

  (
    branch_id is not null

    and public.has_permission(
      'roles.manage',
      organization_id,
      branch_id
    )
  )

);


-- ============================================================
-- 11. GRANTS
-- ============================================================

grant execute
on function public.has_permission(text, uuid, uuid)
to authenticated;

grant execute
on function public.is_org_member(uuid)
to authenticated;

grant execute
on function public.is_branch_member(uuid)
to authenticated;

grant execute
on function public.is_super_admin(uuid)
to authenticated;

grant execute
on function public.can_view_organization_staff(uuid)
to authenticated;

grant execute
on function public.can_manage_organization_staff(uuid)
to authenticated;