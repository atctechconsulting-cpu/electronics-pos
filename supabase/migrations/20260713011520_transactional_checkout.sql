-- Add sale tracking fields to serialized/IMEI inventory.
alter table public.product_serials
add column if not exists sale_id uuid
references public.sales(id)
on delete set null;

alter table public.product_serials
add column if not exists sold_at timestamptz;

create index if not exists product_serials_sale_id_idx
on public.product_serials (sale_id);

create index if not exists product_serials_available_idx
on public.product_serials (
  organization_id,
  branch_id,
  product_id,
  status
);

create or replace function public.complete_pos_sale(
  p_organization_id uuid,
  p_branch_id uuid,
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
  v_user_id uuid;
  v_sale_id uuid;
  v_receipt_number text;

  v_item jsonb;
  v_payment jsonb;

  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12, 2);
  v_unit_cost numeric(12, 2);

  v_is_serialized boolean;
  v_requires_imei boolean;

  v_quantity_on_hand integer;
  v_quantity_reserved integer;

  v_line_total numeric(12, 2);
  v_line_vat numeric(12, 2);

  v_subtotal numeric(12, 2) := 0;
  v_vat_total numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_payment_total numeric(12, 2) := 0;

  v_payment_method text;
  v_payment_amount numeric(12, 2);
  v_payment_reference text;

  v_stock_movement_id uuid;
  v_serial_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in to complete a sale.';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'You do not belong to this organization.';
  end if;

  if not public.is_branch_member(p_branch_id) then
    raise exception 'You do not have access to this branch.';
  end if;

  if not public.has_permission(
    'sales.create',
    p_organization_id,
    p_branch_id
  ) then
    raise exception 'You do not have permission to create sales.';
  end if;

  if not exists (
    select 1
    from public.branches
    where id = p_branch_id
      and organization_id = p_organization_id
      and is_active = true
  ) then
    raise exception 'The selected branch is invalid or inactive.';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'The basket cannot be empty.';
  end if;

  if p_payments is null
    or jsonb_typeof(p_payments) <> 'array'
    or jsonb_array_length(p_payments) = 0 then
    raise exception 'At least one payment is required.';
  end if;

  /*
   * First pass:
   * Validate products and quantities, lock inventory rows,
   * and calculate authoritative totals from database prices.
   */
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'A basket item contains invalid data.';
    end;

    if v_quantity <= 0 then
      raise exception 'Sale quantities must be greater than zero.';
    end if;

    select
      p.retail_price,
      p.is_serialized,
      p.requires_imei
    into
      v_unit_price,
      v_is_serialized,
      v_requires_imei
    from public.products p
    where p.id = v_product_id
      and p.organization_id = p_organization_id
      and p.is_active = true;

    if not found then
      raise exception 'A selected product does not exist or is inactive.';
    end if;

    select
      i.quantity_on_hand,
      i.quantity_reserved,
      i.average_cost
    into
      v_quantity_on_hand,
      v_quantity_reserved,
      v_unit_cost
    from public.inventory i
    where i.organization_id = p_organization_id
      and i.branch_id = p_branch_id
      and i.product_id = v_product_id
    for update;

    if not found then
      raise exception 'A selected product has no inventory record.';
    end if;

    if (v_quantity_on_hand - v_quantity_reserved) < v_quantity then
      raise exception
        'Insufficient stock for product %. Available: %, requested: %.',
        v_product_id,
        (v_quantity_on_hand - v_quantity_reserved),
        v_quantity;
    end if;

    if v_is_serialized or v_requires_imei then
      select count(*)
      into v_serial_count
      from public.product_serials ps
      where ps.organization_id = p_organization_id
        and ps.branch_id = p_branch_id
        and ps.product_id = v_product_id
        and ps.status = 'IN_STOCK';

      if v_serial_count < v_quantity then
        raise exception
          'Insufficient available serial or IMEI records for product %.',
          v_product_id;
      end if;
    end if;

    v_line_total := round(v_unit_price * v_quantity, 2);

    -- V1 assumes retail prices include UK VAT at 20%.
    v_line_vat := round(
      v_line_total - (v_line_total / 1.20),
      2
    );

    v_total := v_total + v_line_total;
    v_vat_total := v_vat_total + v_line_vat;
  end loop;

  v_total := round(v_total, 2);
  v_vat_total := round(v_vat_total, 2);
  v_subtotal := round(v_total - v_vat_total, 2);

  /*
   * Validate payment data before creating the sale.
   */
  for v_payment in
    select value
    from jsonb_array_elements(p_payments)
  loop
    v_payment_method := upper(
      trim(v_payment ->> 'payment_method')
    );

    begin
      v_payment_amount :=
        round((v_payment ->> 'amount')::numeric, 2);
    exception
      when others then
        raise exception 'A payment contains an invalid amount.';
    end;

    if v_payment_method not in (
      'CASH',
      'CARD',
      'BANK_TRANSFER',
      'STORE_CREDIT',
      'GIFT_CARD'
    ) then
      raise exception
        'Unsupported payment method: %.',
        v_payment_method;
    end if;

    if v_payment_amount <= 0 then
      raise exception 'Payment amounts must be greater than zero.';
    end if;

    v_payment_total := v_payment_total + v_payment_amount;
  end loop;

  v_payment_total := round(v_payment_total, 2);

  if abs(v_payment_total - v_total) > 0.01 then
    raise exception
      'Payment total (%) does not match sale total (%).',
      v_payment_total,
      v_total;
  end if;

  v_sale_id := gen_random_uuid();

  v_receipt_number :=
    'SAL-' ||
    to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(
      substr(
        replace(v_sale_id::text, '-', ''),
        1,
        6
      )
    );

  insert into public.sales (
    id,
    organization_id,
    branch_id,
    cashier_id,
    receipt_number,
    status,
    subtotal,
    vat_amount,
    discount_amount,
    total_amount,
    notes,
    completed_at
  )
  values (
    v_sale_id,
    p_organization_id,
    p_branch_id,
    v_user_id,
    v_receipt_number,
    'COMPLETED',
    v_subtotal,
    v_vat_total,
    0,
    v_total,
    nullif(trim(p_notes), ''),
    now()
  );

  /*
   * Second pass:
   * Create sale lines, deduct stock, record movements,
   * and allocate serial/IMEI records.
   */
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select
      p.retail_price,
      p.is_serialized,
      p.requires_imei
    into
      v_unit_price,
      v_is_serialized,
      v_requires_imei
    from public.products p
    where p.id = v_product_id
      and p.organization_id = p_organization_id
      and p.is_active = true;

    select i.average_cost
    into v_unit_cost
    from public.inventory i
    where i.organization_id = p_organization_id
      and i.branch_id = p_branch_id
      and i.product_id = v_product_id;

    v_line_total := round(v_unit_price * v_quantity, 2);

    v_line_vat := round(
      v_line_total - (v_line_total / 1.20),
      2
    );

    insert into public.sale_items (
      sale_id,
      organization_id,
      branch_id,
      product_id,
      quantity,
      unit_price,
      unit_cost,
      discount_amount,
      vat_amount,
      line_total
    )
    values (
      v_sale_id,
      p_organization_id,
      p_branch_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_unit_cost,
      0,
      v_line_vat,
      v_line_total
    );

    update public.inventory
    set
      quantity_on_hand = quantity_on_hand - v_quantity,
      updated_at = now()
    where organization_id = p_organization_id
      and branch_id = p_branch_id
      and product_id = v_product_id;

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
      v_product_id,
      'SALE',
      -v_quantity,
      v_unit_cost,
      v_receipt_number,
      'POS sale',
      v_user_id
    )
    returning id into v_stock_movement_id;

    if v_is_serialized or v_requires_imei then
      with selected_serials as (
        select ps.id
        from public.product_serials ps
        where ps.organization_id = p_organization_id
          and ps.branch_id = p_branch_id
          and ps.product_id = v_product_id
          and ps.status = 'IN_STOCK'
        order by ps.created_at, ps.id
        for update skip locked
        limit v_quantity
      ),
      updated_serials as (
        update public.product_serials ps
        set
          status = 'SOLD',
          sale_id = v_sale_id,
          sold_at = now(),
          stock_movement_id = v_stock_movement_id
        from selected_serials selected
        where ps.id = selected.id
        returning ps.id
      )
      select count(*)
      into v_serial_count
      from updated_serials;

      if v_serial_count <> v_quantity then
        raise exception
          'Unable to allocate all required serial or IMEI records.';
      end if;
    end if;
  end loop;

  /*
   * Save one or more payment records.
   */
  for v_payment in
    select value
    from jsonb_array_elements(p_payments)
  loop
    v_payment_method := upper(
      trim(v_payment ->> 'payment_method')
    );

    v_payment_amount :=
      round((v_payment ->> 'amount')::numeric, 2);

    v_payment_reference :=
      nullif(trim(v_payment ->> 'reference'), '');

    insert into public.payments (
      sale_id,
      organization_id,
      branch_id,
      payment_method,
      amount,
      reference,
      received_by
    )
    values (
      v_sale_id,
      p_organization_id,
      p_branch_id,
      v_payment_method,
      v_payment_amount,
      v_payment_reference,
      v_user_id
    );
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'subtotal', v_subtotal,
    'vat_amount', v_vat_total,
    'total_amount', v_total,
    'status', 'COMPLETED'
  );
end;
$$;

revoke all
on function public.complete_pos_sale(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text
)
from public;

grant execute
on function public.complete_pos_sale(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text
)
to authenticated;