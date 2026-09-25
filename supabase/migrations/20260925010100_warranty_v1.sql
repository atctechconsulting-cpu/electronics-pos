begin;
create sequence public.warranty_claim_number_seq;
create table public.warranty_claims (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 servicing_branch_id uuid not null references public.branches(id) on delete restrict,
 claim_number text not null default ('WAR-'||nextval('public.warranty_claim_number_seq')::text),
 customer_id uuid not null references public.customers(id) on delete restrict,
 customer_name_snapshot text not null, customer_phone_snapshot text, customer_email_snapshot text,
 product_id uuid references public.products(id) on delete restrict,
 source_product_serial_id uuid references public.product_serials(id) on delete restrict,
 device_description text not null check(length(btrim(device_description)) between 1 and 200),
 serial_number_snapshot text check(length(serial_number_snapshot)<=120),
 imei_snapshot text check(length(imei_snapshot)<=120),
 reported_fault text not null check(length(btrim(reported_fault)) between 1 and 5000), intake_notes text,
 source_sale_id uuid references public.sales(id) on delete restrict,
 source_sale_item_id uuid references public.sale_items(id) on delete restrict,
 receipt_number_snapshot text, purchase_date_snapshot date,
 evidence_class text not null check(evidence_class in ('VERIFIED_INTERNAL','PROBABLE_INTERNAL','EXTERNAL_MANUAL')),
 terms_source text not null check(terms_source in ('SALE_SNAPSHOT','MANUAL','UNKNOWN')),
 warranty_months_snapshot integer check(warranty_months_snapshot>=0), warranty_expiry_date date, evidence_notes text,
 eligibility_decision text not null default 'PENDING' check(eligibility_decision in ('PENDING','ELIGIBLE','INELIGIBLE')),
 eligibility_reason text, assessed_by uuid references public.profiles(id), assessed_at timestamptz,
 status text not null default 'RECEIVED' check(status in ('RECEIVED','ASSESSING','APPROVED','IN_PROGRESS','RESOLVED','REJECTED','CANCELLED')),
 resolution text check(resolution in ('REPAIRED','REFUNDED','OTHER')), resolution_notes text, customer_summary text,
 repair_job_id uuid references public.repair_jobs(id) on delete restrict,
 return_item_id uuid references public.return_items(id) on delete restrict,
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz,
 version integer not null default 1 check(version>0), request_key uuid not null,
 unique(organization_id,claim_number), unique(organization_id,request_key), unique(id,organization_id,servicing_branch_id),
 check((source_sale_id is null)=(source_sale_item_id is null)),
 constraint warranty_eligible_assessment_check check(
  status not in ('APPROVED','IN_PROGRESS','RESOLVED') or (
   eligibility_decision='ELIGIBLE'
   and nullif(btrim(eligibility_reason),'') is not null
   and assessed_by is not null
   and assessed_at is not null
  )
 ),
 constraint warranty_rejected_assessment_check check(
  status<>'REJECTED' or (
   eligibility_decision='INELIGIBLE'
   and nullif(btrim(eligibility_reason),'') is not null
   and assessed_by is not null
   and assessed_at is not null
  )
 ),
 check((status='RESOLVED')=(resolution is not null)),
 check((status in ('RESOLVED','REJECTED','CANCELLED'))=(closed_at is not null)),
 check(terms_source<>'UNKNOWN' or (warranty_months_snapshot is null and warranty_expiry_date is null)),
 check(terms_source<>'MANUAL' or (nullif(btrim(evidence_notes),'') is not null and warranty_expiry_date is not null))
);
create unique index warranty_one_open_serial on public.warranty_claims(organization_id,source_product_serial_id)
 where source_product_serial_id is not null and status in ('RECEIVED','ASSESSING','APPROVED','IN_PROGRESS');
create index warranty_queue on public.warranty_claims(organization_id,servicing_branch_id,created_at desc);
create table public.warranty_claim_events (
 id uuid primary key default gen_random_uuid(), claim_id uuid not null, organization_id uuid not null,
 servicing_branch_id uuid not null, actor_id uuid not null references public.profiles(id), event_type text not null,
 previous_status text, new_status text, note text, changed_values jsonb not null default '{}',
 created_at timestamptz not null default now(),
 foreign key(claim_id,organization_id,servicing_branch_id) references public.warranty_claims(id,organization_id,servicing_branch_id) on delete restrict
);
create index warranty_event_history on public.warranty_claim_events(claim_id,created_at);
create trigger warranty_events_immutable before update or delete on public.warranty_claim_events
 for each row execute function public.warranty_immutable_history();
alter table public.warranty_claims enable row level security;
alter table public.warranty_claim_events enable row level security;
-- No direct SELECT: claim projections redact source evidence and private assessment.
revoke all on public.warranty_claims,public.warranty_claim_events from public,anon,authenticated,service_role;
revoke all on sequence public.warranty_claim_number_seq from public,anon,authenticated,service_role;

create function public.warranty_assert_access(p_org uuid,p_branch uuid,p_manage boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated' or p_org is null or p_branch is null then
 raise exception using errcode='42501',message='Warranty access denied'; end if;
 if p_manage then
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Warranty changes require READ COMMITTED'; end if;
  perform 1 from public.organizations where id=p_org for share;
  perform 1 from public.profiles where id=auth.uid() for share;
  perform 1 from public.branches where id=p_branch and organization_id=p_org and is_active for share;
  if not found then raise exception 'Select an active servicing branch'; end if;
 end if;
 if not public.has_permission(case when p_manage then 'warranty.manage' else 'warranty.view' end,p_org,p_branch)
 or not exists(select 1 from public.branches where id=p_branch and organization_id=p_org) then
 raise exception using errcode='42501',message='Warranty access denied'; end if;
end; $$;

create function public.warranty_lock_claim(p_org uuid,p_branch uuid,p_claim uuid,p_version integer)
returns public.warranty_claims language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims;
begin
 perform public.warranty_assert_access(p_org,p_branch,true);
 select * into c from public.warranty_claims where id=p_claim and organization_id=p_org and servicing_branch_id=p_branch for update;
 if not found then raise exception 'Claim not found in this workspace'; end if;
 if p_version is null or c.version<>p_version then raise exception 'Claim changed. Refresh before saving'; end if;
 if c.status in ('RESOLVED','REJECTED','CANCELLED') then raise exception 'Terminal claims cannot be changed'; end if;
 return c;
end; $$;

create function public.warranty_event(c public.warranty_claims,p_type text,p_previous text,p_changes jsonb)
returns void language sql volatile security definer set search_path='' as $$
 insert into public.warranty_claim_events(claim_id,organization_id,servicing_branch_id,actor_id,event_type,previous_status,new_status,changed_values)
 values((c).id,(c).organization_id,(c).servicing_branch_id,auth.uid(),p_type,p_previous,(c).status,p_changes);
$$;

create function public.warranty_validate_evidence(c public.warranty_claims)
returns public.warranty_claims language plpgsql volatile security definer set search_path='' as $$
declare s public.sales; i public.sale_items; ps public.product_serials; prod public.products; cust public.customers; a public.sale_item_serials;
begin
 if not public.has_organization_permission_any_scope('customers.view',c.organization_id) then raise exception 'Customer viewing permission required'; end if;
 select * into cust from public.customers where id=c.customer_id and organization_id=c.organization_id for share;
 if not found then raise exception 'Customer does not belong to organisation'; end if;
 c.customer_name_snapshot:=btrim(concat_ws(' ',cust.first_name,cust.last_name)); c.customer_phone_snapshot:=cust.phone; c.customer_email_snapshot:=cust.email;
 if c.product_id is not null then
  select * into prod from public.products where id=c.product_id and organization_id=c.organization_id for share;
  if not found then raise exception 'Product does not belong to organisation'; end if;
 end if;
 if (c.source_sale_id is null)<>(c.source_sale_item_id is null) then raise exception 'Select both sale and sale item'; end if;
 if c.source_sale_id is not null then
  if c.evidence_class not in ('VERIFIED_INTERNAL','PROBABLE_INTERNAL') then raise exception 'Source-sale claims require internal evidence classification'; end if;
  select * into s from public.sales where id=c.source_sale_id and organization_id=c.organization_id;
  if not found or not public.has_permission('sales.view',c.organization_id,s.branch_id) then raise exception 'Source-sale access unavailable'; end if;
  if s.status not in ('COMPLETED','REFUNDED') then raise exception 'Source sale is not completed'; end if;
  select * into i from public.sale_items where id=c.source_sale_item_id and sale_id=s.id and organization_id=c.organization_id and branch_id=s.branch_id;
  if not found or i.product_id is distinct from c.product_id then raise exception 'Sale item and product must match'; end if;
  c.receipt_number_snapshot:=s.receipt_number;
  if c.terms_source='SALE_SNAPSHOT' then
   if i.warranty_months_snapshot is null or i.purchase_date_snapshot is null then raise exception 'Warranty terms not snapshotted — assessment required'; end if;
   c.warranty_months_snapshot:=i.warranty_months_snapshot; c.purchase_date_snapshot:=i.purchase_date_snapshot;
  end if;
 else
  c.receipt_number_snapshot:=null;
  if c.evidence_class<>'EXTERNAL_MANUAL' or c.terms_source='SALE_SNAPSHOT' then raise exception 'Internal evidence requires an accessible source sale'; end if;
 end if;
 if c.source_product_serial_id is not null then
  select * into ps from public.product_serials where id=c.source_product_serial_id and organization_id=c.organization_id and product_id=c.product_id;
  if not found then raise exception 'Serial does not belong to organisation/product'; end if;
  select * into a from public.sale_item_serials where sale_item_id=c.source_sale_item_id and product_serial_id=ps.id;
  if found then
   c.serial_number_snapshot:=a.serial_number_snapshot; c.imei_snapshot:=a.imei_snapshot;
  else
   if exists(select 1 from public.sale_item_serials where sale_item_id=c.source_sale_item_id) then raise exception 'Serial does not match immutable sale-item evidence'; end if;
   if not public.has_permission('inventory.view',c.organization_id,ps.branch_id) then raise exception 'Source serial viewing permission required'; end if;
   c.serial_number_snapshot:=ps.serial_number; c.imei_snapshot:=ps.imei;
   if c.evidence_class='VERIFIED_INTERNAL' then raise exception 'Exact sale-item allocation unavailable; use probable internal evidence'; end if;
  end if;
 end if;
 if c.evidence_class='VERIFIED_INTERNAL' and (prod.is_serialized or prod.requires_imei) and a.id is null then
 raise exception 'Verified serialized evidence requires immutable sale-item allocation'; end if;
 if c.terms_source='UNKNOWN' then c.warranty_months_snapshot:=null; c.warranty_expiry_date:=null;
 elsif c.terms_source in ('SALE_SNAPSHOT','MANUAL') then
  if c.warranty_months_snapshot is not null then
   if c.purchase_date_snapshot is null then raise exception 'Purchase date required for calendar-month terms'; end if;
   c.warranty_expiry_date:=(c.purchase_date_snapshot+make_interval(months=>c.warranty_months_snapshot)-interval '1 day')::date;
  elsif c.terms_source='SALE_SNAPSHOT' or c.warranty_expiry_date is null then raise exception 'Supply sufficient warranty terms'; end if;
  if c.terms_source='MANUAL' and nullif(btrim(c.evidence_notes),'') is null then raise exception 'Manual terms require evidence notes'; end if;
 end if;
 return c;
end; $$;

create function public.warranty_input(p_data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>40000 then raise exception 'Invalid warranty details'; end if;
 for k in select jsonb_object_keys(p_data) loop
  if k not in ('customer_id','product_id','source_product_serial_id','device_description','serial_number_snapshot','imei_snapshot',
   'reported_fault','intake_notes','source_sale_id','source_sale_item_id','purchase_date_snapshot','evidence_class','terms_source',
   'warranty_months_snapshot','warranty_expiry_date','evidence_notes') then raise exception 'Warranty field cannot be edited: %',k; end if;
 end loop;
 return p_data;
end; $$;

create function public.create_warranty_claim(p_org uuid,p_branch uuid,p_data jsonb,p_request_key uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims; existing public.warranty_claims;
begin
 perform public.warranty_assert_access(p_org,p_branch,true);
 if p_request_key is null then raise exception 'Request key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_request_key::text,0));
 select * into existing from public.warranty_claims where organization_id=p_org and request_key=p_request_key;
 if found then
  if existing.servicing_branch_id<>p_branch or existing.created_by<>auth.uid() then raise exception 'Request key already used'; end if;
  return existing.id;
 end if;
 c:=jsonb_populate_record(null::public.warranty_claims,public.warranty_input(p_data));
 c.organization_id:=p_org; c.servicing_branch_id:=p_branch;
 c:=public.warranty_validate_evidence(c);
 insert into public.warranty_claims(organization_id,servicing_branch_id,customer_id,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,
 product_id,source_product_serial_id,device_description,serial_number_snapshot,imei_snapshot,reported_fault,intake_notes,source_sale_id,source_sale_item_id,
 receipt_number_snapshot,purchase_date_snapshot,evidence_class,terms_source,warranty_months_snapshot,warranty_expiry_date,evidence_notes,created_by,updated_by,request_key)
 values(p_org,p_branch,c.customer_id,c.customer_name_snapshot,c.customer_phone_snapshot,c.customer_email_snapshot,c.product_id,c.source_product_serial_id,
 c.device_description,c.serial_number_snapshot,c.imei_snapshot,c.reported_fault,c.intake_notes,c.source_sale_id,c.source_sale_item_id,c.receipt_number_snapshot,
 c.purchase_date_snapshot,c.evidence_class,c.terms_source,c.warranty_months_snapshot,c.warranty_expiry_date,c.evidence_notes,auth.uid(),auth.uid(),p_request_key)
 returning * into c;
 perform public.warranty_event(c,'created',null,'{}'); return c.id;
end; $$;

create function public.update_warranty_claim(p_org uuid,p_branch uuid,p_claim uuid,p_version integer,p_data jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims; n public.warranty_claims;
begin
 c:=public.warranty_lock_claim(p_org,p_branch,p_claim,p_version);
 -- Linked work freezes identity/evidence. Reassessment is available before work is linked.
 if c.repair_job_id is not null then raise exception 'Evidence cannot change after a repair is linked'; end if;
 n:=public.warranty_validate_evidence(jsonb_populate_record(c,public.warranty_input(p_data)));
 update public.warranty_claims set customer_id=n.customer_id,customer_name_snapshot=n.customer_name_snapshot,
 customer_phone_snapshot=n.customer_phone_snapshot,customer_email_snapshot=n.customer_email_snapshot,
 product_id=n.product_id,source_product_serial_id=n.source_product_serial_id,device_description=n.device_description,
 serial_number_snapshot=n.serial_number_snapshot,imei_snapshot=n.imei_snapshot,reported_fault=n.reported_fault,intake_notes=n.intake_notes,
 source_sale_id=n.source_sale_id,source_sale_item_id=n.source_sale_item_id,receipt_number_snapshot=n.receipt_number_snapshot,
 purchase_date_snapshot=n.purchase_date_snapshot,evidence_class=n.evidence_class,terms_source=n.terms_source,
 warranty_months_snapshot=n.warranty_months_snapshot,warranty_expiry_date=n.warranty_expiry_date,evidence_notes=n.evidence_notes,
 status='ASSESSING',eligibility_decision='PENDING',eligibility_reason=null,assessed_by=null,assessed_at=null,
 version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into n;
 perform public.warranty_event(n,'evidence_updated',c.status,jsonb_build_object('before',to_jsonb(c),'after',to_jsonb(n)));
end; $$;

create function public.warranty_check_repair(c public.warranty_claims,p_repair uuid)
returns public.repair_jobs language plpgsql volatile security definer set search_path='' as $$
declare r public.repair_jobs;
begin
 if not public.has_permission('repairs.view',c.organization_id,c.servicing_branch_id)
 or not public.has_permission('repairs.manage',c.organization_id,c.servicing_branch_id) then raise exception 'Repair viewing and management permissions required'; end if;
 select * into r from public.repair_jobs where id=p_repair and organization_id=c.organization_id and branch_id=c.servicing_branch_id for share;
 if not found or r.customer_id<>c.customer_id then raise exception 'Repair customer/workspace does not match'; end if;
 if r.product_id is distinct from c.product_id or r.product_serial_id is distinct from c.source_product_serial_id
 or r.imei is distinct from c.imei_snapshot or r.serial_number is distinct from c.serial_number_snapshot
 or (c.product_id is null and r.model is distinct from c.device_description) then raise exception 'Repair device evidence does not match'; end if;
 return r;
end; $$;

create function public.transition_warranty_claim(p_org uuid,p_branch uuid,p_claim uuid,p_version integer,p_status text,p_data jsonb default '{}')
returns void language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims; n public.warranty_claims; r public.repair_jobs; ri public.return_items; rt public.returns; s public.sales; decision text; reason text;
begin
 c:=public.warranty_lock_claim(p_org,p_branch,p_claim,p_version);
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'Invalid decision'; end if;
 if not ((c.status='RECEIVED' and p_status='ASSESSING') or (c.status='ASSESSING' and p_status in ('APPROVED','REJECTED'))
 or (c.status='APPROVED' and p_status='IN_PROGRESS') or (c.status='IN_PROGRESS' and p_status='RESOLVED')
 or (c.status in ('RECEIVED','ASSESSING','APPROVED','IN_PROGRESS') and p_status='CANCELLED')) then raise exception 'Invalid warranty transition'; end if;
 decision:=c.eligibility_decision; reason:=nullif(btrim(p_data->>'eligibility_reason'),'');
 if p_status in ('APPROVED','REJECTED') then
  perform public.warranty_validate_evidence(c);
  if reason is null then raise exception 'Explicit eligibility reason required'; end if;
  decision:=case when p_status='APPROVED' then 'ELIGIBLE' else 'INELIGIBLE' end;
  if p_data->>'eligibility_decision' is distinct from decision then raise exception 'Eligibility decision does not match transition'; end if;
  if p_status='APPROVED' and c.terms_source='UNKNOWN' then raise exception 'Establish sale-time or manual terms before approval'; end if;
  if p_status='APPROVED' and c.purchase_date_snapshot > (c.created_at at time zone (select timezone from public.organizations where id=p_org))::date then raise exception 'Purchase date is after claim intake'; end if;
  if p_status='APPROVED' and c.warranty_expiry_date < (c.created_at at time zone (select timezone from public.organizations where id=p_org))::date then raise exception 'Terms expired before claim intake'; end if;
  if p_status='APPROVED' and c.warranty_months_snapshot=0 then raise exception 'Zero-month terms explicitly provide no warranty'; end if;
 end if;
 if p_status='RESOLVED' then
  if p_data->>'resolution'='REPAIRED' then
   r:=public.warranty_check_repair(c,c.repair_job_id);
   if r.status<>'collected' or r.repair_outcome is distinct from 'repaired' then raise exception 'Repair must be collected with repaired outcome'; end if;
  elsif p_data->>'resolution'='REFUNDED' then
   select * into s from public.sales where id=c.source_sale_id and organization_id=p_org;
   if not found or not public.has_permission('sales.view',p_org,s.branch_id) or not public.has_permission('sales.refund',p_org,s.branch_id) then raise exception 'Source refund evidence access required'; end if;
   select * into ri from public.return_items where id=nullif(p_data->>'return_item_id','')::uuid and organization_id=p_org and branch_id=s.branch_id
    and sale_item_id=c.source_sale_item_id and product_id=c.product_id for share;
   if not found then raise exception 'Return item does not match claim'; end if;
   select * into rt from public.returns where id=ri.return_id and sale_id=c.source_sale_id and organization_id=p_org and branch_id=s.branch_id for share;
   if not found or rt.status<>'COMPLETED' or rt.refund_method='NO_REFUND' or rt.refund_amount<=0 or ri.line_refund_amount<=0 then raise exception 'Completed positive refund evidence required'; end if;
   if c.source_product_serial_id is not null and not exists(select 1 from public.return_serials rs where rs.return_item_id=ri.id and rs.product_serial_id=c.source_product_serial_id) then raise exception 'Refund serial evidence does not match'; end if;
  elsif p_data->>'resolution'='OTHER' then
   if nullif(btrim(p_data->>'resolution_notes'),'') is null then raise exception 'Other resolution requires notes'; end if;
  else raise exception 'Select REPAIRED, REFUNDED or OTHER'; end if;
 end if;
 update public.warranty_claims set status=p_status,eligibility_decision=decision,
 eligibility_reason=case when p_status in ('APPROVED','REJECTED') then reason else eligibility_reason end,
 assessed_by=case when p_status in ('APPROVED','REJECTED') then auth.uid() else assessed_by end,
 assessed_at=case when p_status in ('APPROVED','REJECTED') then now() else assessed_at end,
 resolution=case when p_status='RESOLVED' then p_data->>'resolution' else null end,
 resolution_notes=case when p_status='RESOLVED' then p_data->>'resolution_notes' else null end,
 return_item_id=case when p_status='RESOLVED' and p_data->>'resolution'='REFUNDED' then ri.id else null end,
 customer_summary=coalesce(nullif(btrim(p_data->>'customer_summary'),''),customer_summary),
 closed_at=case when p_status in ('RESOLVED','REJECTED','CANCELLED') then now() else null end,
 version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into n;
 perform public.warranty_event(n,'status_changed',c.status,p_data);
end; $$;

create function public.link_warranty_repair(p_org uuid,p_branch uuid,p_claim uuid,p_version integer,p_repair uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims;
begin
 c:=public.warranty_lock_claim(p_org,p_branch,p_claim,p_version);
 if c.status not in ('APPROVED','IN_PROGRESS') or c.repair_job_id is not null then raise exception 'Approved unlinked claim required'; end if;
 perform public.warranty_check_repair(c,p_repair);
 update public.warranty_claims set repair_job_id=p_repair,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 perform public.warranty_event(c,'repair_linked',c.status,jsonb_build_object('repair_job_id',p_repair));
end; $$;

create function public.create_warranty_repair(p_org uuid,p_branch uuid,p_claim uuid,p_version integer,p_device_type text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare c public.warranty_claims; r uuid;
begin
 perform public.warranty_assert_access(p_org,p_branch,true);
 select * into c from public.warranty_claims where id=p_claim and organization_id=p_org and servicing_branch_id=p_branch for update;
 if not found then raise exception 'Claim not found'; end if;
 -- The claim row itself is the idempotency key: a retry returns its existing validated link.
 if c.repair_job_id is not null then perform public.warranty_check_repair(c,c.repair_job_id); return c.repair_job_id; end if;
 c:=public.warranty_lock_claim(p_org,p_branch,p_claim,p_version);
 if c.status not in ('APPROVED','IN_PROGRESS') then raise exception 'Approved claim required'; end if;
 if not public.has_permission('repairs.view',p_org,p_branch) then raise exception 'Repair viewing permission required'; end if;
 r:=public.create_repair(p_org,p_branch,jsonb_build_object('customer_id',c.customer_id,'product_id',c.product_id,
 'product_serial_id',c.source_product_serial_id,'device_type',p_device_type,'model',c.device_description,
 'imei',c.imei_snapshot,'serial_number',c.serial_number_snapshot,'fault_description',c.reported_fault,'priority','normal'));
 perform public.link_warranty_repair(p_org,p_branch,p_claim,p_version,r);
 return r;
end; $$;

create function public.warranty_projection(c public.warranty_claims)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; source_allowed boolean; manage boolean; source_branch uuid;
begin
 select s.branch_id into source_branch from public.sales s where s.id=c.source_sale_id and s.organization_id=c.organization_id;
 source_allowed:=c.source_sale_id is null or coalesce(public.has_permission('sales.view',c.organization_id,source_branch),false);
 manage:=public.has_permission('warranty.manage',c.organization_id,c.servicing_branch_id);
 result:=to_jsonb(c)-array['request_key','evidence_notes','eligibility_reason','resolution_notes','intake_notes'];
 if manage and source_allowed then result:=result||jsonb_build_object('evidence_notes',c.evidence_notes,
 'eligibility_reason',c.eligibility_reason,'resolution_notes',c.resolution_notes,'intake_notes',c.intake_notes); end if;
 if not source_allowed then
  result:=result-array['source_sale_id','source_sale_item_id','receipt_number_snapshot','purchase_date_snapshot',
   'warranty_months_snapshot','warranty_expiry_date','source_product_serial_id','serial_number_snapshot','imei_snapshot'];
 end if;
 if not source_allowed or not coalesce(public.has_permission('sales.refund',c.organization_id,source_branch),false) then result:=result-'return_item_id'; end if;
 if not public.has_permission('repairs.view',c.organization_id,c.servicing_branch_id) then result:=result-'repair_job_id'; end if;
 return result||jsonb_build_object('source_evidence_access',source_allowed,'can_manage',manage,
 'branch_name',(select b.name from public.branches b where b.id=c.servicing_branch_id),
 'organization_name',(select o.name from public.organizations o where o.id=c.organization_id),
 'branch_active',(select b.is_active from public.branches b where b.id=c.servicing_branch_id));
end; $$;

create function public.query_warranty_claims(p_org uuid,p_branch uuid,p_search text default '',p_status text default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.warranty_assert_access(p_org,p_branch,false);
 return jsonb_build_object('claims',(select coalesce(jsonb_agg(x.data order by x.created_at desc),'[]') from (
 select jsonb_build_object('id',c.id,'claim_number',c.claim_number,'customer_name_snapshot',c.customer_name_snapshot,
 'device_description',c.device_description,'status',c.status,'created_at',c.created_at) data,c.created_at
 from public.warranty_claims c where c.organization_id=p_org and c.servicing_branch_id=p_branch
 and (p_status is null or c.status=p_status) and (coalesce(p_search,'')='' or c.claim_number ilike '%'||p_search||'%'
 or c.customer_name_snapshot ilike '%'||p_search||'%') order by c.created_at desc,c.id limit 50 offset greatest(coalesce(p_offset,0),0)) x));
end; $$;

create function public.get_warranty_claim_detail(p_org uuid,p_branch uuid,p_claim uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.warranty_claims; projected jsonb;
begin
 perform public.warranty_assert_access(p_org,p_branch,false);
 select * into c from public.warranty_claims where id=p_claim and organization_id=p_org and servicing_branch_id=p_branch;
 if not found then raise exception using errcode='P0002',message='Claim not found in this workspace'; end if;
 projected:=public.warranty_projection(c);
 return jsonb_build_object('claim',projected,
 'refund_evidence_access',exists(select 1 from public.sales s where s.id=c.source_sale_id and s.organization_id=p_org
 and public.has_permission('sales.view',p_org,s.branch_id) and public.has_permission('sales.refund',p_org,s.branch_id)),
 'events',(select coalesce(jsonb_agg(jsonb_build_object(
 'id',e.id,'event_type',e.event_type,'previous_status',e.previous_status,'new_status',e.new_status,'created_at',e.created_at,
 'changed_values','{}'::jsonb)
 order by e.created_at,e.id),'[]') from public.warranty_claim_events e where e.claim_id=c.id),
 'refund_options',(select coalesce(jsonb_agg(jsonb_build_object('id',ri.id,'return_number',r.return_number)),'[]')
 from public.return_items ri join public.returns r on r.id=ri.return_id
 where ri.sale_item_id=c.source_sale_item_id and r.organization_id=p_org and r.status='COMPLETED'
 and r.refund_method<>'NO_REFUND' and r.refund_amount>0 and ri.line_refund_amount>0
 and public.has_permission('sales.view',p_org,r.branch_id) and public.has_permission('sales.refund',p_org,r.branch_id)));
end; $$;

create function public.lookup_warranty_evidence(p_org uuid,p_branch uuid,p_kind text,p_search text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.warranty_assert_access(p_org,p_branch,false);
 if p_kind not in ('receipt','imei','serial','customer','product') or length(btrim(p_search))<2 or length(p_search)>200 then raise exception 'Enter a search of 2–200 characters'; end if;
 return jsonb_build_object('scope_notice','Only permitted sale branches are searched. Inaccessible evidence is not proof of no purchase or return.',
 'matches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
 select s.id source_sale_id,i.id source_sale_item_id,i.product_id,s.receipt_number,p.name product_name,
 s.branch_id source_branch_id,b.name source_branch_name,s.customer_id,
 i.warranty_months_snapshot,i.purchase_date_snapshot,
 case when i.warranty_months_snapshot is null then 'UNKNOWN' else 'SALE_SNAPSHOT' end terms_source,
 case when (p.is_serialized or p.requires_imei) and a.id is null then 'PROBABLE_INTERNAL' else 'VERIFIED_INTERNAL' end evidence_class,
 coalesce(a.product_serial_id,legacy.id) source_product_serial_id,coalesce(a.imei_snapshot,legacy.imei) imei_snapshot,coalesce(a.serial_number_snapshot,legacy.serial_number) serial_number_snapshot,
 case when a.id is not null then 'Immutable sale-item allocation' else 'Sale item; exact unit attribution requires review' end provenance,
 case when public.has_permission('sales.refund',p_org,s.branch_id) then
  (select coalesce(sum(ri.quantity),0) from public.return_items ri join public.returns r on r.id=ri.return_id where ri.sale_item_id=i.id and r.status='COMPLETED') else null end returned_quantity,
 public.has_permission('sales.refund',p_org,s.branch_id) return_evidence_access
 from public.sales s join public.sale_items i on i.sale_id=s.id and i.organization_id=s.organization_id and i.branch_id=s.branch_id
 join public.products p on p.id=i.product_id join public.branches b on b.id=s.branch_id
 left join public.customers cust on cust.id=s.customer_id
 left join public.sale_item_serials a on a.sale_item_id=i.id
 left join lateral (
  select ps.id,ps.imei,ps.serial_number from public.product_serials ps
  where a.id is null and ps.organization_id=p_org and ps.product_id=i.product_id
  and public.has_permission('inventory.view',p_org,ps.branch_id)
  and (ps.sale_id=s.id or exists(select 1 from public.return_serials rs join public.return_items ri on ri.id=rs.return_item_id
   where rs.product_serial_id=ps.id and ri.sale_item_id=i.id and public.has_permission('sales.refund',p_org,s.branch_id)))
  and (p_kind not in ('imei','serial') or (p_kind='imei' and ps.imei=p_search) or (p_kind='serial' and ps.serial_number=p_search))
  order by ps.id limit 50
 ) legacy on true
 where s.organization_id=p_org and s.status in ('COMPLETED','REFUNDED') and public.has_permission('sales.view',p_org,s.branch_id)
 and ((p_kind='receipt' and s.receipt_number ilike '%'||p_search||'%')
 or (p_kind='customer' and concat_ws(' ',cust.first_name,cust.last_name,cust.phone) ilike '%'||p_search||'%')
 or (p_kind='product' and (p.name ilike '%'||p_search||'%' or p.sku ilike '%'||p_search||'%'))
 or (p_kind='imei' and a.imei_snapshot=p_search) or (p_kind='serial' and a.serial_number_snapshot=p_search)
 or (p_kind in ('imei','serial') and a.id is null and exists(
  select 1 from public.product_serials ps where ps.organization_id=p_org and ps.product_id=i.product_id
  and (ps.sale_id=s.id or exists(select 1 from public.return_serials rs join public.return_items ri on ri.id=rs.return_item_id
    where rs.product_serial_id=ps.id and ri.sale_item_id=i.id and public.has_permission('sales.refund',p_org,s.branch_id)))
  and public.has_permission('inventory.view',p_org,ps.branch_id)
  and ((p_kind='imei' and ps.imei=p_search) or (p_kind='serial' and ps.serial_number=p_search)))))
 order by s.completed_at desc,i.id limit 50) x));
end; $$;

-- Dedicated guard uses servicing_branch_id; the generic operational guard uses branch_id.
create function public.warranty_active_branch_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'Warranty claims cannot be deleted'; end if;
 if TG_OP='UPDATE' and (NEW.organization_id<>OLD.organization_id or NEW.servicing_branch_id<>OLD.servicing_branch_id) then raise exception 'Claim workspace is immutable'; end if;
 perform public.warranty_assert_access(NEW.organization_id,NEW.servicing_branch_id,true);
 return NEW;
end; $$;
create trigger warranty_active_branch before insert or update or delete on public.warranty_claims
 for each row execute function public.warranty_active_branch_guard();

create function public.warranty_branch_deactivation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if OLD.is_active and not NEW.is_active and exists(select 1 from public.warranty_claims c where c.organization_id=NEW.organization_id
 and c.servicing_branch_id=NEW.id and c.status in ('RECEIVED','ASSESSING','APPROVED','IN_PROGRESS')) then
 raise exception 'Branch has open warranty claims'; end if;
 return NEW;
end; $$;
create trigger warranty_branch_deactivation before update on public.branches
 for each row execute function public.warranty_branch_deactivation_guard();

-- Explicit allowlist; private helpers cannot be invoked by API roles.
do $$
declare f record; role_name text; public_rpc boolean; t text;
begin
 for f in select p.oid,p.proname,p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'warranty_%' or p.proname in ('lookup_warranty_evidence','query_warranty_claims',
 'get_warranty_claim_detail','create_warranty_claim','update_warranty_claim','transition_warranty_claim','link_warranty_repair','create_warranty_repair')) loop
  public_rpc:=f.proname in ('lookup_warranty_evidence','query_warranty_claims','get_warranty_claim_detail','create_warranty_claim',
   'update_warranty_claim','transition_warranty_claim','link_warranty_repair','create_warranty_repair');
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if public_rpc then execute format('grant execute on function %s to authenticated',f.signature); end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.oid,'EXECUTE') is distinct from (role_name='authenticated' and public_rpc) then raise exception 'Unexpected Warranty function privilege'; end if;
  end loop;
 end loop;
 foreach t in array array['warranty_claims','warranty_claim_events','sale_item_serials'] loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(role_name,'public.'||t,'INSERT,UPDATE,REFERENCES') then raise exception 'Unexpected Warranty write privileges'; end if;
   if has_table_privilege(role_name,'public.'||t,'SELECT') is distinct from (t='sale_item_serials' and role_name='authenticated')
   or has_any_column_privilege(role_name,'public.'||t,'SELECT') is distinct from (t='sale_item_serials' and role_name='authenticated') then raise exception 'Unexpected Warranty read privileges'; end if;
  end loop;
 end loop;
end; $$;
commit;
