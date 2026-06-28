create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text,
  phone text,
  website text,
  address_line_1 text,
  address_line_2 text,
  city text,
  county text,
  postcode text,
  country text not null default 'United Kingdom',
  currency text not null default 'GBP',
  timezone text not null default 'Europe/London',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_slug_idx
on public.organizations (slug);

create index organizations_is_active_idx
on public.organizations (is_active);