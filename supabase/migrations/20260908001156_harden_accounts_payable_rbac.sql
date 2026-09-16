-- ============================================================
-- AlphaPOS v0.7
-- Harden Accounts Payable RBAC
--
-- Security goals:
-- 1. Supplier invoices require finance.view.
-- 2. Supplier payments require finance.view.
-- 3. Branch-scoped permissions remain branch-scoped.
-- 4. Organisation-scoped finance roles can operate across
--    branches in their organisation.
-- 5. SECURITY DEFINER AP RPCs independently enforce RBAC.
-- ============================================================


-- ============================================================
-- 1. SUPPLIER INVOICE RLS
-- ============================================================

drop policy if exists
"Users can view supplier invoices"
on public.supplier_invoices;

drop policy if exists
"Users can create supplier invoices"
on public.supplier_invoices;

drop policy if exists
"Users can update supplier invoices"
on public.supplier_invoices;


create policy
"Finance users can view supplier invoices"
on public.supplier_invoices
for select
to authenticated
using (
  public.has_permission(
    'finance.view',
    organization_id,
    branch_id
  )
);


create policy
"Finance users can create supplier invoices"
on public.supplier_invoices
for insert
to authenticated
with check (
  public.has_permission(
    'finance.view',
    organization_id,
    branch_id
  )
);


create policy
"Finance users can update supplier invoices"
on public.supplier_invoices
for update
to authenticated
using (
  public.has_permission(
    'finance.view',
    organization_id,
    branch_id
  )
)
with check (
  public.has_permission(
    'finance.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- 2. SUPPLIER PAYMENT RLS
-- ============================================================

drop policy if exists
"Users can view supplier payments"
on public.supplier_payments;

drop policy if exists
"Users can create supplier payments"
on public.supplier_payments;


create policy
"Finance users can view supplier payments"
on public.supplier_payments
for select
to authenticated
using (
  public.has_permission(
    'finance.view',
    organization_id,
    branch_id
  )
);


create policy
"Finance users can create supplier payments"
on public.supplier_payments
for insert
to authenticated
with check (
  public.has_permission(
    'finance.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- 3. HARDEN CREATE SUPPLIER INVOICE RPC
-- ============================================================

create or replace function public.create_supplier_invoice(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date default null,
  p_purchase_order_id uuid default null,
  p_subtotal numeric default 0,
  p_tax_amount numeric default 0,
  p_discount_amount numeric default 0,
  p_total_amount numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_supplier public.suppliers%rowtype;
  v_purchase_order public.purchase_orders%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
begin

  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;


  -- ----------------------------------------------------------
  -- Validate branch and determine organisation
  -- ----------------------------------------------------------

  select organization_id
  into v_organization_id
  from public.branches
  where id = p_branch_id;

  if not found then
    raise exception 'Branch not found.';
  end if;


  -- ----------------------------------------------------------
  -- Finance permission
  -- ----------------------------------------------------------
  --
  -- This is intentionally checked inside this SECURITY DEFINER
  -- function. RLS alone must not be relied upon because
  -- SECURITY DEFINER functions can operate outside normal
  -- caller RLS behaviour.

  if not public.has_permission(
    'finance.view',
    v_organization_id,
    p_branch_id
  ) then
    raise exception
      'You do not have permission to manage Accounts Payable for this branch.';
  end if;


  -- ----------------------------------------------------------
  -- Validate supplier
  -- ----------------------------------------------------------

  select *
  into v_supplier
  from public.suppliers
  where id = p_supplier_id
    and organization_id = v_organization_id;

  if not found then
    raise exception 'Supplier not found.';
  end if;


  -- ----------------------------------------------------------
  -- Validate invoice number
  -- ----------------------------------------------------------

  v_invoice_number :=
    nullif(trim(p_invoice_number), '');

  if v_invoice_number is null then
    raise exception 'Supplier invoice number is required.';
  end if;


  -- ----------------------------------------------------------
  -- Validate dates
  -- ----------------------------------------------------------

  if p_invoice_date is null then
    raise exception 'Invoice date is required.';
  end if;

  if p_due_date is not null
    and p_due_date < p_invoice_date then
    raise exception 'Due date cannot be before invoice date.';
  end if;


  -- ----------------------------------------------------------
  -- Validate amounts
  -- ----------------------------------------------------------

  if coalesce(p_subtotal, 0) < 0 then
    raise exception 'Subtotal cannot be negative.';
  end if;

  if coalesce(p_tax_amount, 0) < 0 then
    raise exception 'Tax amount cannot be negative.';
  end if;

  if coalesce(p_discount_amount, 0) < 0 then
    raise exception 'Discount amount cannot be negative.';
  end if;

  if coalesce(p_total_amount, 0) <= 0 then
    raise exception 'Invoice total must be greater than zero.';
  end if;


  -- ----------------------------------------------------------
  -- Validate arithmetic
  -- ----------------------------------------------------------

  if round(
    (
      coalesce(p_subtotal, 0)
      -
      coalesce(p_discount_amount, 0)
      +
      coalesce(p_tax_amount, 0)
    )::numeric,
    2
  ) <> round(
    coalesce(p_total_amount, 0)::numeric,
    2
  ) then
    raise exception
      'Invoice total does not match subtotal, discount and tax.';
  end if;


  -- ----------------------------------------------------------
  -- Prevent duplicate supplier invoice number
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.supplier_invoices
    where organization_id = v_organization_id
      and supplier_id = p_supplier_id
      and lower(invoice_number) = lower(v_invoice_number)
  ) then
    raise exception
      'Invoice number % already exists for this supplier.',
      v_invoice_number;
  end if;


  -- ----------------------------------------------------------
  -- Validate optional purchase order
  -- ----------------------------------------------------------

  if p_purchase_order_id is not null then

    select *
    into v_purchase_order
    from public.purchase_orders
    where id = p_purchase_order_id;

    if not found then
      raise exception 'Purchase order not found.';
    end if;

    if v_purchase_order.organization_id
      <> v_organization_id then
      raise exception
        'Purchase order belongs to another organization.';
    end if;

    if v_purchase_order.branch_id
      <> p_branch_id then
      raise exception
        'Purchase order belongs to another branch.';
    end if;

    if v_purchase_order.supplier_id
      <> p_supplier_id then
      raise exception
        'Purchase order belongs to another supplier.';
    end if;

    if v_purchase_order.status not in (
      'ORDERED',
      'PARTIALLY_RECEIVED',
      'RECEIVED'
    ) then
      raise exception
        'Only active or received purchase orders can be invoiced.';
    end if;

    if exists (
      select 1
      from public.supplier_invoices
      where purchase_order_id = p_purchase_order_id
        and status <> 'CANCELLED'
    ) then
      raise exception
        'This purchase order already has a supplier invoice.';
    end if;

  end if;


  -- ----------------------------------------------------------
  -- Create invoice
  -- ----------------------------------------------------------

  insert into public.supplier_invoices (
    organization_id,
    branch_id,
    supplier_id,
    purchase_order_id,
    invoice_number,
    invoice_date,
    due_date,
    status,
    subtotal,
    tax_amount,
    discount_amount,
    total_amount,
    amount_paid,
    notes,
    created_by
  )
  values (
    v_organization_id,
    p_branch_id,
    p_supplier_id,
    p_purchase_order_id,
    v_invoice_number,
    p_invoice_date,
    p_due_date,
    'UNPAID',
    round(coalesce(p_subtotal, 0), 2),
    round(coalesce(p_tax_amount, 0), 2),
    round(coalesce(p_discount_amount, 0), 2),
    round(coalesce(p_total_amount, 0), 2),
    0,
    nullif(trim(p_notes), ''),
    v_user_id
  )
  returning id
  into v_invoice_id;


  return jsonb_build_object(
    'supplier_invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'supplier_id', p_supplier_id,
    'branch_id', p_branch_id,
    'purchase_order_id', p_purchase_order_id,
    'status', 'UNPAID',
    'total_amount', round(p_total_amount, 2),
    'amount_paid', 0,
    'amount_due', round(p_total_amount, 2)
  );

end;
$$;


-- ============================================================
-- 4. HARDEN RECORD SUPPLIER PAYMENT RPC
-- ============================================================

create or replace function public.record_supplier_payment(
  p_supplier_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date default current_date,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_invoice public.supplier_invoices%rowtype;
  v_payment_id uuid;
  v_new_amount_paid numeric(12,2);
  v_new_amount_due numeric(12,2);
  v_new_status text;
  v_payment_method text;
begin

  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;


  -- ----------------------------------------------------------
  -- Lock supplier invoice
  -- ----------------------------------------------------------

  select *
  into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
  for update;

  if not found then
    raise exception 'Supplier invoice not found.';
  end if;


  -- ----------------------------------------------------------
  -- Finance permission
  -- ----------------------------------------------------------

  if not public.has_permission(
    'finance.view',
    v_invoice.organization_id,
    v_invoice.branch_id
  ) then
    raise exception
      'You do not have permission to manage Accounts Payable for this branch.';
  end if;


  -- ----------------------------------------------------------
  -- Invoice state
  -- ----------------------------------------------------------

  if v_invoice.status = 'CANCELLED' then
    raise exception
      'Payments cannot be recorded against a cancelled invoice.';
  end if;

  if v_invoice.status = 'PAID' then
    raise exception
      'This supplier invoice is already fully paid.';
  end if;


  -- ----------------------------------------------------------
  -- Validate payment amount
  -- ----------------------------------------------------------

  if p_amount is null or p_amount <= 0 then
    raise exception
      'Payment amount must be greater than zero.';
  end if;

  if p_amount >
    (
      v_invoice.total_amount
      -
      v_invoice.amount_paid
    ) then
    raise exception
      'Payment amount exceeds the outstanding invoice balance.';
  end if;


  -- ----------------------------------------------------------
  -- Validate payment date
  -- ----------------------------------------------------------

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;


  -- ----------------------------------------------------------
  -- Validate payment method
  -- ----------------------------------------------------------

  v_payment_method :=
    upper(trim(p_payment_method));

  if v_payment_method not in (
    'CASH',
    'BANK_TRANSFER',
    'CARD',
    'CHEQUE',
    'OTHER'
  ) then
    raise exception 'Invalid supplier payment method.';
  end if;


  -- ----------------------------------------------------------
  -- Calculate new invoice balance
  -- ----------------------------------------------------------

  v_new_amount_paid :=
    round(
      v_invoice.amount_paid + p_amount,
      2
    );

  v_new_amount_due :=
    round(
      v_invoice.total_amount - v_new_amount_paid,
      2
    );

  if v_new_amount_due <= 0 then
    v_new_status := 'PAID';
  else
    v_new_status := 'PARTIALLY_PAID';
  end if;


  -- ----------------------------------------------------------
  -- Create payment audit record
  -- ----------------------------------------------------------

  insert into public.supplier_payments (
    organization_id,
    branch_id,
    supplier_id,
    supplier_invoice_id,
    amount,
    payment_method,
    reference,
    payment_date,
    notes,
    created_by
  )
  values (
    v_invoice.organization_id,
    v_invoice.branch_id,
    v_invoice.supplier_id,
    v_invoice.id,
    round(p_amount, 2),
    v_payment_method,
    nullif(trim(p_reference), ''),
    p_payment_date,
    nullif(trim(p_notes), ''),
    v_user_id
  )
  returning id
  into v_payment_id;


  -- ----------------------------------------------------------
  -- Update invoice
  -- ----------------------------------------------------------

  update public.supplier_invoices
  set
    amount_paid = v_new_amount_paid,
    status = v_new_status,
    updated_at = now()
  where id = v_invoice.id;


  return jsonb_build_object(
    'supplier_payment_id', v_payment_id,
    'supplier_invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'payment_amount', round(p_amount, 2),
    'payment_method', v_payment_method,
    'status', v_new_status,
    'total_amount', v_invoice.total_amount,
    'amount_paid', v_new_amount_paid,
    'amount_due', v_new_amount_due
  );

end;
$$;


-- ============================================================
-- 5. FUNCTION EXECUTION PERMISSIONS
-- ============================================================

revoke all
on function public.create_supplier_invoice(
  uuid,
  uuid,
  text,
  date,
  date,
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  text
)
from public;

grant execute
on function public.create_supplier_invoice(
  uuid,
  uuid,
  text,
  date,
  date,
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  text
)
to authenticated;


revoke all
on function public.record_supplier_payment(
  uuid,
  numeric,
  text,
  date,
  text,
  text
)
from public;

grant execute
on function public.record_supplier_payment(
  uuid,
  numeric,
  text,
  date,
  text,
  text
)
to authenticated;