begin;

-- Preserve the strict repair_jobs.imei CHECK and normal create_repair validation.
-- An existing serial ID is authoritative; free-text-only claims still match exactly.
create or replace function public.warranty_check_repair(c public.warranty_claims,p_repair uuid)
returns public.repair_jobs language plpgsql volatile security definer set search_path='' as $$
declare r public.repair_jobs;
begin
 if not public.has_permission('repairs.view',c.organization_id,c.servicing_branch_id)
 or not public.has_permission('repairs.manage',c.organization_id,c.servicing_branch_id) then raise exception 'Repair viewing and management permissions required'; end if;
 select * into r from public.repair_jobs where id=p_repair and organization_id=c.organization_id and branch_id=c.servicing_branch_id for share;
 if not found or r.customer_id<>c.customer_id then raise exception 'Repair customer/workspace does not match'; end if;
 if r.product_id is distinct from c.product_id or r.product_serial_id is distinct from c.source_product_serial_id then
  raise exception 'Repair device evidence does not match';
 end if;
 if c.source_product_serial_id is not null then
  perform 1 from public.product_serials ps where ps.id=c.source_product_serial_id
   and ps.organization_id=c.organization_id and ps.product_id=c.product_id for share;
  if not found then raise exception 'Serial does not belong to organisation/product'; end if;
  if exists(select 1 from public.sale_item_serials a where a.sale_item_id=c.source_sale_item_id)
   and not exists(select 1 from public.sale_item_serials a where a.sale_item_id=c.source_sale_item_id
    and a.sale_id=c.source_sale_id and a.organization_id=c.organization_id and a.product_id=c.product_id
    and a.product_serial_id=c.source_product_serial_id) then
   raise exception 'Serial does not match immutable sale-item evidence';
  end if;
 else
  if r.imei is distinct from c.imei_snapshot or r.serial_number is distinct from c.serial_number_snapshot
   or (c.product_id is null and r.model is distinct from c.device_description) then
   raise exception 'Repair device evidence does not match';
  end if;
 end if;
 return r;
end; $$;

create or replace function public.create_warranty_repair(p_org uuid,p_branch uuid,p_claim uuid,p_version integer,p_device_type text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims; r uuid; v_serial public.product_serials; v_job public.repair_jobs;
 v_legacy boolean:=false;
begin
 perform public.warranty_assert_access(p_org,p_branch,true);
 select * into c from public.warranty_claims where id=p_claim and organization_id=p_org and servicing_branch_id=p_branch for update;
 if not found then raise exception 'Claim not found'; end if;
 -- Same locked-claim retry behavior; no second repair is created.
 if c.repair_job_id is not null then perform public.warranty_check_repair(c,c.repair_job_id); return c.repair_job_id; end if;
 c:=public.warranty_lock_claim(p_org,p_branch,p_claim,p_version);
 if c.status not in ('APPROVED','IN_PROGRESS') then raise exception 'Approved claim required'; end if;
 if not public.has_permission('repairs.view',p_org,p_branch) then raise exception 'Repair viewing permission required'; end if;
 if c.source_product_serial_id is not null then
  select ps.* into v_serial from public.product_serials ps where ps.id=c.source_product_serial_id
   and ps.organization_id=p_org and ps.product_id=c.product_id for share;
  if not found then raise exception 'Serial does not belong to organisation/product'; end if;
  -- Retain the inventory permission required by the ordinary linked-serial intake.
  if not public.has_permission('inventory.view',p_org,v_serial.branch_id) then
   raise exception using errcode='42501',message='Permission to view the source serial branch is required';
  end if;
  -- Recheck source-sale permissions, branch/line/product relationships and the
  -- immutable allocation when present. Do not overwrite the stored claim snapshots.
  perform public.warranty_validate_evidence(c);
  v_legacy:=v_serial.imei is not null and v_serial.imei !~ '^[0-9]{15}$';
 end if;
 r:=public.create_repair(p_org,p_branch,jsonb_build_object('customer_id',c.customer_id,'product_id',c.product_id,
  'product_serial_id',case when v_legacy then null else c.source_product_serial_id end,
  'device_type',p_device_type,'model',c.device_description,
  'imei',case when v_legacy then null when c.source_product_serial_id is not null then v_serial.imei else c.imei_snapshot end,
  'serial_number',case when c.source_product_serial_id is not null then v_serial.serial_number else c.serial_number_snapshot end,
  'fault_description',c.reported_fault,'priority','normal'));
 if v_legacy then
  -- Initialization of this transaction's new repair only. The checked, locked
  -- serial row supplies identity; the API accepts neither a serial ID nor IMEI.
  -- NULL respects the unchanged strict repair IMEI CHECK. No source row is edited.
  update public.repair_jobs j set product_serial_id=v_serial.id,updated_by=auth.uid(),updated_at=now(),version=j.version+1
   where j.id=r and j.organization_id=p_org and j.branch_id=p_branch
    and j.customer_id=c.customer_id and j.product_id=c.product_id and j.product_serial_id is null
   returning j.* into v_job;
  if not found then raise exception 'Unable to attach the validated warranty device'; end if;
  perform public.repair_event(v_job,'updated','Existing warranty device linked; legacy IMEI preserved in historical evidence.',
   jsonb_build_object('product_serial_id',v_serial.id,'legacy_imei_snapshot',v_serial.imei,'warranty_claim_id',c.id));
 end if;
 perform public.link_warranty_repair(p_org,p_branch,p_claim,p_version,r);
 return r;
end; $$;

-- CREATE OR REPLACE preserves existing grants. Fail closed if they have drifted.
do $$
declare f record;
begin
 for f in select p.oid,p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('warranty_check_repair','create_warranty_repair') loop
  if has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('service_role',f.oid,'EXECUTE')
   or has_function_privilege('authenticated',f.oid,'EXECUTE') is distinct from (f.proname='create_warranty_repair') then
   raise exception 'Unexpected warranty repair function privileges';
  end if;
 end loop;
end; $$;
commit;
