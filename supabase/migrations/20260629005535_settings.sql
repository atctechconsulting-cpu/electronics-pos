create table public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,

  business_name text not null,
  vat_number text,
  default_currency text not null default 'GBP',
  default_timezone text not null default 'Europe/London',

  receipt_header text,
  receipt_footer text,
  invoice_prefix text not null default 'INV',
  next_invoice_number integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

create policy "Users can view organization settings"
on public.organization_settings
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy "Admins can manage organization settings"
on public.organization_settings
for all
to authenticated
using (
  public.has_permission('settings.manage', organization_id, null)
)
with check (
  public.has_permission('settings.manage', organization_id, null)
);

create index organization_settings_organization_id_idx
on public.organization_settings (organization_id);