/*
 * AlphaPOS
 * Customer RBAC hardening
 *
 * Customers are organisation-level shared records.
 *
 * A user may access the customer directory when they hold the appropriate
 * customer permission through either an organisation-scoped role or a
 * branch-scoped role within that organisation.
 *
 * Sales and returns remain branch-scoped separately.
 */

drop policy if exists
  "Organization members can view customers"
on public.customers;

drop policy if exists
  "Organization members can create customers"
on public.customers;

drop policy if exists
  "Organization members can update customers"
on public.customers;

drop policy if exists
  "Customers can be viewed with permission"
on public.customers;

drop policy if exists
  "Customers can be created with permission"
on public.customers;

drop policy if exists
  "Customers can be updated with permission"
on public.customers;

drop policy if exists
  "Customers can be deleted with permission"
on public.customers;


/*
 * SELECT
 */

create policy
  "Customers can be viewed with permission"
on public.customers
for select
to authenticated
using (
  public.has_organization_permission_any_scope(
    'customers.view',
    organization_id
  )
);


/*
 * INSERT
 *
 * created_by must always be the authenticated user.
 */

create policy
  "Customers can be created with permission"
on public.customers
for insert
to authenticated
with check (
  public.has_organization_permission_any_scope(
    'customers.manage',
    organization_id
  )
  and created_by = auth.uid()
);


/*
 * UPDATE
 */

create policy
  "Customers can be updated with permission"
on public.customers
for update
to authenticated
using (
  public.has_organization_permission_any_scope(
    'customers.manage',
    organization_id
  )
)
with check (
  public.has_organization_permission_any_scope(
    'customers.manage',
    organization_id
  )
);


/*
 * DELETE
 *
 * AlphaPOS currently deactivates customers rather than deleting them,
 * but the policy is defined explicitly for future administrative use.
 */

create policy
  "Customers can be deleted with permission"
on public.customers
for delete
to authenticated
using (
  public.has_organization_permission_any_scope(
    'customers.manage',
    organization_id
  )
);


/*
 * Customer code generation
 *
 * SECURITY DEFINER means this function bypasses normal table RLS.
 * It must therefore perform its own permission check.
 */

create or replace function public.generate_customer_code(
  p_organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_number bigint;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.'
      using errcode = 'P0001';
  end if;

  if not public.has_organization_permission_any_scope(
    'customers.manage',
    p_organization_id
  ) then
    raise exception 'You do not have permission to create customers.'
      using errcode = 'P0001';
  end if;

  select coalesce(
    max(
      nullif(
        regexp_replace(customer_code, '[^0-9]', '', 'g'),
        ''
      )::bigint
    ),
    0
  ) + 1
  into v_next_number
  from public.customers
  where organization_id = p_organization_id;

  return 'CUS-' || lpad(v_next_number::text, 6, '0');
end;
$$;

revoke all
on function public.generate_customer_code(uuid)
from public;

grant execute
on function public.generate_customer_code(uuid)
to authenticated;