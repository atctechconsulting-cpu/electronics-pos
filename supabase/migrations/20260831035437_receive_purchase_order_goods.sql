create or replace function public.receive_purchase_order_goods(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_purchase_order public.purchase_orders%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_product public.products%rowtype;

  v_item jsonb;
  v_identifier jsonb;

  v_quantity integer;
  v_remaining_quantity numeric(12, 2);

  v_serial_number text;
  v_imei text;

  v_identifier_count integer;

  v_existing_quantity integer;
  v_existing_average_cost numeric(12, 2);
  v_new_quantity integer;
  v_new_average_cost numeric(12, 2);

  v_stock_movement_id uuid;

  v_total_ordered numeric(12, 2);
  v_total_received numeric(12, 2);

  v_new_status text;

  v_received_line_count integer := 0;
  v_received_unit_count integer := 0;
begin
  ------------------------------------------------------------
  -- Authentication
  ------------------------------------------------------------

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'You must be signed in to receive goods.';
  end if;

  ------------------------------------------------------------
  -- Validate purchase order
  ------------------------------------------------------------

  select *
  into v_purchase_order
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if not found then
    raise exception
      'Purchase order not found.';
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

  if v_purchase_order.status not in (
    'ORDERED',
    'PARTIALLY_RECEIVED'
  ) then
    raise exception
      'Only ordered purchase orders can receive goods.';
  end if;

  ------------------------------------------------------------
  -- Validate incoming items
  ------------------------------------------------------------

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one product must be received.';
  end if;

  ------------------------------------------------------------
  -- Process each received PO line
  ------------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    ----------------------------------------------------------
    -- Validate PO item ID
    ----------------------------------------------------------

    if nullif(
      trim(v_item ->> 'purchase_order_item_id'),
      ''
    ) is null then
      raise exception
        'A purchase order item ID is required.';
    end if;

    begin
      select *
      into v_po_item
      from public.purchase_order_items
      where id =
        (v_item ->> 'purchase_order_item_id')::uuid
        and purchase_order_id = p_purchase_order_id
      for update;
    exception
      when invalid_text_representation then
        raise exception
          'A purchase order item ID is invalid.';
    end;

    if not found then
      raise exception
        'A selected product does not belong to this purchase order.';
    end if;

    ----------------------------------------------------------
    -- Validate received quantity
    ----------------------------------------------------------

    begin
      v_quantity :=
        (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception
          'A received quantity is invalid.';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception
        'Received quantity must be greater than zero.';
    end if;

    v_remaining_quantity :=
      v_po_item.quantity -
      v_po_item.received_quantity;

    if v_quantity > v_remaining_quantity then
      raise exception
        'Received quantity exceeds the remaining quantity for this product.';
    end if;

    ----------------------------------------------------------
    -- Get product
    ----------------------------------------------------------

    select *
    into v_product
    from public.products
    where id = v_po_item.product_id
      and organization_id =
        v_purchase_order.organization_id;

    if not found then
      raise exception
        'Product not found.';
    end if;

    ----------------------------------------------------------
    -- Validate serial / IMEI identifiers
    ----------------------------------------------------------

    if v_product.is_serialized
      or v_product.requires_imei then

      if not (v_item ? 'identifiers')
        or jsonb_typeof(
          v_item -> 'identifiers'
        ) <> 'array' then
        raise exception
          'Serial or IMEI details are required for tracked products.';
      end if;

      v_identifier_count :=
        jsonb_array_length(
          v_item -> 'identifiers'
        );

      if v_identifier_count <> v_quantity then
        raise exception
          'The number of serial or IMEI entries must match the received quantity.';
      end if;

    end if;

    ----------------------------------------------------------
    -- Lock/create inventory row
    ----------------------------------------------------------

    insert into public.inventory (
      organization_id,
      branch_id,
      product_id,
      quantity_on_hand,
      quantity_reserved,
      average_cost
    )
    values (
      v_purchase_order.organization_id,
      v_purchase_order.branch_id,
      v_product.id,
      0,
      0,
      0
    )
    on conflict (branch_id, product_id)
    do nothing;

    select
      quantity_on_hand,
      average_cost
    into
      v_existing_quantity,
      v_existing_average_cost
    from public.inventory
    where branch_id =
      v_purchase_order.branch_id
      and product_id = v_product.id
    for update;

    ----------------------------------------------------------
    -- Calculate weighted average cost
    ----------------------------------------------------------

    v_new_quantity :=
      v_existing_quantity + v_quantity;

    if v_new_quantity > 0 then
      v_new_average_cost :=
        round(
          (
            (
              v_existing_quantity *
              v_existing_average_cost
            )
            +
            (
              v_quantity *
              v_po_item.cost_price
            )
          )
          /
          v_new_quantity,
          2
        );
    else
      v_new_average_cost :=
        v_po_item.cost_price;
    end if;

    ----------------------------------------------------------
    -- Update inventory
    ----------------------------------------------------------

    update public.inventory
    set
      quantity_on_hand = v_new_quantity,
      average_cost = v_new_average_cost,
      updated_at = now()
    where branch_id =
      v_purchase_order.branch_id
      and product_id = v_product.id;

    ----------------------------------------------------------
    -- Create stock movement
    ----------------------------------------------------------

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
      v_purchase_order.organization_id,
      v_purchase_order.branch_id,
      v_product.id,
      'PURCHASE_RECEIPT',
      v_quantity,
      v_po_item.cost_price,
      v_purchase_order.po_number,
      coalesce(
        nullif(trim(p_notes), ''),
        'Goods received against purchase order ' ||
        v_purchase_order.po_number
      ),
      v_user_id
    )
    returning id
    into v_stock_movement_id;

    ----------------------------------------------------------
    -- Store serial / IMEI records
    ----------------------------------------------------------

    if v_product.is_serialized
      or v_product.requires_imei then

      for v_identifier in
        select value
        from jsonb_array_elements(
          v_item -> 'identifiers'
        )
      loop

        v_serial_number :=
          nullif(
            trim(
              v_identifier ->> 'serial_number'
            ),
            ''
          );

        v_imei :=
          nullif(
            trim(
              v_identifier ->> 'imei'
            ),
            ''
          );

        ----------------------------------------------
        -- Required identifier validation
        ----------------------------------------------

        if v_product.is_serialized
          and v_serial_number is null then
          raise exception
            'A serial number is required for %.',
            v_product.name;
        end if;

        if v_product.requires_imei
          and v_imei is null then
          raise exception
            'An IMEI is required for %.',
            v_product.name;
        end if;

        ----------------------------------------------
        -- Duplicate serial validation
        ----------------------------------------------

        if v_serial_number is not null
          and exists (
            select 1
            from public.product_serials
            where organization_id =
              v_purchase_order.organization_id
              and serial_number =
                v_serial_number
          ) then
          raise exception
            'Serial number % already exists.',
            v_serial_number;
        end if;

        ----------------------------------------------
        -- Duplicate IMEI validation
        ----------------------------------------------

        if v_imei is not null
          and exists (
            select 1
            from public.product_serials
            where organization_id =
              v_purchase_order.organization_id
              and imei = v_imei
          ) then
          raise exception
            'IMEI % already exists.',
            v_imei;
        end if;

        ----------------------------------------------
        -- Insert tracked unit
        ----------------------------------------------

        insert into public.product_serials (
          organization_id,
          product_id,
          branch_id,
          serial_number,
          imei,
          status,
          stock_movement_id
        )
        values (
          v_purchase_order.organization_id,
          v_product.id,
          v_purchase_order.branch_id,
          v_serial_number,
          v_imei,
          'IN_STOCK',
          v_stock_movement_id
        );

      end loop;

    end if;

    ----------------------------------------------------------
    -- Update PO item received quantity
    ----------------------------------------------------------

    update public.purchase_order_items
    set
      received_quantity =
        received_quantity + v_quantity
    where id = v_po_item.id;

    v_received_line_count :=
      v_received_line_count + 1;

    v_received_unit_count :=
      v_received_unit_count + v_quantity;

  end loop;

  ------------------------------------------------------------
  -- Determine overall PO receiving status
  ------------------------------------------------------------

  select
    coalesce(sum(quantity), 0),
    coalesce(sum(received_quantity), 0)
  into
    v_total_ordered,
    v_total_received
  from public.purchase_order_items
  where purchase_order_id =
    p_purchase_order_id;

  if v_total_received >= v_total_ordered then
    v_new_status := 'RECEIVED';
  else
    v_new_status := 'PARTIALLY_RECEIVED';
  end if;

  ------------------------------------------------------------
  -- Update PO
  ------------------------------------------------------------

  update public.purchase_orders
  set
    status = v_new_status,
    received_at =
      case
        when v_new_status = 'RECEIVED'
          then now()
        else received_at
      end,
    updated_at = now()
  where id = p_purchase_order_id;

  ------------------------------------------------------------
  -- Return result
  ------------------------------------------------------------

  return jsonb_build_object(
    'purchase_order_id',
    p_purchase_order_id,

    'po_number',
    v_purchase_order.po_number,

    'status',
    v_new_status,

    'received_lines',
    v_received_line_count,

    'received_units',
    v_received_unit_count,

    'total_ordered',
    v_total_ordered,

    'total_received',
    v_total_received
  );
end;
$$;

revoke all
on function public.receive_purchase_order_goods(
  uuid,
  jsonb,
  text
)
from public;

grant execute
on function public.receive_purchase_order_goods(
  uuid,
  jsonb,
  text
)
to authenticated;