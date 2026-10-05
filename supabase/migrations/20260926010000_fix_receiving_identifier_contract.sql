-- Receiving identifier contract: IMEI devices do not require a second serial.
-- Forward-only replacement; existing rows, RLS, triggers and ACLs are preserved.
begin;

create or replace function public.receive_stock(
  p_organization_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_reference text,
  p_notes text default null,
  p_identifiers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_product public.products%rowtype;

  v_existing_quantity integer;
  v_existing_average_cost numeric(12, 2);

  v_new_quantity integer;
  v_new_average_cost numeric(12, 2);

  v_stock_movement_id uuid;

  v_identifier jsonb;
  v_identifier_count integer;

  v_serial_number text;
  v_imei text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'You must be signed in to receive stock.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Validate workspace authorization.
  -- ----------------------------------------------------------

  if not public.has_permission(
    'inventory.manage',
    p_organization_id,
    p_branch_id
  ) then
    raise exception
      'You do not have permission to manage inventory for this branch.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Validate branch ownership and state.
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.is_active = true
  ) then
    raise exception
      'The selected branch is invalid or inactive.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Validate product ownership.
  -- ----------------------------------------------------------

  select *
  into v_product
  from public.products p
  where p.id = p_product_id
    and p.organization_id = p_organization_id
    and p.is_active = true;

  if not found then
    raise exception
      'The selected product does not belong to this organisation or is inactive.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Validate stock values.
  -- ----------------------------------------------------------

  if p_quantity is null or p_quantity <= 0 then
    raise exception
      'Received quantity must be greater than zero.'
      using errcode = 'P0001';
  end if;

  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception
      'Unit cost cannot be negative.'
      using errcode = 'P0001';
  end if;

  if nullif(trim(p_reference), '') is null then
    raise exception
      'A stock reference is required.'
      using errcode = 'P0001';
  end if;

  if p_identifiers is null then
    p_identifiers := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_identifiers) <> 'array' then
    raise exception
      'Serial and IMEI identifiers must be provided as an array.'
      using errcode = 'P0001';
  end if;

  v_identifier_count := jsonb_array_length(p_identifiers);


  -- ----------------------------------------------------------
  -- Validate tracking requirements.
  -- ----------------------------------------------------------

  if v_product.is_serialized or v_product.requires_imei then
    if v_identifier_count <> p_quantity then
      raise exception
        'The number of serial or IMEI identifiers must match the received quantity.'
        using errcode = 'P0001';
    end if;
  elsif v_identifier_count > 0 then
    raise exception
      'Serial or IMEI identifiers cannot be supplied for an untracked product.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Validate all identifiers BEFORE changing inventory.
  -- ----------------------------------------------------------

  for v_identifier in
    select value
    from jsonb_array_elements(p_identifiers)
  loop
    v_serial_number :=
      nullif(
        trim(v_identifier ->> 'serial_number'),
        ''
      );

    v_imei :=
      nullif(
        trim(v_identifier ->> 'imei'),
        ''
      );

    if v_product.is_serialized
      and not v_product.requires_imei
      and v_serial_number is null then
      raise exception
        'A serial number is required for %.',
        v_product.name
        using errcode = 'P0001';
    end if;

    if v_product.requires_imei
      and v_imei is null then
      raise exception
        'An IMEI is required for %.',
        v_product.name
        using errcode = 'P0001';
    end if;

    if v_imei is not null and v_imei !~ '^[0-9]{15}$' then
      raise exception 'IMEI must contain exactly 15 digits.' using errcode = '23514';
    end if;

    if not v_product.is_serialized
      and not v_product.requires_imei
      and v_serial_number is not null then
      raise exception
        'This product does not use serial-number tracking.'
        using errcode = 'P0001';
    end if;

    if not v_product.requires_imei
      and v_imei is not null then
      raise exception
        'This product does not use IMEI tracking.'
        using errcode = 'P0001';
    end if;

    if v_serial_number is not null
      and exists (
        select 1
        from public.product_serials ps
        where ps.organization_id = p_organization_id
          and ps.serial_number = v_serial_number
      ) then
      raise exception
        'Serial number % already exists.',
        v_serial_number
        using errcode = 'P0001';
    end if;

    if v_imei is not null
      and exists (
        select 1
        from public.product_serials ps
        where ps.organization_id = p_organization_id
          and ps.imei = v_imei
      ) then
      raise exception
        'IMEI % already exists.',
        v_imei
        using errcode = 'P0001';
    end if;
  end loop;


  -- ----------------------------------------------------------
  -- Create the inventory row if it does not exist.
  -- SECURITY DEFINER allows the RPC to perform this write even
  -- though authenticated clients have no direct write policy.
  -- ----------------------------------------------------------

  insert into public.inventory (
    organization_id,
    branch_id,
    product_id,
    quantity_on_hand,
    quantity_reserved,
    average_cost
  )
  values (
    p_organization_id,
    p_branch_id,
    p_product_id,
    0,
    0,
    0
  )
  on conflict (branch_id, product_id)
  do nothing;


  -- ----------------------------------------------------------
  -- Lock inventory before calculating weighted average cost.
  -- ----------------------------------------------------------

  select
    i.quantity_on_hand,
    i.average_cost
  into
    v_existing_quantity,
    v_existing_average_cost
  from public.inventory i
  where i.organization_id = p_organization_id
    and i.branch_id = p_branch_id
    and i.product_id = p_product_id
  for update;

  if not found then
    raise exception
      'Unable to create or locate the inventory record.'
      using errcode = 'P0001';
  end if;


  v_new_quantity :=
    v_existing_quantity + p_quantity;

  v_new_average_cost :=
    round(
      (
        (
          v_existing_quantity *
          v_existing_average_cost
        )
        +
        (
          p_quantity *
          p_unit_cost
        )
      )
      /
      v_new_quantity,
      2
    );


  -- ----------------------------------------------------------
  -- Update inventory.
  -- ----------------------------------------------------------

  update public.inventory
  set
    quantity_on_hand = v_new_quantity,
    average_cost = v_new_average_cost,
    updated_at = now()
  where organization_id = p_organization_id
    and branch_id = p_branch_id
    and product_id = p_product_id;


  -- ----------------------------------------------------------
  -- Create immutable stock movement.
  -- ----------------------------------------------------------

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
    p_organization_id,
    p_branch_id,
    p_product_id,
    'RECEIPT',
    p_quantity,
    round(p_unit_cost, 2),
    trim(p_reference),
    nullif(trim(p_notes), ''),
    v_user_id
  )
  returning id
  into v_stock_movement_id;


  -- ----------------------------------------------------------
  -- Create serial / IMEI records.
  -- ----------------------------------------------------------

  for v_identifier in
    select value
    from jsonb_array_elements(p_identifiers)
  loop
    v_serial_number :=
      nullif(
        trim(v_identifier ->> 'serial_number'),
        ''
      );

    v_imei :=
      nullif(
        trim(v_identifier ->> 'imei'),
        ''
      );

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
      p_organization_id,
      p_product_id,
      p_branch_id,
      v_serial_number,
      v_imei,
      'IN_STOCK',
      v_stock_movement_id
    );
  end loop;


  return jsonb_build_object(
    'organization_id',
    p_organization_id,

    'branch_id',
    p_branch_id,

    'product_id',
    p_product_id,

    'quantity_received',
    p_quantity,

    'quantity_on_hand',
    v_new_quantity,

    'average_cost',
    v_new_average_cost,

    'stock_movement_id',
    v_stock_movement_id
  );
end;
$$;

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
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'You must be signed in to receive goods.';
  end if;

  select *
  into v_purchase_order
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if not found then
    raise exception
      'Purchase order not found.';
  end if;

  if not public.has_permission(
    'purchases.manage',
    v_purchase_order.organization_id,
    v_purchase_order.branch_id
  ) then
    raise exception
      'You do not have permission to receive purchasing goods for this branch.';
  end if;

  if v_purchase_order.status not in (
    'ORDERED',
    'PARTIALLY_RECEIVED'
  ) then
    raise exception
      'Only ordered purchase orders can receive goods.';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one product must be received.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

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
        and purchase_order_id =
          p_purchase_order_id
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

    begin
      v_quantity :=
        (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception
          'A received quantity is invalid.';
    end;

    if v_quantity is null
      or v_quantity <= 0 then
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

    update public.inventory
    set
      quantity_on_hand =
        v_new_quantity,
      average_cost =
        v_new_average_cost,
      updated_at = now()
    where branch_id =
      v_purchase_order.branch_id
      and product_id =
        v_product.id;

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

        if v_product.is_serialized
          and not v_product.requires_imei
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

        if v_imei is not null and v_imei !~ '^[0-9]{15}$' then
          raise exception 'IMEI must contain exactly 15 digits.' using errcode = '23514';
        end if;

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

-- CREATE OR REPLACE retains existing function privileges. No new grants.
commit;
