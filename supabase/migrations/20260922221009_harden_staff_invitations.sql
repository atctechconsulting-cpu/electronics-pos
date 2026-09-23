-- Stage 3: caller-JWT invitation authorization and atomic database provisioning.
-- Auth invitation/email delivery remains an external, non-transactional step.
begin;

create function public.authorize_staff_invitation(
  target_organization_id uuid,
  target_role_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  role_name text;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception using errcode = '28000', message = 'INVITE_UNAUTHENTICATED';
  end if;
  if target_organization_id is null or target_role_id is null then
    raise exception using errcode = '22023', message = 'INVITE_INVALID_SCOPE';
  end if;
  -- has_permission includes global status AND active membership. NULL branch
  -- deliberately requires organisation-scoped grants for BOTH permissions.
  -- The current invitation contract always assigns a role.
  if not exists (select 1 from public.organizations where id = target_organization_id)
    or not public.has_permission('users.manage', target_organization_id, null)
    or not public.has_permission('roles.manage', target_organization_id, null) then
    raise exception using errcode = '42501', message = 'INVITE_FORBIDDEN';
  end if;

  select r.name into role_name from public.roles r where r.id = target_role_id;
  if not found then
    raise exception using errcode = '22023', message = 'INVITE_INVALID_SCOPE';
  end if;
  if role_name in ('super_admin', 'accountant') then
    if target_branch_id is not null then
      raise exception using errcode = '22023', message = 'INVITE_INVALID_SCOPE';
    end if;
  elsif role_name in ('branch_manager', 'cashier', 'inventory_officer') then
    if target_branch_id is null or not exists (
      select 1 from public.branches b
      where b.id = target_branch_id and b.organization_id = target_organization_id
    ) then
      raise exception using errcode = '22023', message = 'INVITE_INVALID_SCOPE';
    end if;
  else
    raise exception using errcode = '22023', message = 'INVITE_INVALID_SCOPE';
  end if;
  return jsonb_build_object('success', true);
end;
$$;

create function public.finalize_staff_invitation(
  target_organization_id uuid,
  target_user_id uuid,
  target_email text,
  target_role_id uuid,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  membership_active boolean;
  account_active boolean;
  first_membership boolean;
  pending_invitation boolean;
  invitation_metadata jsonb;
begin
  -- Independently safe when called directly; preflight is not a capability.
  perform public.authorize_staff_invitation(target_organization_id, target_role_id, target_branch_id);
  if target_user_id is null or target_email is null
    or length(trim(target_email)) not between 3 and 254
    or trim(target_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'INVITE_INVALID_TARGET';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'INVITE_REQUIRES_READ_COMMITTED';
  end if;

  -- Same organisation lock as Stage 2 staff mutations. No change to those RPCs.
  -- Translate the helper's authorization race error into a safe API code.
  begin
    perform public.lock_staff_administration(target_organization_id, 'users.manage');
  exception when raise_exception then
    raise exception using errcode = '42501', message = 'INVITE_FORBIDDEN';
  end;

  -- Lock both identities in deterministic order, then recheck with a fresh
  -- READ COMMITTED statement. Global suspension cannot commit between the
  -- final authorization check and the writes. Target locking also serializes
  -- invitations into different organisations and first-membership selection.
  perform p.id from public.profiles p
  where p.id in (auth.uid(), target_user_id)
  order by p.id for update;

  -- Stabilize the actor's authorization rows, including against trusted direct
  -- revocations that do not use the organisation lock. Missing rows fail the
  -- subsequent permission check; locks do not manufacture authorization.
  perform 1 from public.user_organizations uo
  where uo.user_id = auth.uid() and uo.organization_id = target_organization_id
  for share;
  perform 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions perm on perm.id = rp.permission_id
  where ur.user_id = auth.uid() and ur.organization_id = target_organization_id
    and ur.branch_id is null and perm.key in ('users.manage', 'roles.manage')
  for share of ur, r, rp, perm;
  perform 1 from public.roles where id = target_role_id for share;
  if target_branch_id is not null then
    perform 1 from public.branches where id = target_branch_id for share;
  end if;

  -- Recheck before disclosing target status if authorization changed while waiting.
  perform public.authorize_staff_invitation(target_organization_id, target_role_id, target_branch_id);

  select (au.invited_at is not null and au.last_sign_in_at is null), au.raw_user_meta_data
  into pending_invitation, invitation_metadata
  from auth.users au
  where au.id = target_user_id and lower(trim(au.email)) = lower(trim(target_email));
  if not found then
    raise exception using errcode = '22023', message = 'INVITE_INVALID_TARGET';
  end if;
  select p.is_active into account_active from public.profiles p where p.id = target_user_id;
  if not found then
    raise exception using errcode = '22023', message = 'INVITE_INVALID_TARGET';
  end if;
  if not account_active then
    raise exception using errcode = 'P0001', message = 'INVITE_INACTIVE_TARGET';
  end if;

  select uo.is_active into membership_active from public.user_organizations uo
  where uo.user_id = target_user_id and uo.organization_id = target_organization_id;
  if found then
    if membership_active then
      raise exception using errcode = 'P0001', message = 'INVITE_ALREADY_MEMBER';
    else
      raise exception using errcode = 'P0001', message = 'INVITE_INACTIVE_MEMBER';
    end if;
  end if;

  -- Do not activate orphaned access left by an older partial provisioning flow.
  if exists (select 1 from public.user_roles ur
    where ur.user_id = target_user_id and ur.organization_id = target_organization_id)
    or exists (select 1 from public.user_branches ub
      join public.branches b on b.id = ub.branch_id
      where ub.user_id = target_user_id and b.organization_id = target_organization_id) then
    raise exception using errcode = '22023', message = 'INVITE_INVALID_TARGET';
  end if;
  first_membership := not exists (
    select 1 from public.user_organizations where user_id = target_user_id
  );

  -- Final actor/scope check immediately before the first provisioning mutation.
  perform public.authorize_staff_invitation(target_organization_id, target_role_id, target_branch_id);

  -- handle_new_user already creates the profile/full_name. Only fill missing
  -- contact fields for a never-signed-in invited identity with no memberships,
  -- using its stored Auth metadata, never a browser "new user" flag. Existing
  -- multi-organisation profiles and global status are not overwritten.
  if first_membership and pending_invitation then
    update public.profiles
    set phone = coalesce(phone, nullif(left(trim(invitation_metadata ->> 'phone'), 40), '')),
        job_title = coalesce(job_title, nullif(left(trim(invitation_metadata ->> 'job_title'), 120), ''))
    where id = target_user_id;
  end if;

  insert into public.user_organizations (user_id, organization_id, is_default, is_active)
  values (target_user_id, target_organization_id, first_membership, true);

  if target_branch_id is not null then
    insert into public.user_branches (user_id, branch_id, is_default)
    values (target_user_id, target_branch_id, true);
  end if;
  insert into public.user_roles (user_id, organization_id, role_id, branch_id)
  values (target_user_id, target_organization_id, target_role_id, target_branch_id);

  return jsonb_build_object('success', true, 'user_id', target_user_id,
    'organization_id', target_organization_id);
end;
$$;

-- Retire the old service-role provisioning bypass without DROP/CASCADE or
-- changing a deployed migration. Even an unexpected retained owner/dependent
-- call cannot provision through this obsolete entry point.
create or replace function public.register_invited_staff(
  target_user_id uuid, target_organization_id uuid, target_full_name text,
  target_job_title text default null, target_phone text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'INVITE_LEGACY_DISABLED';
end;
$$;

revoke all on function public.register_invited_staff(uuid, uuid, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.authorize_staff_invitation(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.finalize_staff_invitation(uuid, uuid, text, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.authorize_staff_invitation(uuid, uuid, uuid) to authenticated;
grant execute on function public.finalize_staff_invitation(uuid, uuid, text, uuid, uuid) to authenticated;

-- Assert effective privileges, including inherited/PUBLIC grants. Do not alter
-- Stage 1/2 table privileges, policies, helpers, or last-admin safeguards.
do $$
declare
  role_name text;
  signature text;
  relation_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    foreach signature in array array[
      'public.authorize_staff_invitation(uuid,uuid,uuid)',
      'public.finalize_staff_invitation(uuid,uuid,text,uuid,uuid)'
    ] loop
      if has_function_privilege(role_name, signature, 'EXECUTE')
        is distinct from (role_name = 'authenticated') then
        raise exception 'Unexpected invitation EXECUTE privilege';
      end if;
    end loop;
    if has_function_privilege(role_name,
      'public.register_invited_staff(uuid,uuid,text,text,text)', 'EXECUTE') then
      raise exception 'Legacy invitation function must not be executable';
    end if;
  end loop;
  foreach relation_name in array array[
    'public.user_organizations', 'public.user_branches', 'public.user_roles'
  ] loop
    foreach role_name in array array['anon', 'authenticated'] loop
      if has_table_privilege(role_name, relation_name,
        'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
        or has_any_column_privilege(role_name, relation_name, 'INSERT, UPDATE, REFERENCES') then
        raise exception 'Unexpected membership mutation privileges';
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_policy
      where polrelid = relation_name::regclass and polcmd <> 'r')
      or not exists (select 1 from pg_catalog.pg_class
        where oid = relation_name::regclass and relrowsecurity) then
      raise exception 'Stage 2 membership RLS must remain intact';
    end if;
  end loop;
end;
$$;

commit;
