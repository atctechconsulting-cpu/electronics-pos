-- ============================================================
-- AlphaPOS
-- Harden Suppliers RBAC
-- ============================================================
--
-- Supplier directory reads require suppliers.view.
-- Supplier mutations require suppliers.manage.
--
-- Supplier financial information remains protected separately
-- by finance.view on supplier_invoices / supplier_payments.
-- ============================================================


-- ------------------------------------------------------------
-- 1. REMOVE LEGACY SUPPLIER POLICIES
-- ------------------------------------------------------------

drop policy if exists
  "Users can view suppliers"
on public.suppliers;

drop policy if exists
  "Users can manage suppliers"
on public.suppliers;


-- ------------------------------------------------------------
-- 2. SUPPLIER READ ACCESS
-- ------------------------------------------------------------

create policy
  "Supplier users can view suppliers"
on public.suppliers
for select
to authenticated
using (
  public.has_permission(
    'suppliers.view',
    organization_id,
    null
  )
);


-- ------------------------------------------------------------
-- 3. SUPPLIER CREATE ACCESS
-- ------------------------------------------------------------

create policy
  "Supplier users can create suppliers"
on public.suppliers
for insert
to authenticated
with check (
  public.has_permission(
    'suppliers.manage',
    organization_id,
    null
  )
);


-- ------------------------------------------------------------
-- 4. SUPPLIER UPDATE ACCESS
-- ------------------------------------------------------------

create policy
  "Supplier users can update suppliers"
on public.suppliers
for update
to authenticated
using (
  public.has_permission(
    'suppliers.manage',
    organization_id,
    null
  )
)
with check (
  public.has_permission(
    'suppliers.manage',
    organization_id,
    null
  )
);


-- ------------------------------------------------------------
-- 5. SUPPLIER DELETE ACCESS
-- ------------------------------------------------------------

create policy
  "Supplier users can delete suppliers"
on public.suppliers
for delete
to authenticated
using (
  public.has_permission(
    'suppliers.manage',
    organization_id,
    null
  )
);