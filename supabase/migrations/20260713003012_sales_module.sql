create table public.sales (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  cashier_id uuid not null
    references public.profiles(id)
    on delete restrict,

  customer_id uuid,

  receipt_number text not null,

  status text not null default 'COMPLETED'
    check (status in ('DRAFT', 'HELD', 'COMPLETED', 'CANCELLED', 'REFUNDED')),

  subtotal numeric(12, 2) not null default 0
    check (subtotal >= 0),

  vat_amount numeric(12, 2) not null default 0
    check (vat_amount >= 0),

  discount_amount numeric(12, 2) not null default 0
    check (discount_amount >= 0),

  total_amount numeric(12, 2) not null default 0
    check (total_amount >= 0),

  notes text,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sales_org_receipt_unique
    unique (organization_id, receipt_number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),

  sale_id uuid not null
    references public.sales(id)
    on delete cascade,

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  product_id uuid not null
    references public.products(id)
    on delete restrict,

  quantity integer not null
    check (quantity > 0),

  unit_price numeric(12, 2) not null
    check (unit_price >= 0),

  unit_cost numeric(12, 2) not null default 0
    check (unit_cost >= 0),

  discount_amount numeric(12, 2) not null default 0
    check (discount_amount >= 0),

  vat_amount numeric(12, 2) not null default 0
    check (vat_amount >= 0),

  line_total numeric(12, 2) not null
    check (line_total >= 0),

  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  sale_id uuid not null
    references public.sales(id)
    on delete cascade,

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  payment_method text not null
    check (
      payment_method in (
        'CASH',
        'CARD',
        'BANK_TRANSFER',
        'STORE_CREDIT',
        'GIFT_CARD'
      )
    ),

  amount numeric(12, 2) not null
    check (amount > 0),

  reference text,

  received_by uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now()
);

create index sales_organization_id_idx
on public.sales (organization_id);

create index sales_branch_id_idx
on public.sales (branch_id);

create index sales_cashier_id_idx
on public.sales (cashier_id);

create index sales_created_at_idx
on public.sales (created_at desc);

create index sales_status_idx
on public.sales (status);

create index sale_items_sale_id_idx
on public.sale_items (sale_id);

create index sale_items_product_id_idx
on public.sale_items (product_id);

create index payments_sale_id_idx
on public.payments (sale_id);

create index payments_created_at_idx
on public.payments (created_at desc);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;

create policy "Users can view sales for accessible branches"
on public.sales
for select
to authenticated
using (
  public.is_branch_member(branch_id)
  or public.is_org_member(organization_id)
);

create policy "Users with sales permission can create sales"
on public.sales
for insert
to authenticated
with check (
  cashier_id = auth.uid()
  and public.has_permission(
    'sales.create',
    organization_id,
    branch_id
  )
);

create policy "Users can view sale items for accessible branches"
on public.sale_items
for select
to authenticated
using (
  public.is_branch_member(branch_id)
  or public.is_org_member(organization_id)
);

create policy "Users with sales permission can create sale items"
on public.sale_items
for insert
to authenticated
with check (
  public.has_permission(
    'sales.create',
    organization_id,
    branch_id
  )
);

create policy "Users can view payments for accessible branches"
on public.payments
for select
to authenticated
using (
  public.is_branch_member(branch_id)
  or public.is_org_member(organization_id)
);

create policy "Users with sales permission can create payments"
on public.payments
for insert
to authenticated
with check (
  received_by = auth.uid()
  and public.has_permission(
    'sales.create',
    organization_id,
    branch_id
  )
);