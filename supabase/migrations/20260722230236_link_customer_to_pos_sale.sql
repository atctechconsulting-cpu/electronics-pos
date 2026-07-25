create or replace function public.complete_pos_sale_with_customer(
  p_organization_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_sale_id uuid;
begin
  if p_customer_id is not null then
    if not exists (
      select 1
      from public.customers
      where id = p_customer_id
        and organization_id = p_organization_id
        and is_active = true
    ) then
      raise exception
        'The selected customer does not exist or is inactive.';
    end if;
  end if;

  v_result := public.complete_pos_sale(
    p_organization_id,
    p_branch_id,
    p_items,
    p_payments,
    p_notes
  );

  v_sale_id := (v_result ->> 'sale_id')::uuid;

  update public.sales
  set
    customer_id = p_customer_id,
    updated_at = now()
  where id = v_sale_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id;

  return v_result || jsonb_build_object(
    'customer_id',
    p_customer_id
  );
end;
$$;

revoke all
on function public.complete_pos_sale_with_customer(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text
)
from public;

grant execute
on function public.complete_pos_sale_with_customer(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text
)
to authenticated;