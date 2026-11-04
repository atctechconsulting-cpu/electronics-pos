-- Invitation delivery coordination only; no employee access records are changed.
begin;

-- Auth invitations are global identities: serialize across ALL organisations.
create table public.staff_invitation_resends (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  reservation_id uuid not null,
  reserved_at timestamptz not null,
  retry_after timestamptz not null,
  state text not null check (state in ('reserved','sending','sent','failed','unknown')),
  check (retry_after > reserved_at)
);
alter table public.staff_invitation_resends enable row level security;
revoke all on public.staff_invitation_resends from public, anon, authenticated, service_role;

create function public.staff_resend_assert_actor(p_org uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception using message='RESEND_UNAUTHENTICATED', errcode='28000';
  end if;
  if p_org is null or not public.has_permission('users.manage',p_org,null)
    or not public.has_permission('roles.manage',p_org,null) then
    raise exception using message='RESEND_FORBIDDEN', errcode='42501';
  end if;
end;
$$;

-- Internal lock/check shared by reservation and dispatch. Staff activation uses
-- the same organisation lock. Fresh statements after waits require READ COMMITTED.
create function public.staff_resend_lock_target(p_org uuid,p_user uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_pending boolean; v_global boolean; v_member boolean;
begin
  perform public.staff_resend_assert_actor(p_org);
  if p_user is null then raise exception 'RESEND_INVALID_TARGET'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'RESEND_UNAVAILABLE';
  end if;
  perform 1 from public.organizations where id=p_org for update;
  perform p.id from public.profiles p where p.id in (auth.uid(),p_user) order by p.id for update;
  perform 1 from public.user_organizations u where u.organization_id=p_org
    and u.user_id in (auth.uid(),p_user) for share;
  perform 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions perm on perm.id=rp.permission_id
    where ur.user_id=auth.uid() and ur.organization_id=p_org and ur.branch_id is null
      and perm.key in ('users.manage','roles.manage') for share of ur,r,rp,perm;
  perform public.staff_resend_assert_actor(p_org);
  select p.is_active,u.is_active into v_global,v_member
    from public.profiles p join public.user_organizations u on u.user_id=p.id
    where p.id=p_user and u.organization_id=p_org;
  if not found then raise exception 'RESEND_INVALID_TARGET'; end if;
  if not v_global or not v_member then raise exception 'RESEND_INACTIVE'; end if;
  select a.email,(a.invited_at is not null and a.email_confirmed_at is null and a.last_sign_in_at is null)
    into v_email,v_pending from auth.users a where a.id=p_user;
  if not found or nullif(btrim(v_email),'') is null then raise exception 'RESEND_INVALID_TARGET'; end if;
  if not v_pending then raise exception 'RESEND_NOT_PENDING'; end if;
  return v_email;
end;
$$;

create function public.get_staff_invitation_status(p_org uuid)
returns table(user_id uuid,pending boolean,eligible boolean,retry_after timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.staff_resend_assert_actor(p_org);
  return query select p.id,
    (a.invited_at is not null and a.email_confirmed_at is null and a.last_sign_in_at is null),
    (p.is_active and u.is_active and a.invited_at is not null
      and a.email_confirmed_at is null and a.last_sign_in_at is null),
    case when s.retry_after > statement_timestamp() then s.retry_after else null end
  from public.user_organizations u join public.profiles p on p.id=u.user_id
    join auth.users a on a.id=p.id left join public.staff_invitation_resends s on s.user_id=p.id
  where u.organization_id=p_org;
end;
$$;

create function public.reserve_staff_invitation_resend(p_org uuid,p_user uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_now timestamptz;
begin
  perform public.staff_resend_lock_target(p_org,p_user);
  -- Profile row lock serializes the absent-reservation case across organisations.
  v_now := clock_timestamp();
  if exists(select 1 from public.staff_invitation_resends s
    where s.user_id=p_user and s.retry_after > v_now) then raise exception 'RESEND_COOLDOWN'; end if;
  insert into public.staff_invitation_resends as current_reservation(user_id,organization_id,requested_by,reservation_id,reserved_at,retry_after,state)
  values(p_user,p_org,auth.uid(),v_id,v_now,v_now+interval '15 minutes','reserved')
  on conflict(user_id) do update set organization_id=excluded.organization_id,
    requested_by=excluded.requested_by,reservation_id=excluded.reservation_id,
    reserved_at=excluded.reserved_at,retry_after=excluded.retry_after,state='reserved'
  -- The earlier check is only a fast rejection. Under READ COMMITTED, conflict
  -- resolution locks/rechecks the current row, including a concurrent finish
  -- that extended its cooldown after that check. Never overwrite that extension.
  where current_reservation.retry_after <= clock_timestamp();
  if not found then raise exception 'RESEND_COOLDOWN'; end if;
  return jsonb_build_object('reservation_id',v_id);
end;
$$;

create function public.dispatch_staff_invitation_resend(p_org uuid,p_user uuid,p_reservation uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_email text;
begin
  v_email := public.staff_resend_lock_target(p_org,p_user);
  -- Single-use, short-lived dispatch: a paused/duplicated request cannot reuse it.
  update public.staff_invitation_resends set state='sending'
  where user_id=p_user and organization_id=p_org and requested_by=auth.uid()
    and reservation_id=p_reservation and state='reserved'
    and reserved_at > clock_timestamp()-interval '60 seconds';
  if not found then raise exception 'RESEND_UNAVAILABLE'; end if;
  return jsonb_build_object('email',v_email);
end;
$$;

-- Server-only bookkeeping, not authorization to send. Never changes access or
-- clears the reservation. Stale completions cannot overwrite a newer attempt.
create function public.finish_staff_invitation_resend(p_org uuid,p_user uuid,p_reservation uuid,p_outcome text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using message='RESEND_FORBIDDEN', errcode='42501';
  end if;
  if p_outcome is null or p_outcome not in ('sent','failed','unknown') then raise exception 'RESEND_UNAVAILABLE'; end if;
  update public.staff_invitation_resends set state=p_outcome,
    retry_after=case when p_outcome='unknown' then greatest(retry_after,clock_timestamp()+interval '15 minutes')
      else greatest(reserved_at+interval '5 minutes',clock_timestamp()+interval '5 minutes') end
    where user_id=p_user and organization_id=p_org and reservation_id=p_reservation and state='sending';
  return found;
end;
$$;

revoke all on function public.staff_resend_assert_actor(uuid),public.staff_resend_lock_target(uuid,uuid),
  public.get_staff_invitation_status(uuid),public.reserve_staff_invitation_resend(uuid,uuid),
  public.dispatch_staff_invitation_resend(uuid,uuid,uuid),public.finish_staff_invitation_resend(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_staff_invitation_status(uuid),public.reserve_staff_invitation_resend(uuid,uuid),
  public.dispatch_staff_invitation_resend(uuid,uuid,uuid) to authenticated;
grant execute on function public.finish_staff_invitation_resend(uuid,uuid,uuid,text) to service_role;

do $$
declare r text; f record;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(r,'public.staff_invitation_resends','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege(r,'public.staff_invitation_resends','SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Unexpected resend table privilege';
    end if;
    for f in select p.oid,p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('staff_resend_assert_actor','staff_resend_lock_target',
        'get_staff_invitation_status','reserve_staff_invitation_resend','dispatch_staff_invitation_resend','finish_staff_invitation_resend') loop
      if has_function_privilege(r,f.oid,'EXECUTE') is distinct from
        ((r='authenticated' and f.proname in ('get_staff_invitation_status','reserve_staff_invitation_resend','dispatch_staff_invitation_resend'))
         or (r='service_role' and f.proname='finish_staff_invitation_resend')) then
        raise exception 'Unexpected resend function privilege';
      end if;
    end loop;
  end loop;
end;
$$;
commit;
