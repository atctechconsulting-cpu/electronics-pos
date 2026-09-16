-- ============================================================
-- AlphaPOS Sales & Returns RBAC Hardening
--
-- Sales are branch-scoped operational records.
--   READ   -> sales.view
--   CREATE -> sales.create through complete_pos_sale()
--
-- Returns are branch-scoped refund records.
--   READ/PROCESS -> sales.refund
--
-- Direct browser writes to transactional child tables are
-- intentionally not permitted.
-- ============================================================


-- ============================================================
-- SALES
-- ============================================================

alter table public.sales enable row level security;

drop policy if exists
  "Users can view sales for accessible branches"
on public.sales;

drop policy if exists
  "Users with sales permission can create sales"
on public.sales;

drop policy if exists
  "Sales users can view sales"
on public.sales;

create policy "Sales users can view sales"
on public.sales
for select
to authenticated
using (
  public.has_permission(
    'sales.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- SALE ITEMS
-- ============================================================

alter table public.sale_items enable row level security;

drop policy if exists
  "Users can view sale items for accessible branches"
on public.sale_items;

drop policy if exists
  "Users with sales permission can create sale items"
on public.sale_items;

drop policy if exists
  "Sales users can view sale items"
on public.sale_items;

create policy "Sales users can view sale items"
on public.sale_items
for select
to authenticated
using (
  public.has_permission(
    'sales.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- PAYMENTS
-- ============================================================

alter table public.payments enable row level security;

drop policy if exists
  "Users can view payments for accessible branches"
on public.payments;

drop policy if exists
  "Users with sales permission can create payments"
on public.payments;

drop policy if exists
  "Sales users can view payments"
on public.payments;

create policy "Sales users can view payments"
on public.payments
for select
to authenticated
using (
  public.has_permission(
    'sales.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- RETURNS
-- ============================================================

alter table public.returns enable row level security;

drop policy if exists
  "Users can view returns for accessible branches"
on public.returns;

drop policy if exists
  "Users can create returns for accessible branches"
on public.returns;

drop policy if exists
  "Refund users can view returns"
on public.returns;

create policy "Refund users can view returns"
on public.returns
for select
to authenticated
using (
  public.has_permission(
    'sales.refund',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- RETURN ITEMS
-- ============================================================

alter table public.return_items enable row level security;

drop policy if exists
  "Users can view return items for accessible branches"
on public.return_items;

drop policy if exists
  "Users can create return items for accessible branches"
on public.return_items;

drop policy if exists
  "Refund users can view return items"
on public.return_items;

create policy "Refund users can view return items"
on public.return_items
for select
to authenticated
using (
  public.has_permission(
    'sales.refund',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- RETURN SERIALS
-- ============================================================

alter table public.return_serials enable row level security;

drop policy if exists
  "Users can view return serials"
on public.return_serials;

drop policy if exists
  "Users can create return serials"
on public.return_serials;

drop policy if exists
  "Refund users can view return serials"
on public.return_serials;

create policy "Refund users can view return serials"
on public.return_serials
for select
to authenticated
using (
  exists (
    select 1
    from public.return_items ri
    where ri.id = return_item_id
      and public.has_permission(
        'sales.refund',
        ri.organization_id,
        ri.branch_id
      )
  )
);


-- ============================================================
-- COMPLETE SALE RETURN
--
-- Preserve the existing transactional function body while
-- strengthening its authorization boundary.
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

  v_return_item_id uuid;

  v_quantity integer;
  v_restock boolean;

  v_serial_id_text text;
  v_serial_id uuid;

  v_line_refund numeric(12, 2);
  v_refund_amount numeric(12, 2) := 0;

  v_already_returned integer;

  v_expected_serial_count integer;
  v_selected_serial_count integer;

  v_serial public.product_serials%rowtype;

  v_new_inventory_quantity integer;

  v_refund_method text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'You must be signed in to process a return.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Lock and load original sale.
  -- ----------------------------------------------------------

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception
      'Sale not found.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- RBAC authorization.
  -- ----------------------------------------------------------

  if not public.has_permission(
    'sales.refund',
    v_sale.organization_id,
    v_sale.branch_id
  ) then
    raise exception
      'You do not have permission to process returns for this branch.'
      using errcode = 'P0001';
  end if;


  if v_sale.status not in ('COMPLETED', 'REFUNDED') then
    raise exception
      'Only completed sales can be returned.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Validate return request.
  -- ----------------------------------------------------------

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception
      'Select at least one item to return.'
      using errcode = 'P0001';
  end if;


  v_refund_method := upper(trim(coalesce(p_refund_method, '')));

  if v_refund_method not in (
    'CASH',
    'CARD',
    'BANK_TRANSFER',
    'STORE_CREDIT',
    'NO_REFUND'
  ) then
    raise exception
      'Invalid refund method.'
      using errcode = 'P0001';
  end if;


  -- ----------------------------------------------------------
  -- Generate return number.
  -- ----------------------------------------------------------

  v_return_number :=
    'RET-' ||
    to_char(now(), 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));


  insert into public.returns (
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
    v_sale.organization_id,
    v_sale.branch_id,
    v_sale.id,
    v_sale.customer_id,
    v_return_number,
    'COMPLETED',
    nullif(trim(p_reason), ''),
    nullif(trim(p_notes), ''),
    0,
    v_refund_method,
    v_user_id,
    now()
  )
  returning id
  into v_return_id;


  -- ----------------------------------------------------------
  -- Process returned items.
  -- ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    if nullif(v_item ->> 'sale_item_id', '') is null then
      raise exception
        'A sale item is required for every returned item.'
        using errcode = 'P0001';
    end if;

    v_quantity :=
      coalesce((v_item ->> 'quantity')::integer, 0);

    v_restock :=
      coalesce((v_item ->> 'restock')::boolean, true);

    if v_quantity <= 0 then
      raise exception
        'Return quantity must be greater than zero.'
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
        'A selected item does not belong to this sale.'
        using errcode = 'P0001';
    end if;


    select coalesce(sum(ri.quantity), 0)::integer
    into v_already_returned
    from public.return_items ri
    join public.returns r
      on r.id = ri.return_id
    where ri.sale_item_id = v_sale_item.id
      and r.status = 'COMPLETED';

    if v_already_returned + v_quantity > v_sale_item.quantity then
      raise exception
        'Return quantity exceeds the quantity available for return.'
        using errcode = 'P0001';
    end if;


    v_line_refund :=
      round(
        (
          v_sale_item.line_total /
          v_sale_item.quantity
        ) * v_quantity,
        2
      );

    v_refund_amount :=
      v_refund_amount + v_line_refund;


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


    -- --------------------------------------------------------
    -- Serial / IMEI handling.
    -- --------------------------------------------------------

    select count(*)::integer
    into v_expected_serial_count
    from public.product_serials ps
    where ps.sale_id = v_sale.id
      and ps.product_id = v_sale_item.product_id;

    if v_expected_serial_count > 0 then
      if v_item -> 'serial_ids' is null
        or jsonb_typeof(v_item -> 'serial_ids') <> 'array' then
        raise exception
          'Select the serial or IMEI records being returned.'
          using errcode = 'P0001';
      end if;

      v_selected_serial_count :=
        jsonb_array_length(v_item -> 'serial_ids');

      if v_selected_serial_count <> v_quantity then
        raise exception
          'The number of selected serial or IMEI records must match the return quantity.'
          using errcode = 'P0001';
      end if;


      for v_serial_id_text in
        select value
        from jsonb_array_elements_text(v_item -> 'serial_ids')
      loop
        v_serial_id := v_serial_id_text::uuid;

        select *
        into v_serial
        from public.product_serials
        where id = v_serial_id
          and organization_id = v_sale.organization_id
          and branch_id = v_sale.branch_id
          and product_id = v_sale_item.product_id
          and sale_id = v_sale.id
        for update;

        if not found then
          raise exception
            'A selected serial or IMEI does not belong to this sale.'
            using errcode = 'P0001';
        end if;

        if v_serial.status <> 'SOLD' then
          raise exception
            'Serial or IMEI % is not eligible for return.',
            coalesce(v_serial.imei, v_serial.serial_number, v_serial.id::text)
            using errcode = 'P0001';
        end if;


        insert into public.return_serials (
          return_item_id,
          product_serial_id
        )
        values (
          v_return_item_id,
          v_serial.id
        );


        update public.product_serials
        set
          status = case
            when v_restock then 'IN_STOCK'
            else 'RETURNED'
          end,
          sale_id = case
            when v_restock then null
            else sale_id
          end
        where id = v_serial.id;
      end loop;
    end if;


    -- --------------------------------------------------------
    -- Restock inventory when requested.
    -- --------------------------------------------------------

    if v_restock then
      update public.inventory
      set
        quantity_on_hand = quantity_on_hand + v_quantity,
        updated_at = now()
      where organization_id = v_sale.organization_id
        and branch_id = v_sale.branch_id
        and product_id = v_sale_item.product_id
      returning quantity_on_hand
      into v_new_inventory_quantity;

      if not found then
        raise exception
          'Inventory record not found for returned product.'
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
      );
    end if;
  end loop;


  -- ----------------------------------------------------------
  -- Finalize refund amount.
  -- ----------------------------------------------------------

  update public.returns
  set
    refund_amount = v_refund_amount,
    updated_at = now()
  where id = v_return_id;


  -- ----------------------------------------------------------
  -- Mark sale fully refunded when all quantities are returned.
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.sale_items si
    where si.sale_id = v_sale.id
      and (
        select coalesce(sum(ri.quantity), 0)
        from public.return_items ri
        join public.returns r
          on r.id = ri.return_id
        where ri.sale_item_id = si.id
          and r.status = 'COMPLETED'
      ) < si.quantity
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
    v_refund_amount,
    'refund_method',
    v_refund_method,
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