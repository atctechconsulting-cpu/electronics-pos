create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  branch_id uuid not null
    references public.branches(id),

  supplier_id uuid not null
    references public.suppliers(id),

  purchase_order_id uuid
    references public.purchase_orders(id)
    on delete set null,

  invoice_number text not null,

  invoice_date date not null default current_date,

  due_date date,

  status text not null default 'UNPAID',

  subtotal numeric(12,2) not null default 0,

  tax_amount numeric(12,2) not null default 0,

  discount_amount numeric(12,2) not null default 0,

  total_amount numeric(12,2) not null default 0,

  amount_paid numeric(12,2) not null default 0,

  amount_due numeric(12,2)
    generated always as
      (total_amount - amount_paid)
    stored,

  notes text,

  created_by uuid
    references public.profiles(id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint supplier_invoices_status_check
    check (
      status in (
        'UNPAID',
        'PARTIALLY_PAID',
        'PAID',
        'CANCELLED'
      )
    ),

  constraint supplier_invoices_amounts_check
    check (
      subtotal >= 0
      and tax_amount >= 0
      and discount_amount >= 0
      and total_amount >= 0
      and amount_paid >= 0
      and amount_paid <= total_amount
    ),

  constraint supplier_invoices_org_number_unique
    unique (
      organization_id,
      supplier_id,
      invoice_number
    )
);

create index supplier_invoices_organization_idx
  on public.supplier_invoices(organization_id);

create index supplier_invoices_branch_idx
  on public.supplier_invoices(branch_id);

create index supplier_invoices_supplier_idx
  on public.supplier_invoices(supplier_id);

create index supplier_invoices_purchase_order_idx
  on public.supplier_invoices(purchase_order_id);

create index supplier_invoices_status_idx
  on public.supplier_invoices(status);

create index supplier_invoices_due_date_idx
  on public.supplier_invoices(due_date);


------------------------------------------------------------
-- Supplier payments
------------------------------------------------------------

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  branch_id uuid not null
    references public.branches(id),

  supplier_id uuid not null
    references public.suppliers(id),

  supplier_invoice_id uuid not null
    references public.supplier_invoices(id),

  amount numeric(12,2) not null,

  payment_method text not null,

  reference text,

  payment_date date not null default current_date,

  notes text,

  created_by uuid
    references public.profiles(id),

  created_at timestamptz not null default now(),

  constraint supplier_payments_amount_check
    check (amount > 0),

  constraint supplier_payments_method_check
    check (
      payment_method in (
        'CASH',
        'BANK_TRANSFER',
        'CARD',
        'CHEQUE',
        'OTHER'
      )
    )
);

create index supplier_payments_organization_idx
  on public.supplier_payments(organization_id);

create index supplier_payments_supplier_idx
  on public.supplier_payments(supplier_id);

create index supplier_payments_invoice_idx
  on public.supplier_payments(supplier_invoice_id);

create index supplier_payments_payment_date_idx
  on public.supplier_payments(payment_date);


------------------------------------------------------------
-- updated_at trigger
------------------------------------------------------------

create or replace function
public.set_supplier_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger supplier_invoices_updated_at
before update on public.supplier_invoices
for each row
execute function
  public.set_supplier_invoice_updated_at();


------------------------------------------------------------
-- RLS
------------------------------------------------------------

alter table public.supplier_invoices
enable row level security;

alter table public.supplier_payments
enable row level security;


------------------------------------------------------------
-- Supplier invoice policies
------------------------------------------------------------

create policy "Users can view supplier invoices"
on public.supplier_invoices
for select
to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy "Users can create supplier invoices"
on public.supplier_invoices
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy "Users can update supplier invoices"
on public.supplier_invoices
for update
to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
)
with check (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);


------------------------------------------------------------
-- Supplier payment policies
------------------------------------------------------------

create policy "Users can view supplier payments"
on public.supplier_payments
for select
to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy "Users can create supplier payments"
on public.supplier_payments
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);


------------------------------------------------------------
-- Grants
------------------------------------------------------------

grant select, insert, update
on public.supplier_invoices
to authenticated;

grant select, insert
on public.supplier_payments
to authenticated;