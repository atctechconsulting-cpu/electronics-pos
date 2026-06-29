create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,

  name text not null,
  sku text not null,
  barcode text,

  description text,

  cost_price numeric(12, 2) not null default 0,
  retail_price numeric(12, 2) not null default 0,
  wholesale_price numeric(12, 2) not null default 0,

  track_inventory boolean not null default true,
  is_serialized boolean not null default false,
  requires_imei boolean not null default false,

  warranty_months integer not null default 12,

  main_image_url text,

  is_active boolean not null default true,
  is_featured boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_org_sku_unique unique (organization_id, sku),
  constraint products_org_barcode_unique unique (organization_id, barcode),
  constraint products_prices_check check (
    cost_price >= 0
    and retail_price >= 0
    and wholesale_price >= 0
  ),
  constraint products_warranty_check check (warranty_months >= 0)
);

create index products_organization_id_idx on public.products (organization_id);
create index products_category_id_idx on public.products (category_id);
create index products_brand_id_idx on public.products (brand_id);
create index products_supplier_id_idx on public.products (supplier_id);
create index products_name_idx on public.products using gin (to_tsvector('english', name));
create index products_sku_idx on public.products (sku);
create index products_barcode_idx on public.products (barcode);
create index products_is_active_idx on public.products (is_active);

alter table public.products enable row level security;

create policy "Users can view products"
on public.products
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy "Users can manage products"
on public.products
for all
to authenticated
using (
  public.has_permission('products.manage', organization_id, null)
)
with check (
  public.has_permission('products.manage', organization_id, null)
);