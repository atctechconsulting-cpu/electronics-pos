create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  name text not null,
  supplier_code text not null,

  contact_name text,
  email text,
  phone text,
  mobile text,

  website text,

  address_line_1 text,
  address_line_2 text,
  city text,
  county text,
  postcode text,
  country text default 'United Kingdom',

  payment_terms integer default 30,

  notes text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint suppliers_code_unique
    unique (organization_id, supplier_code)
);

create index suppliers_org_idx
on public.suppliers (organization_id);

create index suppliers_active_idx
on public.suppliers (is_active);

alter table public.suppliers enable row level security;

create policy "Users can view suppliers"
on public.suppliers
for select
to authenticated
using (
    public.is_org_member(organization_id)
);

create policy "Users can manage suppliers"
on public.suppliers
for all
to authenticated
using (
    public.has_permission('suppliers.manage', organization_id, null)
)
with check (
    public.has_permission('suppliers.manage', organization_id, null)
);