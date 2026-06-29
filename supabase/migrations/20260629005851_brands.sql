create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  slug text not null,
  description text,
  logo_url text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brands_org_slug_unique unique (organization_id, slug)
);

create index brands_organization_id_idx
on public.brands (organization_id);
create index brands_is_active_idx
on public.brands (is_active);

alter table public.brands enable row level security;

create policy "Users can view brands"
on public.brands
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy "Users with product permission can manage brands"
on public.brands
for all
to authenticated
using (
  public.has_permission('products.manage', organization_id, null)
)
with check (
  public.has_permission('products.manage', organization_id, null)
);