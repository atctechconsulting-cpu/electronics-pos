create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  code text not null,
  email text,
  phone text,

  address_line_1 text,
  address_line_2 text,
  city text,
  county text,
  postcode text,
  country text not null default 'United Kingdom',

  is_head_office boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branches_org_code_unique unique (organization_id, code)
);

create index branches_organization_id_idx
on public.branches (organization_id);

create index branches_is_active_idx
on public.branches (is_active);