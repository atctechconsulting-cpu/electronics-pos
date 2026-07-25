create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  sale_id uuid not null
    references public.sales(id)
    on delete restrict,

  customer_id uuid
    references public.customers(id)
    on delete set null,

  return_number text not null,

  status text not null default 'COMPLETED'
    check (
      status in (
        'DRAFT',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  reason text,
  notes text,

  refund_amount numeric(12, 2) not null default 0
    check (refund_amount >= 0),

  refund_method text
    check (
      refund_method is null
      or refund_method in (
        'CASH',
        'CARD',
        'BANK_TRANSFER',
        'STORE_CREDIT',
        'NO_REFUND'
      )
    ),

  processed_by uuid not null
    references public.profiles(id)
    on delete restrict,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint returns_org_number_unique
    unique (organization_id, return_number)
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),

  return_id uuid not null
    references public.returns(id)
    on delete cascade,

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  sale_id uuid not null
    references public.sales(id)
    on delete restrict,

  sale_item_id uuid not null
    references public.sale_items(id)
    on delete restrict,

  product_id uuid not null
    references public.products(id)
    on delete restrict,

  quantity integer not null
    check (quantity > 0),

  unit_price numeric(12, 2) not null
    check (unit_price >= 0),

  line_refund_amount numeric(12, 2) not null
    check (line_refund_amount >= 0),

  restock boolean not null default true,

  created_at timestamptz not null default now()
);

create table if not exists public.return_serials (
  id uuid primary key default gen_random_uuid(),

  return_item_id uuid not null
    references public.return_items(id)
    on delete cascade,

  product_serial_id uuid not null
    references public.product_serials(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  constraint return_serial_unique
    unique (return_item_id, product_serial_id)
);

create index if not exists returns_organization_id_idx
on public.returns (organization_id);

create index if not exists returns_branch_id_idx
on public.returns (branch_id);

create index if not exists returns_sale_id_idx
on public.returns (sale_id);

create index if not exists returns_created_at_idx
on public.returns (created_at desc);

create index if not exists return_items_return_id_idx
on public.return_items (return_id);

create index if not exists return_items_sale_item_id_idx
on public.return_items (sale_item_id);

create index if not exists return_items_product_id_idx
on public.return_items (product_id);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.return_serials enable row level security;

create policy "Users can view returns for accessible branches"
on public.returns
for select
to authenticated
using (
  public.is_branch_member(branch_id)
  or public.is_org_member(organization_id)
);

create policy "Users can create returns for accessible branches"
on public.returns
for insert
to authenticated
with check (
  processed_by = auth.uid()
  and (
    public.is_branch_member(branch_id)
    or public.is_org_member(organization_id)
  )
);

create policy "Users can view return items for accessible branches"
on public.return_items
for select
to authenticated
using (
  public.is_branch_member(branch_id)
  or public.is_org_member(organization_id)
);

create policy "Users can create return items for accessible branches"
on public.return_items
for insert
to authenticated
with check (
  public.is_branch_member(branch_id)
  or public.is_org_member(organization_id)
);

create policy "Users can view return serials"
on public.return_serials
for select
to authenticated
using (
  exists (
    select 1
    from public.return_items ri
    where ri.id = return_item_id
      and (
        public.is_branch_member(ri.branch_id)
        or public.is_org_member(ri.organization_id)
      )
  )
);

create policy "Users can create return serials"
on public.return_serials
for insert
to authenticated
with check (
  exists (
    select 1
    from public.return_items ri
    where ri.id = return_item_id
      and (
        public.is_branch_member(ri.branch_id)
        or public.is_org_member(ri.organization_id)
      )
  )
);