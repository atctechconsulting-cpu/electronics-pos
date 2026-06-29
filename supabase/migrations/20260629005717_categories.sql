create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  slug text not null,
  description text,
  parent_id uuid references public.categories(id) on delete set null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_org_slug_unique unique (organization_id, slug)
);

create index categories_organization_id_idx
on public.categories (organization_id);
create index categories_parent_id_idx
on public.categories (parent_id);
create index categories_is_active_idx
on public.categories (is_active);

alter table public.categories enable row level security;

create policy "Users can view categories"
on public.categories
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy "Users with product permission can manage categories"
on public.categories
for all
to authenticated
using (
  public.has_permission('products.manage', organization_id, null)
)
with check (
  public.has_permission('products.manage', organization_id, null)
);