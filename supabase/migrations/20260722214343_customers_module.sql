create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  created_at_branch_id uuid
    references public.branches(id)
    on delete set null,

  customer_code text not null,

  customer_type text not null default 'RETAIL'
    check (
      customer_type in (
        'RETAIL',
        'WHOLESALE',
        'CORPORATE'
      )
    ),

  first_name text not null,
  last_name text,

  email text,
  phone text,

  company_name text,
  tax_number text,

  address_line_1 text,
  address_line_2 text,
  city text,
  postcode text,
  country text not null default 'United Kingdom',

  notes text,

  is_active boolean not null default true,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_org_code_unique
    unique (organization_id, customer_code)
);

create index if not exists customers_organization_id_idx
on public.customers (organization_id);

create index if not exists customers_phone_idx
on public.customers (phone);

create index if not exists customers_email_idx
on public.customers (email);

create index if not exists customers_name_idx
on public.customers (
  organization_id,
  first_name,
  last_name
);

create index if not exists customers_active_idx
on public.customers (
  organization_id,
  is_active
);

alter table public.customers enable row level security;

drop policy if exists
  "Organization members can view customers"
on public.customers;

create policy
  "Organization members can view customers"
on public.customers
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

drop policy if exists
  "Organization members can create customers"
on public.customers;

create policy
  "Organization members can create customers"
on public.customers
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and created_by = auth.uid()
);

drop policy if exists
  "Organization members can update customers"
on public.customers;

create policy
  "Organization members can update customers"
on public.customers
for update
to authenticated
using (
  public.is_org_member(organization_id)
)
with check (
  public.is_org_member(organization_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_customer_id_fkey'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
    add constraint sales_customer_id_fkey
    foreign key (customer_id)
    references public.customers(id)
    on delete set null;
  end if;
end;
$$;

create or replace function public.generate_customer_code(
  p_organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_number bigint;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'You do not belong to this organization.';
  end if;

  select coalesce(
    max(
      nullif(
        regexp_replace(customer_code, '[^0-9]', '', 'g'),
        ''
      )::bigint
    ),
    0
  ) + 1
  into v_next_number
  from public.customers
  where organization_id = p_organization_id;

  return 'CUS-' || lpad(v_next_number::text, 6, '0');
end;
$$;

revoke all
on function public.generate_customer_code(uuid)
from public;

grant execute
on function public.generate_customer_code(uuid)
to authenticated;