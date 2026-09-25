begin;

-- Fail safely on legacy collisions; never rewrite deployed branch identities.
do $$
begin
  if exists (select 1 from public.branches b group by b.organization_id,upper(btrim(b.code)) having count(*)>1) then
    raise exception 'Duplicate normalized branch codes exist. Review the pre-deployment audit before retrying.';
  end if;
end;
$$;
create unique index branches_org_normalized_code_unique
on public.branches (organization_id,upper(btrim(code)));

-- Preserve the foundation SELECT policy, including inactive historical joins.
drop policy "Super admins can manage branches" on public.branches;
revoke all privileges on table public.branches from public,anon,authenticated,service_role;
do $$
declare v_columns text;
begin
  select string_agg(quote_ident(attname),',') into v_columns from pg_catalog.pg_attribute
  where attrelid='public.branches'::regclass and attnum>0 and not attisdropped;
  execute format('revoke all privileges (%s) on table public.branches from public,anon,authenticated,service_role',v_columns);
end;
$$;
grant select on table public.branches to authenticated,service_role;

create function public.branch_management_lock(p_org uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or p_org is null or not public.has_permission('branches.manage',p_org,null) then
    raise exception using errcode='42501',message='You do not have permission to manage branches in this organisation.';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Branch changes require READ COMMITTED isolation.';
  end if;
  -- Same organisation-first order as Stage 2 Staff Administration and Repairs.
  perform 1 from public.organizations org where org.id=p_org for update;
  if not found then raise exception 'Organisation not found.'; end if;
  perform 1 from public.profiles prof where prof.id=auth.uid() and prof.is_active for share;
  if not found or not public.has_permission('branches.manage',p_org,null) then
    raise exception using errcode='42501',message='Your branch management access has changed.';
  end if;
end;
$$;

create function public.branch_validate_data(p_data jsonb,p_create boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_key text; v_value jsonb; v_text text; v_limit integer; v_result jsonb:='{}'::jsonb;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then
    raise exception 'Invalid branch details.';
  end if;
  for v_key,v_value in select entry.key,entry.value from jsonb_each(p_data) entry loop
    if v_key not in ('name','email','phone','address_line_1','address_line_2','city','county','postcode','country')
      and not (p_create and v_key='code') then
      raise exception 'This branch field cannot be changed: %',v_key;
    end if;
    if jsonb_typeof(v_value) not in ('string','null') then raise exception 'Branch fields must contain text.'; end if;
    v_text:=nullif(btrim(p_data->>v_key),'');
    if v_key='code' then v_text:=upper(v_text); end if;
    v_limit:=case v_key when 'name' then 200 when 'code' then 64 when 'email' then 320
      when 'phone' then 50 when 'postcode' then 40 when 'address_line_1' then 300
      when 'address_line_2' then 300 else 120 end;
    if length(v_text)>v_limit then raise exception 'Branch % is too long (maximum % characters).',v_key,v_limit; end if;
    if v_key in ('name','code','country') and v_text is null then raise exception 'Branch % is required.',v_key; end if;
    if v_key='email' and v_text is not null and v_text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid branch email address.';
    end if;
    v_result:=v_result || jsonb_build_object(v_key,v_text);
  end loop;
  if p_create then
    if not (v_result ? 'name') or not (v_result ? 'code') then raise exception 'Branch name and code are required.'; end if;
    if not (v_result ? 'country') then v_result:=v_result || '{"country":"United Kingdom"}'::jsonb; end if;
  end if;
  return v_result;
end;
$$;

create function public.get_organization_branches(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' or p_org is null
    or not public.has_organization_permission_any_scope('branches.view',p_org) then
    raise exception using errcode='42501',message='You do not have permission to view branches in this organisation.';
  end if;
  return jsonb_build_object(
    'can_manage',public.has_permission('branches.manage',p_org,null),
    'branches',(select coalesce(jsonb_agg(to_jsonb(b) order by b.is_head_office desc,b.name,b.id),'[]'::jsonb)
      from public.branches b where b.organization_id=p_org
        and public.has_permission('branches.view',p_org,b.id)));
end;
$$;

create function public.create_branch(p_org uuid,p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_data jsonb; v_branch_id uuid;
begin
  perform public.branch_management_lock(p_org);
  v_data:=public.branch_validate_data(p_data,true);
  if exists(select 1 from public.branches b where b.organization_id=p_org and upper(btrim(b.code))=v_data->>'code') then
    raise exception 'A branch with this code already exists in this organisation.';
  end if;
  insert into public.branches(organization_id,name,code,email,phone,address_line_1,address_line_2,city,county,postcode,country,is_active,is_head_office)
  values(p_org,v_data->>'name',v_data->>'code',v_data->>'email',v_data->>'phone',v_data->>'address_line_1',v_data->>'address_line_2',
    v_data->>'city',v_data->>'county',v_data->>'postcode',v_data->>'country',true,false)
  returning id into v_branch_id;
  insert into public.user_branches(user_id,branch_id,is_default)
  values(auth.uid(),v_branch_id,false) on conflict (user_id,branch_id) do nothing;
  return v_branch_id;
end;
$$;

create function public.update_branch(p_org uuid,p_branch uuid,p_data jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_branch public.branches; v_changed public.branches;
begin
  perform public.branch_management_lock(p_org);
  select b.* into v_branch from public.branches b where b.id=p_branch and b.organization_id=p_org for update;
  if not found then raise exception 'Branch not found in this organisation.'; end if;
  v_changed:=jsonb_populate_record(v_branch,public.branch_validate_data(p_data,false));
  update public.branches b set name=v_changed.name,email=v_changed.email,phone=v_changed.phone,
    address_line_1=v_changed.address_line_1,address_line_2=v_changed.address_line_2,city=v_changed.city,
    county=v_changed.county,postcode=v_changed.postcode,country=v_changed.country,updated_at=now()
  where b.id=v_branch.id;
end;
$$;

create function public.set_branch_active_status(p_org uuid,p_branch uuid,p_active boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_branch public.branches;
begin
  perform public.branch_management_lock(p_org);
  if p_active is null then raise exception 'Select an active status.'; end if;
  -- Conflicts with operational FOR SHARE locks. Check blockers in subsequent
  -- statements after any wait so READ COMMITTED sees the completed transaction.
  select b.* into v_branch from public.branches b where b.id=p_branch and b.organization_id=p_org for update;
  if not found then raise exception 'Branch not found in this organisation.'; end if;
  if v_branch.is_active=p_active then return; end if;
  if not p_active then
    if v_branch.is_head_office then raise exception 'Head office cannot be deactivated.'; end if;
    if not exists(select 1 from public.branches b where b.organization_id=p_org and b.id<>p_branch and b.is_active) then
      raise exception 'At least one active branch is required.';
    end if;
    if exists(select 1 from public.inventory inv where inv.branch_id=p_branch
      and (inv.quantity_on_hand>0 or inv.quantity_reserved>0))
      or exists(select 1 from public.product_serials ps where ps.branch_id=p_branch and ps.status='IN_STOCK') then
      raise exception 'Branch has stock remaining.';
    end if;
    -- Cancelled is not collected: a physical device can still be held by the shop.
    if exists(select 1 from public.repair_jobs job where job.branch_id=p_branch and job.collected_at is null) then
      raise exception 'Branch has open repairs. Collect all devices before deactivation.';
    end if;
    if exists(select 1 from public.purchase_orders po where po.branch_id=p_branch
      and po.status in ('DRAFT','SUBMITTED','ORDERED','PARTIALLY_RECEIVED')) then
      raise exception 'Branch has open purchase orders.';
    end if;
  end if;
  update public.branches b set is_active=p_active,updated_at=now() where b.id=v_branch.id;
end;
$$;

-- One narrow write boundary covers the existing guarded operational RPCs without
-- replacing their authorization or transaction bodies. SELECT/RLS is unchanged.
create function public.enforce_active_operational_branch()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_branch uuid; v_row jsonb; v_old jsonb; v_active boolean;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Operational branch changes require READ COMMITTED isolation.';
  end if;
  v_row:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  if TG_TABLE_NAME='purchase_order_items' then
    select po.organization_id,po.branch_id into v_org,v_branch from public.purchase_orders po
    where po.id=(v_row->>'purchase_order_id')::uuid;
    -- The parent's BEFORE DELETE guard already holds the branch lock during
    -- ON DELETE CASCADE; the deleted parent is no longer visible to its children.
    if not found and TG_OP='DELETE' then return OLD; end if;
  else
    v_org:=(v_row->>'organization_id')::uuid;
    v_branch:=(v_row->>'branch_id')::uuid;
  end if;
  if TG_OP='UPDATE' then
    v_old:=to_jsonb(OLD);
    if (v_row->'organization_id') is distinct from (v_old->'organization_id')
      or (v_row->'branch_id') is distinct from (v_old->'branch_id')
      or (TG_TABLE_NAME='purchase_order_items' and (v_row->'purchase_order_id') is distinct from (v_old->'purchase_order_id')) then
      raise exception 'Operational records cannot be moved between branches.';
    end if;
  end if;
  -- Take the organisation lock first, including before later FK checks. This
  -- avoids branch-SHARE -> organisation-KEY-SHARE reversing management's order.
  perform 1 from public.organizations org where org.id=v_org for key share;
  if not found then raise exception 'Operational organisation not found.'; end if;
  select b.is_active into v_active from public.branches b
  where b.id=v_branch and b.organization_id=v_org for share;
  if not found then raise exception 'Operational branch does not belong to the organisation.'; end if;
  if not v_active then raise exception 'This branch is inactive. An authorised administrator must reactivate it before new operations.'; end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$$;

-- Explicit table list: no dependency on hypothetical transfer tables.
create trigger active_branch_write_guard before insert or update or delete on public.inventory
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.stock_movements
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.product_serials
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.sales
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.sale_items
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.payments
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.returns
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.return_items
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.purchase_orders
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.purchase_order_items
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.repair_jobs
for each row execute function public.enforce_active_operational_branch();
create trigger active_branch_write_guard before insert or update or delete on public.repair_payments
for each row execute function public.enforce_active_operational_branch();

revoke all on function public.branch_management_lock(uuid),public.branch_validate_data(jsonb,boolean),
  public.enforce_active_operational_branch() from public,anon,authenticated,service_role;
revoke all on function public.get_organization_branches(uuid),public.create_branch(uuid,jsonb),
  public.update_branch(uuid,uuid,jsonb),public.set_branch_active_status(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.get_organization_branches(uuid),public.create_branch(uuid,jsonb),
  public.update_branch(uuid,uuid,jsonb),public.set_branch_active_status(uuid,uuid,boolean) to authenticated;

do $$
declare v_role text; v_function record;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if has_table_privilege(v_role,'public.branches','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege(v_role,'public.branches','INSERT,UPDATE,REFERENCES') then
      raise exception 'Unexpected direct branch mutation privileges for %.',v_role;
    end if;
    if has_table_privilege(v_role,'public.branches','SELECT') is distinct from (v_role='authenticated')
      or has_any_column_privilege(v_role,'public.branches','SELECT') is distinct from (v_role='authenticated') then
      raise exception 'Unexpected branch read privileges for %.',v_role;
    end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_policy where polrelid='public.branches'::regclass and polcmd<>'r') then
    raise exception 'Unexpected branch write policy remains.';
  end if;
  if not exists(select 1 from pg_catalog.pg_class where oid='public.branches'::regclass and relrowsecurity) then
    raise exception 'Branch RLS must remain enabled.';
  end if;
  for v_function in select p.oid,p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('branch_management_lock','branch_validate_data','enforce_active_operational_branch',
      'get_organization_branches','create_branch','update_branch','set_branch_active_status') loop
    if has_function_privilege('anon',v_function.oid,'EXECUTE') or has_function_privilege('service_role',v_function.oid,'EXECUTE')
      or has_function_privilege('authenticated',v_function.oid,'EXECUTE') is distinct from
        (v_function.proname in ('get_organization_branches','create_branch','update_branch','set_branch_active_status')) then
      raise exception 'Unexpected branch RPC privileges.';
    end if;
  end loop;
end;
$$;
commit;
