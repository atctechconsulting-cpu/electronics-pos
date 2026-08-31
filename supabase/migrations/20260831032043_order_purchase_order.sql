create or replace function public.order_purchase_order(
  p_purchase_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_purchase_order public.purchase_orders%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into v_purchase_order
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order not found.';
  end if;

  if not public.is_org_member(
    v_purchase_order.organization_id
  ) then
    raise exception
      'You do not have access to this organization.';
  end if;

  if not public.is_branch_member(
    v_purchase_order.branch_id
  ) then
    raise exception
      'You do not have access to this branch.';
  end if;

  if v_purchase_order.status <> 'DRAFT' then
    raise exception
      'Only draft purchase orders can be ordered.';
  end if;

  if not exists (
    select 1
    from public.purchase_order_items
    where purchase_order_id = p_purchase_order_id
  ) then
    raise exception
      'The purchase order does not contain any products.';
  end if;

  update public.purchase_orders
  set
    status = 'ORDERED',
    ordered_at = now(),
    updated_at = now()
  where id = p_purchase_order_id;

  return jsonb_build_object(
    'purchase_order_id',
    p_purchase_order_id,
    'po_number',
    v_purchase_order.po_number,
    'status',
    'ORDERED',
    'ordered_at',
    now()
  );
end;
$$;

revoke all
on function public.order_purchase_order(uuid)
from public;

grant execute
on function public.order_purchase_order(uuid)
to authenticated;