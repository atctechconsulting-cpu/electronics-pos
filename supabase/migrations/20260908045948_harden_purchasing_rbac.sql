-- ============================================================
-- Harden Purchasing RBAC
--
-- Purchasing reads require purchases.view.
-- Purchasing mutations require purchases.manage.
--
-- This replaces membership-only authorization with the
-- centralized AlphaPOS permission model.
-- ============================================================


-- ============================================================
-- PURCHASE ORDERS RLS
-- ============================================================

drop policy if exists
  "Organization members can view purchase orders"
on public.purchase_orders;

drop policy if exists
  "Organization members can create purchase orders"
on public.purchase_orders;

drop policy if exists
  "Organization members can update purchase orders"
on public.purchase_orders;

drop policy if exists
  "Organization members can delete draft purchase orders"
on public.purchase_orders;


create policy "Purchasing users can view purchase orders"
on public.purchase_orders
for select
to authenticated
using (
  public.has_permission(
    'purchases.view',
    organization_id,
    branch_id
  )
);


create policy "Purchasing users can create purchase orders"
on public.purchase_orders
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.has_permission(
    'purchases.manage',
    organization_id,
    branch_id
  )
);


create policy "Purchasing users can update purchase orders"
on public.purchase_orders
for update
to authenticated
using (
  public.has_permission(
    'purchases.manage',
    organization_id,
    branch_id
  )
)
with check (
  public.has_permission(
    'purchases.manage',
    organization_id,
    branch_id
  )
);


create policy "Purchasing users can delete draft purchase orders"
on public.purchase_orders
for delete
to authenticated
using (
  status = 'DRAFT'
  and public.has_permission(
    'purchases.manage',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- PURCHASE ORDER ITEMS RLS
-- ============================================================

drop policy if exists
  "Organization members can view purchase order items"
on public.purchase_order_items;

drop policy if exists
  "Organization members can create purchase order items"
on public.purchase_order_items;

drop policy if exists
  "Organization members can update purchase order items"
on public.purchase_order_items;

drop policy if exists
  "Organization members can delete purchase order items"
on public.purchase_order_items;


create policy "Purchasing users can view purchase order items"
on public.purchase_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and public.has_permission(
        'purchases.view',
        po.organization_id,
        po.branch_id
      )
  )
);


create policy "Purchasing users can create purchase order items"
on public.purchase_order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.has_permission(
        'purchases.manage',
        po.organization_id,
        po.branch_id
      )
  )
);


create policy "Purchasing users can update purchase order items"
on public.purchase_order_items
for update
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.has_permission(
        'purchases.manage',
        po.organization_id,
        po.branch_id
      )
  )
)
with check (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.has_permission(
        'purchases.manage',
        po.organization_id,
        po.branch_id
      )
  )
);


create policy "Purchasing users can delete purchase order items"
on public.purchase_order_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.has_permission(
        'purchases.manage',
        po.organization_id,
        po.branch_id
      )
  )
);


-- ============================================================
-- CREATE PURCHASE ORDER
-- ============================================================

create or replace function public.create_purchase_order(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_expected_delivery_date date default null,
  p_notes text default null,
  p_status text default 'DRAFT'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;

  v_purchase_order_id uuid;
  v_po_number text;

  v_status text;

  v_item jsonb;
  v_product public.products%rowtype;

  v_quantity numeric(12, 2);
  v_cost_price numeric(12, 2);
  v_tax_rate numeric(5, 2);
  v_discount_rate numeric(5, 2);

  v_base_amount numeric(12, 2);
  v_discount_amount numeric(12, 2);
  v_taxable_amount numeric(12, 2);
  v_tax_amount numeric(12, 2);
  v_line_total numeric(12, 2);

  v_subtotal numeric(12, 2) := 0;
  v_total_tax numeric(12, 2) := 0;
  v_total_discount numeric(12, 2) := 0;
  v_total_amount numeric(12, 2) := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'You must be signed in to create a purchase order.';
  end if;

  if p_branch_id is null then
    raise exception
      'A branch must be selected.';
  end if;

  select organization_id
  into v_organization_id
  from public.branches
  where id = p_branch_id;

  if not found then
    raise exception
      'The selected branch does not exist.';
  end if;

  if not public.has_permission(
    'purchases.manage',
    v_organization_id,
    p_branch_id
  ) then
    raise exception
      'You do not have permission to manage purchasing for this branch.';
  end if;

  if not exists (
    select 1
    from public.suppliers
    where id = p_supplier_id
      and organization_id = v_organization_id
  ) then
    raise exception
      'The selected supplier does not belong to this organization.';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one product must be added to the purchase order.';
  end if;

  v_status := upper(trim(coalesce(p_status, 'DRAFT')));

  if v_status not in (
    'DRAFT',
    'SUBMITTED',
    'ORDERED'
  ) then
    raise exception
      'A new purchase order must be Draft, Submitted or Ordered.';
  end if;

  v_purchase_order_id := gen_random_uuid();

  v_po_number :=
    'PO-' ||
    to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(
      substr(
        replace(v_purchase_order_id::text, '-', ''),
        1,
        6
      )
    );

  insert into public.purchase_orders (
    id,
    organization_id,
    branch_id,
    supplier_id,
    po_number,
    status,
    expected_delivery_date,
    ordered_at,
    subtotal,
    tax_amount,
    discount_amount,
    total_amount,
    notes,
    created_by
  )
  values (
    v_purchase_order_id,
    v_organization_id,
    p_branch_id,
    p_supplier_id,
    v_po_number,
    v_status,
    p_expected_delivery_date,
    case
      when v_status = 'ORDERED' then now()
      else null
    end,
    0,
    0,
    0,
    0,
    nullif(trim(p_notes), ''),
    v_user_id
  );

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_quantity :=
        (v_item ->> 'quantity')::numeric;

      v_cost_price :=
        (v_item ->> 'cost_price')::numeric;

      v_tax_rate :=
        coalesce(
          nullif(v_item ->> 'tax_rate', '')::numeric,
          0
        );

      v_discount_rate :=
        coalesce(
          nullif(v_item ->> 'discount_rate', '')::numeric,
          0
        );
    exception
      when others then
        raise exception
          'A purchase order item contains invalid data.';
    end;

    if v_quantity <= 0 then
      raise exception
        'Purchase quantities must be greater than zero.';
    end if;

    if v_cost_price < 0 then
      raise exception
        'Product cost price cannot be negative.';
    end if;

    if v_tax_rate < 0 or v_tax_rate > 100 then
      raise exception
        'Tax rate must be between 0 and 100.';
    end if;

    if v_discount_rate < 0
      or v_discount_rate > 100 then
      raise exception
        'Discount rate must be between 0 and 100.';
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and organization_id = v_organization_id;

    if not found then
      raise exception
        'A selected product does not belong to this organization.';
    end if;

    v_base_amount :=
      round(v_quantity * v_cost_price, 2);

    v_discount_amount :=
      round(
        v_base_amount *
        (v_discount_rate / 100),
        2
      );

    v_taxable_amount :=
      v_base_amount - v_discount_amount;

    v_tax_amount :=
      round(
        v_taxable_amount *
        (v_tax_rate / 100),
        2
      );

    v_line_total :=
      round(
        v_taxable_amount + v_tax_amount,
        2
      );

    insert into public.purchase_order_items (
      purchase_order_id,
      product_id,
      quantity,
      received_quantity,
      cost_price,
      tax_rate,
      discount_rate,
      line_total
    )
    values (
      v_purchase_order_id,
      v_product.id,
      v_quantity,
      0,
      v_cost_price,
      v_tax_rate,
      v_discount_rate,
      v_line_total
    );

    v_subtotal :=
      v_subtotal + v_base_amount;

    v_total_discount :=
      v_total_discount + v_discount_amount;

    v_total_tax :=
      v_total_tax + v_tax_amount;

    v_total_amount :=
      v_total_amount + v_line_total;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_total_discount := round(v_total_discount, 2);
  v_total_tax := round(v_total_tax, 2);
  v_total_amount := round(v_total_amount, 2);

  update public.purchase_orders
  set
    subtotal = v_subtotal,
    discount_amount = v_total_discount,
    tax_amount = v_total_tax,
    total_amount = v_total_amount,
    updated_at = now()
  where id = v_purchase_order_id;

  return jsonb_build_object(
    'purchase_order_id', v_purchase_order_id,
    'po_number', v_po_number,
    'organization_id', v_organization_id,
    'branch_id', p_branch_id,
    'supplier_id', p_supplier_id,
    'status', v_status,
    'subtotal', v_subtotal,
    'discount_amount', v_total_discount,
    'tax_amount', v_total_tax,
    'total_amount', v_total_amount
  );
end;
$$;


-- ============================================================
-- ORDER PURCHASE ORDER
-- ============================================================

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
    raise exception
      'You must be signed in.';
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
      'You do not have permission to manage purchasing for this branch.';
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


-- ============================================================
-- RECEIVE PURCHASE ORDER GOODS
-- ============================================================

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


-- ============================================================
-- FUNCTION EXECUTION PERMISSIONS
-- ============================================================

revoke all
on function public.create_purchase_order(
  uuid,
  uuid,
  jsonb,
  date,
  text,
  text
)
from public;

grant execute
on function public.create_purchase_order(
  uuid,
  uuid,
  jsonb,
  date,
  text,
  text
)
to authenticated;


revoke all
on function public.order_purchase_order(uuid)
from public;

grant execute
on function public.order_purchase_order(uuid)
to authenticated;


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