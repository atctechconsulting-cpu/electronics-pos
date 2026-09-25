-- Repairs V1. Customer-owned devices and repair payments stay outside stock/POS.
begin;

create sequence public.repair_job_number_seq;
create table public.repair_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  job_number text not null default ('REP-' || nextval('public.repair_job_number_seq')::text),
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  product_id uuid references public.products(id) on delete restrict,
  product_serial_id uuid references public.product_serials(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete restrict,
  product_name text,
  device_type text not null check (length(trim(device_type)) between 1 and 120),
  brand_name text check (length(brand_name)<=120),
  model text not null check (length(trim(model)) between 1 and 200),
  imei text check (imei is null or imei ~ '^[0-9]{15}$'),
  serial_number text check (serial_number is null or length(serial_number) between 1 and 120),
  accessories_received text check (length(accessories_received)<=5000),
  fault_description text not null check (length(trim(fault_description)) between 1 and 5000),
  physical_condition text check (length(physical_condition)<=5000),
  intake_notes text check (length(intake_notes)<=5000),
  status text not null default 'received' check (status in
    ('received','diagnosing','awaiting_approval','awaiting_parts','in_repair','ready_for_collection','collected','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete restrict,
  repair_outcome text check (repair_outcome in
    ('repaired','no_fault_found','unrepaired','beyond_economic_repair','customer_declined','other')),
  parts_notes text check (length(parts_notes)<=5000),
  labour_notes text check (length(labour_notes)<=5000),
  internal_notes text check (length(internal_notes)<=5000),
  customer_notes text check (length(customer_notes)<=5000),
  estimated_amount numeric(12,2) check (estimated_amount >= 0 and estimated_amount <> 'NaN'::numeric),
  final_amount numeric(12,2) check (final_amount >= 0 and final_amount <> 'NaN'::numeric),
  currency_code text not null default 'GBP' check (currency_code = 'GBP'),
  received_at timestamptz not null default now(),
  estimated_completion_at timestamptz,
  completed_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id, job_number),
  unique (id, organization_id, branch_id),
  check (estimated_completion_at is null or estimated_completion_at >= received_at),
  check (status <> 'ready_for_collection' or (completed_at is not null and repair_outcome is not null)),
  check (status <> 'collected' or (collected_at is not null and final_amount is not null)),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create table public.repair_job_events (
  id uuid primary key default gen_random_uuid(),
  repair_job_id uuid not null,
  organization_id uuid not null,
  branch_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('created','updated','assigned','status_changed','payment','reversal')),
  previous_status text,
  new_status text,
  note text check (length(note)<=5000),
  customer_visible boolean not null default false,
  changed_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (repair_job_id, organization_id, branch_id)
    references public.repair_jobs(id, organization_id, branch_id) on delete restrict
);
create table public.repair_payments (
  id uuid primary key default gen_random_uuid(),
  repair_job_id uuid not null,
  organization_id uuid not null,
  branch_id uuid not null,
  amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
  currency_code text not null default 'GBP' check (currency_code = 'GBP'),
  payment_method text not null check (payment_method in ('CASH','CARD','BANK_TRANSFER')),
  reference text check (length(reference)<=200),
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  request_key uuid not null,
  reverses_payment_id uuid unique references public.repair_payments(id) on delete restrict,
  reversal_reason text check (length(reversal_reason)<=5000),
  created_at timestamptz not null default now(),
  unique (organization_id, request_key),
  foreign key (repair_job_id, organization_id, branch_id)
    references public.repair_jobs(id, organization_id, branch_id) on delete restrict,
  check ((reverses_payment_id is null and reversal_reason is null)
    or (reverses_payment_id is not null and length(trim(reversal_reason)) > 0))
);
create index repair_jobs_queue_idx on public.repair_jobs (organization_id, branch_id, status, received_at desc);
create index repair_jobs_assigned_idx on public.repair_jobs (organization_id, assigned_to, received_at desc);
create index repair_jobs_customer_idx on public.repair_jobs (organization_id, customer_id);
create index repair_jobs_imei_idx on public.repair_jobs (organization_id, imei) where imei is not null;
create index repair_jobs_serial_idx on public.repair_jobs (organization_id, serial_number) where serial_number is not null;
create index repair_events_job_idx on public.repair_job_events (repair_job_id, created_at);
create index repair_payments_job_idx on public.repair_payments (repair_job_id, received_at);

alter table public.repair_jobs enable row level security;
alter table public.repair_job_events enable row level security;
alter table public.repair_payments enable row level security;
create policy "Repair jobs readable in permitted branch" on public.repair_jobs for select to authenticated
using (public.has_permission('repairs.view', organization_id, branch_id));
create policy "Repair history readable in permitted branch" on public.repair_job_events for select to authenticated
using (public.has_permission('repairs.view', organization_id, branch_id));
create policy "Repair payments readable in permitted branch" on public.repair_payments for select to authenticated
using (public.has_permission('repairs.view', organization_id, branch_id));
revoke all on table public.repair_jobs, public.repair_job_events, public.repair_payments from public, anon, authenticated, service_role;
grant select on table public.repair_jobs, public.repair_job_events, public.repair_payments to authenticated;
revoke all on sequence public.repair_job_number_seq from public, anon, authenticated, service_role;

create function public.repair_prevent_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Repair history and payments are append-only; use a reversal';
end;
$$;
create trigger repair_events_immutable before update or delete on public.repair_job_events
for each row execute function public.repair_prevent_history_change();
create trigger repair_payments_immutable before update or delete on public.repair_payments
for each row execute function public.repair_prevent_history_change();

-- Private helpers are executable only by the owning RPCs, not exposed clients.
create function public.repair_assert_access(p_org uuid, p_branch uuid, p_manage boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode='42501', message='Repair access denied';
  end if;
  if p_org is null or (p_manage and p_branch is null) then
    raise exception 'An organisation and branch are required';
  end if;
  if p_manage then
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'Repair changes require READ COMMITTED isolation';
    end if;
    -- Compatible with the Stage 2 staff organisation lock and global suspension.
    perform 1 from public.organizations where id=p_org for share;
    perform 1 from public.profiles where id=auth.uid() for share;
  end if;
  if not public.has_permission(case when p_manage then 'repairs.manage' else 'repairs.view' end, p_org, p_branch)
    or (p_branch is not null and not exists (select 1 from public.branches b
      where b.id=p_branch and b.organization_id=p_org and (not p_manage or b.is_active))) then
    raise exception using errcode='42501', message='Repair access denied';
  end if;
end;
$$;
create function public.repair_assignee_eligible(p_user uuid, p_org uuid, p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is null or exists (
    select 1 from public.profiles p join public.user_organizations uo on uo.user_id=p.id
    where p.id=p_user and p.is_active and uo.organization_id=p_org and uo.is_active
      and (exists (select 1 from public.user_branches ub join public.branches b on b.id=ub.branch_id
        where ub.user_id=p.id and b.organization_id=p_org and b.id=p_branch)
      or exists (select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id
        join public.permissions perm on perm.id=rp.permission_id
        where ur.user_id=p.id and ur.organization_id=p_org and ur.branch_id is null
        and perm.key in ('repairs.view','repairs.manage')))
  );
$$;
create function public.get_repair_assignees(p_org uuid, p_branch uuid)
returns table(user_id uuid, full_name text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.repair_assert_access(p_org,p_branch,false);
  if p_branch is null then raise exception 'Select a branch for assignment'; end if;
  return query select p.id,p.full_name from public.profiles p
  where public.repair_assignee_eligible(p.id,p_org,p_branch)
  order by p.full_name nulls last,p.id;
end;
$$;
create function public.repair_lock_job(p_org uuid,p_branch uuid,p_job uuid,p_version integer default null)
returns public.repair_jobs language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs;
begin
  perform public.repair_assert_access(p_org,p_branch,true);
  select * into j from public.repair_jobs where id=p_job and organization_id=p_org and branch_id=p_branch for update;
  if not found then raise exception 'Repair not found in this workspace'; end if;
  if p_version is not null and j.version<>p_version then
    raise exception 'This repair changed. Refresh before saving';
  end if;
  return j;
end;
$$;
create function public.repair_paid_amount(p_job uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when reverses_payment_id is null then amount else -amount end),0)
  from public.repair_payments where repair_job_id=p_job;
$$;
create function public.repair_event(p_job public.repair_jobs,p_type text,p_note text,p_changes jsonb,
  p_previous text default null,p_next text default null)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.repair_job_events(repair_job_id,organization_id,branch_id,actor_id,event_type,note,changed_values,previous_status,new_status)
  values((p_job).id,(p_job).organization_id,(p_job).branch_id,auth.uid(),p_type,p_note,coalesce(p_changes,'{}'::jsonb),p_previous,p_next);
$$;

create function public.create_repair(p_org uuid,p_branch uuid,p_data jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  j public.repair_jobs;
  c public.customers;
  product public.products;
  serial public.product_serials;
  product_id uuid := nullif(p_data->>'product_id','')::uuid;
  serial_id uuid := nullif(p_data->>'product_serial_id','')::uuid;
  category_id uuid := nullif(p_data->>'category_id','')::uuid;
  brand_id uuid := nullif(p_data->>'brand_id','')::uuid;
  assignee uuid := nullif(p_data->>'assigned_to','')::uuid;
begin
  perform public.repair_assert_access(p_org,p_branch,true);
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>50000 then raise exception 'Invalid repair details'; end if;
  if not public.has_organization_permission_any_scope('customers.view',p_org) then
    raise exception using errcode='42501',message='Customer viewing permission is required';
  end if;
  select * into c from public.customers where id=(p_data->>'customer_id')::uuid and organization_id=p_org and is_active for share;
  if not found then raise exception 'Select an active customer in this organisation'; end if;
  if serial_id is not null then
    select * into serial from public.product_serials ps where ps.id=serial_id and ps.organization_id=p_org for share;
    if not found then raise exception 'Serial record does not belong to this organisation'; end if;
    if not public.has_permission('inventory.view',p_org,serial.branch_id) then
      raise exception using errcode='42501',message='Permission to view the source serial branch is required';
    end if;
    if product_id is not null and product_id<>serial.product_id then raise exception 'Serial and product do not match'; end if;
    product_id:=serial.product_id;
  end if;
  if product_id is not null then
    if not public.has_permission('products.view',p_org,p_branch) then
      raise exception using errcode='42501',message='Product viewing permission is required';
    end if;
    select * into product from public.products p where p.id=product_id and p.organization_id=p_org for share;
    if not found then raise exception 'Product does not belong to this organisation'; end if;
    category_id:=product.category_id;
    brand_id:=product.brand_id;
  end if;
  if category_id is not null and not exists(select 1 from public.categories c where c.id=category_id and c.organization_id=p_org) then raise exception 'Invalid device category'; end if;
  if brand_id is not null and not exists(select 1 from public.brands b where b.id=brand_id and b.organization_id=p_org) then raise exception 'Invalid device brand'; end if;
  perform 1 from public.profiles where id=assignee for share;
  if not public.repair_assignee_eligible(assignee,p_org,p_branch) then raise exception 'Assignee is not eligible for this branch'; end if;
  insert into public.repair_jobs(organization_id,branch_id,customer_id,customer_name,customer_phone,customer_email,
    product_id,product_serial_id,category_id,brand_id,product_name,device_type,brand_name,model,imei,serial_number,
    accessories_received,fault_description,physical_condition,intake_notes,priority,assigned_to,
    estimated_amount,estimated_completion_at,created_by,updated_by)
  values(p_org,p_branch,c.id,trim(concat_ws(' ',c.first_name,c.last_name)),c.phone,c.email,
    product_id,serial_id,category_id,brand_id,product.name,trim(p_data->>'device_type'),
    coalesce((select name from public.brands where id=brand_id),nullif(trim(p_data->>'brand_name'),'')),
    coalesce(nullif(trim(p_data->>'model'),''),product.name),
    case when serial_id is not null then serial.imei else nullif(trim(p_data->>'imei'),'') end,
    case when serial_id is not null then serial.serial_number else nullif(trim(p_data->>'serial_number'),'') end,
    nullif(p_data->>'accessories_received',''),trim(p_data->>'fault_description'),nullif(p_data->>'physical_condition',''),
    nullif(p_data->>'intake_notes',''),coalesce(p_data->>'priority','normal'),assignee,
    nullif(p_data->>'estimated_amount','')::numeric,nullif(p_data->>'estimated_completion_at','')::timestamptz,auth.uid(),auth.uid())
  returning * into j;
  perform public.repair_event(j,'created',null,jsonb_build_object('job_number',j.job_number),null,j.status);
  return j.id;
end;
$$;

-- Editable work fields only; ownership, customer and device evidence remain stable.
create function public.update_repair(p_org uuid,p_branch uuid,p_job uuid,p_version integer,p_data jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs; changed public.repair_jobs; paid numeric; cap numeric;
begin
  if p_version is null then raise exception 'Version is required'; end if;
  j:=public.repair_lock_job(p_org,p_branch,p_job,p_version);
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>50000 then raise exception 'Invalid repair details'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in
    ('priority','estimated_amount','final_amount','estimated_completion_at','parts_notes','labour_notes','internal_notes','customer_notes')) then
    raise exception 'Unsupported repair field';
  end if;
  changed:=jsonb_populate_record(j,p_data);
  -- Collection freezes the agreed charge, including after a payment reversal.
  if j.status='collected' and changed.final_amount is distinct from j.final_amount then
    raise exception 'The final charge cannot be changed after collection';
  end if;
  paid:=public.repair_paid_amount(j.id);
  cap:=coalesce(changed.final_amount,changed.estimated_amount);
  if paid>0 and (cap is null or cap<paid) then
    raise exception 'Reverse excess payments before reducing the charge';
  end if;
  update public.repair_jobs set priority=changed.priority,estimated_amount=changed.estimated_amount,
    final_amount=changed.final_amount,estimated_completion_at=changed.estimated_completion_at,
    parts_notes=changed.parts_notes,labour_notes=changed.labour_notes,internal_notes=changed.internal_notes,
    customer_notes=changed.customer_notes,version=version+1,updated_by=auth.uid(),updated_at=now() where id=j.id;
  perform public.repair_event(j,'updated',null,(select coalesce(jsonb_object_agg(k,jsonb_build_object('from',to_jsonb(j)->k,'to',to_jsonb(changed)->k)),'{}'::jsonb)
    from jsonb_object_keys(p_data) k where (to_jsonb(j)->k) is distinct from (to_jsonb(changed)->k)));
end;
$$;
create function public.assign_repair_staff(p_org uuid,p_branch uuid,p_job uuid,p_version integer,p_assignee uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs;
begin
  if p_version is null then raise exception 'Version is required'; end if;
  j:=public.repair_lock_job(p_org,p_branch,p_job,p_version);
  perform 1 from public.profiles where id=p_assignee for share;
  if not public.repair_assignee_eligible(p_assignee,p_org,p_branch) then raise exception 'Assignee is not eligible for this branch'; end if;
  update public.repair_jobs set assigned_to=p_assignee,version=version+1,updated_by=auth.uid(),updated_at=now() where id=j.id;
  perform public.repair_event(j,'assigned',null,jsonb_build_object('from',j.assigned_to,'to',p_assignee));
end;
$$;
create function public.change_repair_status(p_org uuid,p_branch uuid,p_job uuid,p_version integer,
  p_status text,p_outcome text default null,p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs; normal_move boolean;
begin
  if p_version is null then raise exception 'Version is required'; end if;
  j:=public.repair_lock_job(p_org,p_branch,p_job,p_version);
  if p_status is null or p_status not in ('received','diagnosing','awaiting_approval','awaiting_parts','in_repair','ready_for_collection','collected','cancelled') or p_status=j.status then
    raise exception 'Select a different valid status';
  end if;
  normal_move:=case j.status
    when 'received' then p_status='diagnosing'
    when 'diagnosing' then p_status in ('awaiting_approval','awaiting_parts','in_repair','ready_for_collection')
    when 'awaiting_approval' then p_status in ('awaiting_parts','in_repair','ready_for_collection')
    when 'awaiting_parts' then p_status in ('in_repair','ready_for_collection')
    when 'in_repair' then p_status in ('awaiting_parts','ready_for_collection')
    else false end;
  if p_status='collected' then
    if j.status not in ('ready_for_collection','cancelled') then raise exception 'Only ready or cancelled jobs can be collected'; end if;
    if j.final_amount is null or public.repair_paid_amount(j.id)<>j.final_amount then
      raise exception 'Agree the final charge and settle the balance before collection';
    end if;
  elsif p_status='cancelled' then
    if j.status='collected' then raise exception 'Reopen the collected job before cancellation'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'A cancellation reason is required'; end if;
  elsif not normal_move then
    -- Reopen terminal work only into diagnosis. Other backwards transitions
    -- among active work states require a reason; skipping intake is not allowed.
    if p_status not in ('diagnosing','awaiting_approval','awaiting_parts','in_repair')
      or (j.status in ('cancelled','collected') and p_status<>'diagnosing')
      or (j.status='received' and p_status<>'diagnosing') then raise exception 'Invalid status transition'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'A reason is required for a backwards or reopen transition'; end if;
  end if;
  if p_status='ready_for_collection' then
    if p_outcome is null or p_outcome not in
      ('repaired','no_fault_found','unrepaired','beyond_economic_repair','customer_declined','other') then
      raise exception 'Record a valid repair outcome';
    end if;
  elsif p_outcome is not null then
    raise exception 'An outcome may only be supplied when marking work ready for collection';
  end if;
  -- Cancellation/collection retain completed work evidence; active work clears it.
  update public.repair_jobs set status=p_status,
    repair_outcome=case when p_status='ready_for_collection' then p_outcome
      when p_status in ('collected','cancelled') then repair_outcome else null end,
    completed_at=case when p_status='ready_for_collection' then now() when p_status not in ('collected','cancelled') then null else completed_at end,
    collected_at=case when p_status='collected' then now() else null end,
    cancelled_at=case when p_status='cancelled' then now() when p_status='collected' then cancelled_at else null end,
    updated_at=now(),updated_by=auth.uid(),version=version+1 where id=j.id;
  perform public.repair_event(j,'status_changed',nullif(trim(p_reason),''),jsonb_build_object('outcome',p_outcome),j.status,p_status);
end;
$$;

create function public.record_repair_payment(p_org uuid,p_branch uuid,p_job uuid,p_amount numeric,p_method text,
  p_reference text,p_request_key uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs; existing public.repair_payments; payment_id uuid; cap numeric;
begin
  j:=public.repair_lock_job(p_org,p_branch,p_job);
  if p_request_key is null or p_amount is null or p_amount<=0 or p_amount='NaN'::numeric or p_amount<>round(p_amount,2)
    or p_method is null or p_method not in ('CASH','CARD','BANK_TRANSFER') then raise exception 'Invalid payment details'; end if;
  select * into existing from public.repair_payments where organization_id=p_org and request_key=p_request_key;
  if found then
    if existing.repair_job_id<>p_job or existing.reverses_payment_id is not null or existing.amount<>p_amount
      or existing.payment_method<>p_method or existing.reference is distinct from nullif(trim(p_reference),'') then
      raise exception 'This payment request key was used for different details';
    end if;
    return existing.id;
  end if;
  cap:=coalesce(j.final_amount,j.estimated_amount);
  if cap is null then raise exception 'Set an estimate or final charge before accepting a deposit'; end if;
  if public.repair_paid_amount(j.id)+p_amount>cap then raise exception 'Payment exceeds the remaining amount'; end if;
  insert into public.repair_payments(repair_job_id,organization_id,branch_id,amount,currency_code,payment_method,reference,received_by,request_key)
  values(j.id,p_org,p_branch,p_amount,j.currency_code,p_method,nullif(trim(p_reference),''),auth.uid(),p_request_key) returning id into payment_id;
  update public.repair_jobs set version=version+1,updated_at=now(),updated_by=auth.uid() where id=j.id;
  perform public.repair_event(j,'payment',null,jsonb_build_object('payment_id',payment_id,'amount',p_amount,'method',p_method));
  return payment_id;
end;
$$;
create function public.reverse_repair_payment(p_org uuid,p_branch uuid,p_job uuid,p_payment uuid,p_reason text,p_request_key uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs; original public.repair_payments; existing public.repair_payments; reversal_id uuid;
begin
  j:=public.repair_lock_job(p_org,p_branch,p_job);
  if p_request_key is null or nullif(trim(p_reason),'') is null then raise exception 'A reversal reason and request key are required'; end if;
  select * into existing from public.repair_payments where organization_id=p_org and request_key=p_request_key;
  if found then
    if existing.repair_job_id<>p_job or existing.reverses_payment_id is distinct from p_payment or existing.reversal_reason is distinct from trim(p_reason) then
      raise exception 'This reversal request key was used for different details';
    end if;
    return existing.id;
  end if;
  select * into original from public.repair_payments where id=p_payment and repair_job_id=j.id and reverses_payment_id is null;
  if not found then raise exception 'Original repair payment not found'; end if;
  if exists(select 1 from public.repair_payments where reverses_payment_id=original.id) then raise exception 'Payment is already reversed'; end if;
  insert into public.repair_payments(repair_job_id,organization_id,branch_id,amount,currency_code,payment_method,reference,
    received_by,request_key,reverses_payment_id,reversal_reason)
  values(j.id,p_org,p_branch,original.amount,j.currency_code,original.payment_method,original.reference,auth.uid(),p_request_key,original.id,trim(p_reason))
  returning id into reversal_id;
  update public.repair_jobs set version=version+1,updated_at=now(),updated_by=auth.uid() where id=j.id;
  perform public.repair_event(j,'reversal',trim(p_reason),jsonb_build_object('payment_id',original.id,'amount',original.amount));
  return reversal_id;
end;
$$;

create function public.repair_job_projection(j public.repair_jobs)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(j) || jsonb_build_object(
    'organization_name',(select name from public.organizations where id=j.organization_id),
    'branch_name',(select name from public.branches where id=j.branch_id),
    'assigned_name',(select full_name from public.profiles where id=j.assigned_to),
    'paid_amount',public.repair_paid_amount(j.id),
    'outstanding_balance',case when j.final_amount is null then null else j.final_amount-public.repair_paid_amount(j.id) end,
    'deposit_remaining',greatest(coalesce(j.final_amount,j.estimated_amount,0)-public.repair_paid_amount(j.id),0),
    'payment_status',case when j.final_amount is not null and public.repair_paid_amount(j.id)=j.final_amount then 'paid'
      when public.repair_paid_amount(j.id)>0 then 'part_paid' else 'unpaid' end,
    'can_manage',public.has_permission('repairs.manage',j.organization_id,j.branch_id));
$$;
create function public.query_repairs(p_org uuid,p_branch uuid,p_search text default '',p_status text default null,
  p_priority text default null,p_assignee uuid default null,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; total bigint;
begin
  perform public.repair_assert_access(p_org,p_branch,false);
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or length(coalesce(p_search,''))>200 then
    raise exception 'Invalid repair query';
  end if;
  select count(*) into total from public.repair_jobs j
  where j.organization_id=p_org and (p_branch is null or j.branch_id=p_branch)
    and (p_status is null or j.status=p_status) and (p_priority is null or j.priority=p_priority)
    and (p_assignee is null or j.assigned_to=p_assignee)
    and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',j.job_number,j.customer_name,j.customer_phone,j.customer_email,j.imei,j.serial_number,j.brand_name,j.model,j.device_type)),lower(p_search))>0);
  select coalesce(jsonb_agg(public.repair_job_projection(page::public.repair_jobs) order by page.received_at desc,page.id),'[]'::jsonb) into result
  from (select j.* from public.repair_jobs j
    where j.organization_id=p_org and (p_branch is null or j.branch_id=p_branch)
      and (p_status is null or j.status=p_status) and (p_priority is null or j.priority=p_priority)
      and (p_assignee is null or j.assigned_to=p_assignee)
      and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',j.job_number,j.customer_name,j.customer_phone,j.customer_email,j.imei,j.serial_number,j.brand_name,j.model,j.device_type)),lower(p_search))>0)
    order by j.received_at desc,j.id limit p_limit offset p_offset) page;
  return jsonb_build_object('jobs',result,'total',total);
end;
$$;
create function public.get_repair_detail(p_org uuid,p_branch uuid,p_job uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare j public.repair_jobs;
begin
  perform public.repair_assert_access(p_org,p_branch,false);
  if p_branch is null then raise exception 'A branch is required'; end if;
  select * into j from public.repair_jobs where id=p_job and organization_id=p_org and branch_id=p_branch for share;
  if not found then raise exception 'Repair not found in this workspace'; end if;
  return jsonb_build_object('job',public.repair_job_projection(j),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',p.full_name) order by e.created_at,e.id),'[]'::jsonb)
      from public.repair_job_events e left join public.profiles p on p.id=e.actor_id where e.repair_job_id=j.id),
    'payments',(select coalesce(jsonb_agg(to_jsonb(pay)||jsonb_build_object('received_by_name',p.full_name) order by pay.received_at,pay.id),'[]'::jsonb)
      from public.repair_payments pay left join public.profiles p on p.id=pay.received_by where pay.repair_job_id=j.id));
end;
$$;

-- Explicit ACLs on every new function, including private helpers and triggers.
revoke all on function public.repair_prevent_history_change() from public,anon,authenticated,service_role;
revoke all on function public.repair_assert_access(uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.repair_assignee_eligible(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.repair_lock_job(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.repair_paid_amount(uuid) from public,anon,authenticated,service_role;
revoke all on function public.repair_event(public.repair_jobs,text,text,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.repair_job_projection(public.repair_jobs) from public,anon,authenticated,service_role;
revoke all on function public.get_repair_assignees(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_repair(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.update_repair(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.assign_repair_staff(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.change_repair_status(uuid,uuid,uuid,integer,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_repair_payment(uuid,uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.reverse_repair_payment(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.query_repairs(uuid,uuid,text,text,text,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_repair_detail(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_repair_assignees(uuid,uuid),public.create_repair(uuid,uuid,jsonb),
  public.update_repair(uuid,uuid,uuid,integer,jsonb),public.assign_repair_staff(uuid,uuid,uuid,integer,uuid),
  public.change_repair_status(uuid,uuid,uuid,integer,text,text,text),public.record_repair_payment(uuid,uuid,uuid,numeric,text,text,uuid),
  public.reverse_repair_payment(uuid,uuid,uuid,uuid,text,uuid),public.query_repairs(uuid,uuid,text,text,text,uuid,integer,integer),
  public.get_repair_detail(uuid,uuid,uuid) to authenticated;

do $$
declare t text; r text; f record;
begin
  foreach t in array array['public.repair_jobs','public.repair_job_events','public.repair_payments'] loop
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        or has_any_column_privilege(r,t,'INSERT,UPDATE,REFERENCES') then raise exception 'Unexpected repair mutation privilege'; end if;
      if has_table_privilege(r,t,'SELECT') is distinct from (r='authenticated') then raise exception 'Unexpected repair SELECT privilege'; end if;
    end loop;
  end loop;
  for f in select p.oid,p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('repair_prevent_history_change','repair_assert_access','repair_assignee_eligible',
      'repair_lock_job','repair_paid_amount','repair_event','repair_job_projection','get_repair_assignees','create_repair',
      'update_repair','assign_repair_staff','change_repair_status','record_repair_payment','reverse_repair_payment','query_repairs','get_repair_detail') loop
    if has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('service_role',f.oid,'EXECUTE')
      or has_function_privilege('authenticated',f.oid,'EXECUTE') is distinct from (f.proname not like 'repair_%') then
      raise exception 'Unexpected repair function EXECUTE privilege';
    end if;
  end loop;
end;
$$;
commit;
