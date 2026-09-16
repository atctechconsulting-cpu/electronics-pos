-- ============================================================
-- AlphaPOS
-- Restore complete_sale_return business behaviour while
-- retaining strengthened sales.refund RBAC authorization.
-- ============================================================

create or replace function public.complete_sale_return(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text,
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_sale public.sales%rowtype;
  v_return_id uuid;
  v_return_number text;

  v_item jsonb;
  v_sale_item public.sale_items%rowtype;

  v_quantity integer;
  v_already_returned integer;
  v_remaining_returnable integer;

  v_restock boolean;
  v_line_refund numeric(12, 2);
  v_refund_total numeric(12, 2) := 0;

  v_return_item_id uuid;
  v_stock_movement_id uuid;

  v_serial_id uuid;
  v_serial_ids jsonb;
  v_serial_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'You must be signed in to complete a return.'
      using errcode = 'P0001';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception
      'The selected sale does not exist.'
      using errcode = 'P0001';
  end if;

  if v_sale.status not in ('COMPLETED', 'REFUNDED') then
    raise exception
      'Only completed sales can be returned.'
      using errcode = 'P0001';
  end if;

  -- Security hardening:
  -- replace the former organisation/branch membership checks
  -- with the explicit branch-scoped refund permission.
  if not public.has_permission(
    'sales.refund',
    v_sale.organization_id,
    v_sale.branch_id
  ) then
    raise exception
      'You do not have permission to process returns for this branch.'
      using errcode = 'P0001';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one item must be returned.'
      using errcode = 'P0001';
  end if;

  p_refund_method := upper(trim(p_refund_method));

  if p_refund_method not in (
    'CASH',
    'CARD',
    'BANK_TRANSFER',
    'STORE_CREDIT',
    'NO_REFUND'
  ) then
    raise exception
      'Unsupported refund method.'
      using errcode = 'P0001';
  end if;

  v_return_id := gen_random_uuid();

  v_return_number :=
    'RET-' ||
    to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(
      substr(
        replace(v_return_id::text, '-', ''),
        1,
        6
      )
    );

  insert into public.returns (
    id,
    organization_id,
    branch_id,
    sale_id,
    customer_id,
    return_number,
    status,
    reason,
    notes,
    refund_amount,
    refund_method,
    processed_by,
    completed_at
  )
  values (
    v_return_id,
    v_sale.organization_id,
    v_sale.branch_id,
    v_sale.id,
    v_sale.customer_id,
    v_return_number,
    'COMPLETED',
    nullif(trim(p_reason), ''),
    nullif(trim(p_notes), ''),
    0,
    p_refund_method,
    v_user_id,
    now()
  );

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_quantity :=
        (v_item ->> 'quantity')::integer;

      v_restock :=
        coalesce(
          (v_item ->> 'restock')::boolean,
          true
        );

      v_serial_ids :=
        coalesce(
          v_item -> 'serial_ids',
          '[]'::jsonb
        );
    exception
      when others then
        raise exception
          'A return item contains invalid data.'
          using errcode = 'P0001';
    end;

    if v_quantity <= 0 then
      raise exception
        'Return quantities must be greater than zero.'
        using errcode = 'P0001';
    end if;

    select *
    into v_sale_item
    from public.sale_items
    where id = (v_item ->> 'sale_item_id')::uuid
      and sale_id = v_sale.id
      and organization_id = v_sale.organization_id
      and branch_id = v_sale.branch_id
    for update;

    if not found then
      raise exception
        'A selected sale item does not belong to this sale.'
        using errcode = 'P0001';
    end if;

    select coalesce(sum(quantity), 0)
    into v_already_returned
    from public.return_items
    where sale_item_id = v_sale_item.id;

    v_remaining_returnable :=
      v_sale_item.quantity -
      v_already_returned;

    if v_quantity > v_remaining_returnable then
      raise exception
        'Return quantity exceeds the remaining returnable quantity.'
        using errcode = 'P0001';
    end if;

    v_line_refund :=
      round(
        v_sale_item.unit_price * v_quantity,
        2
      );

    v_refund_total :=
      v_refund_total + v_line_refund;

    insert into public.return_items (
      return_id,
      organization_id,
      branch_id,
      sale_id,
      sale_item_id,
      product_id,
      quantity,
      unit_price,
      line_refund_amount,
      restock
    )
    values (
      v_return_id,
      v_sale.organization_id,
      v_sale.branch_id,
      v_sale.id,
      v_sale_item.id,
      v_sale_item.product_id,
      v_quantity,
      v_sale_item.unit_price,
      v_line_refund,
      v_restock
    )
    returning id
    into v_return_item_id;

    if v_restock then
      update public.inventory
      set
        quantity_on_hand =
          quantity_on_hand + v_quantity,
        updated_at = now()
      where organization_id =
          v_sale.organization_id
        and branch_id =
          v_sale.branch_id
        and product_id =
          v_sale_item.product_id;

      if not found then
        raise exception
          'No inventory record exists for the returned product.'
          using errcode = 'P0001';
      end if;

      insert into public.stock_movements (
        organization_id,
        branch_id,
        product_id,
        movement_type,
        quantity,
        unit_cost,
        reference,
        notes,
        created_by
      )
      values (
        v_sale.organization_id,
        v_sale.branch_id,
        v_sale_item.product_id,
        'RETURN',
        v_quantity,
        v_sale_item.unit_cost,
        v_return_number,
        'Customer return',
        v_user_id
      )
      returning id
      into v_stock_movement_id;
    end if;

    if jsonb_typeof(v_serial_ids) <> 'array' then
      raise exception
        'Serial IDs must be provided as an array.'
        using errcode = 'P0001';
    end if;

    select jsonb_array_length(v_serial_ids)
    into v_serial_count;

    if v_serial_count > 0 then
      if v_serial_count <> v_quantity then
        raise exception
          'The number of selected serial or IMEI records must match the return quantity.'
          using errcode = 'P0001';
      end if;

      for v_serial_id in
        select value::uuid
        from jsonb_array_elements_text(
          v_serial_ids
        )
      loop
        if not exists (
          select 1
          from public.product_serials
          where id = v_serial_id
            and organization_id =
              v_sale.organization_id
            and branch_id =
              v_sale.branch_id
            and sale_id = v_sale.id
            and product_id =
              v_sale_item.product_id
            and status = 'SOLD'
        ) then
          raise exception
            'A selected serial or IMEI record is invalid for this sale.'
            using errcode = 'P0001';
        end if;

        insert into public.return_serials (
          return_item_id,
          product_serial_id
        )
        values (
          v_return_item_id,
          v_serial_id
        );

        if v_restock then
          update public.product_serials
          set
            status = 'IN_STOCK',
            sale_id = null,
            sold_at = null,
            stock_movement_id =
              v_stock_movement_id
          where id = v_serial_id;
        else
          update public.product_serials
          set
            status = 'RETURNED'
          where id = v_serial_id;
        end if;
      end loop;
    end if;
  end loop;

  v_refund_total :=
    round(v_refund_total, 2);

  if p_refund_method = 'NO_REFUND' then
    v_refund_total := 0;
  end if;

  update public.returns
  set
    refund_amount = v_refund_total,
    updated_at = now()
  where id = v_return_id;

  if not exists (
    select 1
    from public.sale_items si
    where si.sale_id = v_sale.id
      and si.quantity >
        coalesce(
          (
            select sum(ri.quantity)
            from public.return_items ri
            where ri.sale_item_id = si.id
          ),
          0
        )
  ) then
    update public.sales
    set
      status = 'REFUNDED',
      updated_at = now()
    where id = v_sale.id;
  end if;

  return jsonb_build_object(
    'return_id',
    v_return_id,
    'return_number',
    v_return_number,
    'sale_id',
    v_sale.id,
    'refund_amount',
    v_refund_total,
    'refund_method',
    p_refund_method,
    'status',
    'COMPLETED'
  );
end;
$$;

revoke all
on function public.complete_sale_return(
  uuid,
  jsonb,
  text,
  text,
  text
)
from public;

grant execute
on function public.complete_sale_return(
  uuid,
  jsonb,
  text,
  text,
  text
)
to authenticated;