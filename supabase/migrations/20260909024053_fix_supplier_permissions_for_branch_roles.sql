/*
 * AlphaPOS
 * Supplier permissions for organisation-level shared supplier records.
 *
 * Suppliers belong to an organisation rather than an individual branch.
 *
 * A user may access the organisation's supplier master when they hold the
 * required permission either:
 *
 *   1. through an organisation-scoped role, or
 *   2. through a branch-scoped role within that organisation.
 *
 * Financial supplier information remains protected separately by
 * finance.view on supplier invoices/payments.
 */

create or replace function public.has_organization_permission_any_scope(
  target_permission_key text,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_permission(
      target_permission_key,
      target_organization_id,
      null
    )
    or exists (
      select 1
      from public.branches b
      where b.organization_id = target_organization_id
        and public.has_permission(
          target_permission_key,
          target_organization_id,
          b.id
        )
    );
$$;

revoke all on function public.has_organization_permission_any_scope(
  text,
  uuid
) from public;

grant execute on function public.has_organization_permission_any_scope(
  text,
  uuid
) to authenticated;


/*
 * Replace supplier policies.
 */

drop policy if exists "Users can view suppliers"
on public.suppliers;

drop policy if exists "Users can manage suppliers"
on public.suppliers;

drop policy if exists "Suppliers can be viewed with permission"
on public.suppliers;

drop policy if exists "Suppliers can be inserted with permission"
on public.suppliers;

drop policy if exists "Suppliers can be updated with permission"
on public.suppliers;

drop policy if exists "Suppliers can be deleted with permission"
on public.suppliers;


/*
 * SELECT
 */

create policy "Suppliers can be viewed with permission"
on public.suppliers
for select
to authenticated
using (
  public.has_organization_permission_any_scope(
    'suppliers.view',
    organization_id
  )
);


/*
 * INSERT
 */

create policy "Suppliers can be inserted with permission"
on public.suppliers
for insert
to authenticated
with check (
  public.has_organization_permission_any_scope(
    'suppliers.manage',
    organization_id
  )
);


/*
 * UPDATE
 */

create policy "Suppliers can be updated with permission"
on public.suppliers
for update
to authenticated
using (
  public.has_organization_permission_any_scope(
    'suppliers.manage',
    organization_id
  )
)
with check (
  public.has_organization_permission_any_scope(
    'suppliers.manage',
    organization_id
  )
);


/*
 * DELETE
 */

create policy "Suppliers can be deleted with permission"
on public.suppliers
for delete
to authenticated
using (
  public.has_organization_permission_any_scope(
    'suppliers.manage',
    organization_id
  )
);