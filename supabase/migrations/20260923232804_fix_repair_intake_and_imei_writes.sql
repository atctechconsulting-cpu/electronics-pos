begin;

-- Replace only the affected Repairs RPC; CREATE OR REPLACE preserves its ACL.
create or replace function public.create_repair(p_org uuid,p_branch uuid,p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_job public.repair_jobs;
  v_customer public.customers;
  v_product public.products;
  v_serial public.product_serials;
  v_product_id uuid := nullif(p_data->>'product_id','')::uuid;
  v_serial_id uuid := nullif(p_data->>'product_serial_id','')::uuid;
  v_category_id uuid := nullif(p_data->>'category_id','')::uuid;
  v_brand_id uuid := nullif(p_data->>'brand_id','')::uuid;
  v_assignee uuid := nullif(p_data->>'assigned_to','')::uuid;
  v_imei text;
begin
  perform public.repair_assert_access(p_org,p_branch,true);
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>50000 then raise exception 'Invalid repair details'; end if;
  if not public.has_organization_permission_any_scope('customers.view',p_org) then
    raise exception using errcode='42501',message='Customer viewing permission is required';
  end if;
  select cust.* into v_customer from public.customers cust
  where cust.id=(p_data->>'customer_id')::uuid and cust.organization_id=p_org and cust.is_active for share;
  if not found then raise exception 'Select an active customer in this organisation'; end if;
  if v_serial_id is not null then
    select ps.* into v_serial from public.product_serials ps where ps.id=v_serial_id and ps.organization_id=p_org for share;
    if not found then raise exception 'Serial record does not belong to this organisation'; end if;
    if not public.has_permission('inventory.view',p_org,v_serial.branch_id) then
      raise exception using errcode='42501',message='Permission to view the source serial branch is required';
    end if;
    if v_product_id is not null and v_product_id<>v_serial.product_id then raise exception 'Serial and product do not match'; end if;
    v_product_id:=v_serial.product_id;
  end if;
  if v_product_id is not null then
    if not public.has_permission('products.view',p_org,p_branch) then
      raise exception using errcode='42501',message='Product viewing permission is required';
    end if;
    select prod.* into v_product from public.products prod where prod.id=v_product_id and prod.organization_id=p_org for share;
    if not found then raise exception 'Product does not belong to this organisation'; end if;
    v_category_id:=v_product.category_id;
    v_brand_id:=v_product.brand_id;
  end if;
  if v_category_id is not null and not exists(select 1 from public.categories cat where cat.id=v_category_id and cat.organization_id=p_org) then raise exception 'Invalid device category'; end if;
  if v_brand_id is not null and not exists(select 1 from public.brands br where br.id=v_brand_id and br.organization_id=p_org) then raise exception 'Invalid device brand'; end if;
  perform 1 from public.profiles prof where prof.id=v_assignee for share;
  if not public.repair_assignee_eligible(v_assignee,p_org,p_branch) then raise exception 'Assignee is not eligible for this branch'; end if;

  -- Never repair, truncate or replace a legacy identifier while taking a repair.
  v_imei:=case when v_serial_id is not null then v_serial.imei else nullif(trim(p_data->>'imei'),'') end;
  if v_imei is not null and v_imei !~ '^[0-9]{15}$' then
    raise exception using errcode='23514',message='IMEI must contain exactly 15 digits.';
  end if;
  insert into public.repair_jobs(organization_id,branch_id,customer_id,customer_name,customer_phone,customer_email,
    product_id,product_serial_id,category_id,brand_id,product_name,device_type,brand_name,model,imei,serial_number,
    accessories_received,fault_description,physical_condition,intake_notes,priority,assigned_to,
    estimated_amount,estimated_completion_at,created_by,updated_by)
  values(p_org,p_branch,v_customer.id,trim(concat_ws(' ',v_customer.first_name,v_customer.last_name)),v_customer.phone,v_customer.email,
    v_product_id,v_serial_id,v_category_id,v_brand_id,v_product.name,trim(p_data->>'device_type'),
    coalesce((select br.name from public.brands br where br.id=v_brand_id),nullif(trim(p_data->>'brand_name'),'')),
    coalesce(nullif(trim(p_data->>'model'),''),v_product.name),v_imei,
    case when v_serial_id is not null then v_serial.serial_number else nullif(trim(p_data->>'serial_number'),'') end,
    nullif(p_data->>'accessories_received',''),trim(p_data->>'fault_description'),nullif(p_data->>'physical_condition',''),
    nullif(p_data->>'intake_notes',''),coalesce(p_data->>'priority','normal'),v_assignee,
    nullif(p_data->>'estimated_amount','')::numeric,nullif(p_data->>'estimated_completion_at','')::timestamptz,auth.uid(),auth.uid())
  returning * into v_job;
  perform public.repair_event(v_job,'created',null,jsonb_build_object('job_number',v_job.job_number),null,v_job.status);
  return v_job.id;
end;
$$;

-- NOT VALID CHECK still rejects status-only updates of legacy malformed rows.
-- Defer that constraint until controlled cleanup. Enforce all inserts and actual
-- identifier changes without blocking sales/returns that retain a legacy IMEI.
-- AFTER sees final values even if another BEFORE trigger changes the row.
create function public.enforce_product_serial_imei()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP='UPDATE' then
    if NEW.imei is not distinct from OLD.imei then return NEW; end if;
  end if;
  if NEW.imei is not null and NEW.imei !~ '^[0-9]{15}$' then
    raise exception using errcode='23514',message='IMEI must contain exactly 15 digits.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_product_serial_imei() from public,anon,authenticated,service_role;
create trigger product_serial_imei_write_guard
after insert or update on public.product_serials
for each row execute function public.enforce_product_serial_imei();

commit;
