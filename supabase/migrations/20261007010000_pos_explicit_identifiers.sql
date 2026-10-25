-- Explicit POS device selection. No historical identifiers or evidence are rewritten.
begin;

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
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_warranty_months integer;
  v_purchase_date date;
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
  v_allocated_serial_ids uuid[];
  v_selected_ids uuid[];
  v_all_serial_ids uuid[] := '{}'::uuid[];
  v_seen_products uuid[] := '{}'::uuid[];
  v_serial record;
  v_expected_product uuid;
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

  -- Match the operational branch trigger lock order before acquiring stock locks.
  perform 1 from public.organizations where id=p_organization_id for key share;
  perform 1 from public.branches where id=p_branch_id
    and organization_id=p_organization_id and is_active for share;
  if not found then raise exception 'The selected branch is invalid or inactive.'; end if;

  /*
   * First pass:
   * Validate products and quantities, lock inventory rows,
   * and calculate authoritative totals from database prices.
   */
  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by (value->>'product_id')::uuid
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'A basket item contains invalid data.';
    end;

    if v_product_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Sale quantities must be greater than zero.';
    end if;

    -- The POS has one line per product. Reject repeated lines rather than
    -- validating each against the same pre-deduction inventory quantity.
    if v_product_id=any(v_seen_products) then
      raise exception 'A product may appear only once in the basket.';
    end if;
    v_seen_products:=array_append(v_seen_products,v_product_id);

    select
      p.retail_price,
      p.is_serialized,
      p.requires_imei,
      p.warranty_months
    into
      v_unit_price,
      v_is_serialized,
      v_requires_imei,
      v_warranty_months
    from public.products p
    where p.id = v_product_id
      and p.organization_id = p_organization_id
      and p.is_active = true
    for share;

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

    v_selected_ids:='{}'::uuid[];
    if v_item ? 'product_serial_ids' then
      if jsonb_typeof(v_item->'product_serial_ids') is distinct from 'array' then
        raise exception 'Selected identifiers must be an array of UUIDs.';
      end if;
      if exists(select 1 from jsonb_array_elements(v_item->'product_serial_ids') entry
        where jsonb_typeof(entry) is distinct from 'string'
          or (entry#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
        raise exception 'Selected identifiers must be an array of UUIDs.';
      end if;
      select coalesce(array_agg(entry::uuid),'{}'::uuid[]) into v_selected_ids
      from jsonb_array_elements_text(v_item->'product_serial_ids') entry;
    end if;
    if v_is_serialized or v_requires_imei then
      if cardinality(v_selected_ids)<>v_quantity then
        raise exception 'Select exactly one identifier for each tracked unit.';
      end if;
    elsif cardinality(v_selected_ids)>0 then
      raise exception 'Ordinary products cannot have selected identifiers.';
    end if;
    v_all_serial_ids:=v_all_serial_ids||v_selected_ids;
    if cardinality(v_all_serial_ids)<>(select count(distinct selected_id) from unnest(v_all_serial_ids) selected_id) then
      raise exception 'Each identifier may be selected only once per sale.';
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

  -- Lock exactly the supplied rows, globally ordered by UUID. Waiting never
  -- substitutes a different device. Recheck current eligibility under the lock.
  v_serial_count:=0;
  for v_serial in
    select ps.*,p.requires_imei,p.is_serialized
    from public.product_serials ps join public.products p on p.id=ps.product_id
    where ps.id=any(v_all_serial_ids)
      and ps.organization_id=p_organization_id and ps.branch_id=p_branch_id
    order by ps.id
    for update of ps
  loop
    select (item->>'product_id')::uuid into v_expected_product
    from jsonb_array_elements(p_items) item
    cross join lateral jsonb_array_elements_text(coalesce(item->'product_serial_ids','[]'::jsonb)) selected_id
    where selected_id::uuid=v_serial.id;
    if v_serial.product_id is distinct from v_expected_product
      or v_serial.status is distinct from 'IN_STOCK'
      or v_serial.sale_id is not null or v_serial.sold_at is not null then
      raise exception 'A selected identifier is unavailable. Refresh the selection; no substitute was sold.';
    end if;
    if v_serial.requires_imei then
      if v_serial.imei is null or v_serial.imei !~ '^[0-9]{15}$' then
        raise exception 'Selected IMEIs must contain exactly 15 digits.';
      end if;
    elsif v_serial.is_serialized and nullif(btrim(v_serial.serial_number),'') is null then
      raise exception 'A selected device has no serial number.';
    end if;
    v_serial_count:=v_serial_count+1;
  end loop;
  if v_serial_count<>cardinality(v_all_serial_ids) then
    raise exception 'A selected identifier is unavailable. Refresh the selection; no substitute was sold.';
  end if;

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

  select (s.completed_at at time zone org.timezone)::date
  into v_purchase_date from public.sales s join public.organizations org on org.id=s.organization_id
  where s.id=v_sale_id;

  /*
   * Second pass:
   * Create sale lines, deduct stock, record movements,
   * and allocate serial/IMEI records.
   */
  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by (value->>'product_id')::uuid
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select
      p.retail_price,
      p.is_serialized,
      p.requires_imei,
      p.warranty_months
    into
      v_unit_price,
      v_is_serialized,
      v_requires_imei,
      v_warranty_months
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
      line_total,
      warranty_months_snapshot,
      purchase_date_snapshot
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
      v_line_total,
      v_warranty_months,
      v_purchase_date
    ) returning id into v_sale_item_id;

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
      select array_agg(entry::uuid) into v_selected_ids
      from jsonb_array_elements_text(v_item->'product_serial_ids') entry;
      with updated_serials as (
        update public.product_serials ps
        set status='SOLD',sale_id=v_sale_id,sold_at=now(),stock_movement_id=v_stock_movement_id
        where ps.id=any(v_selected_ids)
          and ps.organization_id=p_organization_id and ps.branch_id=p_branch_id
          and ps.product_id=v_product_id and ps.status='IN_STOCK'
          and ps.sale_id is null and ps.sold_at is null
        returning ps.id
      )
      select count(*),array_agg(id) into v_serial_count,v_allocated_serial_ids
      from updated_serials;

      if v_serial_count <> v_quantity then
        raise exception
          'Unable to allocate all required serial or IMEI records.';
      end if;

      -- A subsequent statement sees the completed serial update. Capture only
      -- this line's returned IDs, never all serials sharing the product/sale.
      insert into public.sale_item_serials(organization_id,branch_id,sale_id,sale_item_id,product_id,product_serial_id,serial_number_snapshot,imei_snapshot)
      select p_organization_id,p_branch_id,v_sale_id,v_sale_item_id,v_product_id,ps.id,ps.serial_number,ps.imei
      from public.product_serials ps where ps.id=any(v_allocated_serial_ids);
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

revoke all on function public.complete_pos_sale(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_pos_sale(uuid,uuid,jsonb,jsonb,text) to authenticated;

-- Cashier-safe product search: only public POS fields, never cost or raw stock rows.
create function public.search_pos_products(p_organization_id uuid,p_branch_id uuid,p_query text)
returns table(id uuid,name text,sku text,barcode text,retail_price numeric,
  is_serialized boolean,requires_imei boolean,quantity_available integer)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id)
    or not public.is_branch_member(p_branch_id)
    or not public.has_permission('sales.create',p_organization_id,p_branch_id) then
    raise exception 'You do not have permission to create sales.';
  end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id
    and b.organization_id=p_organization_id and b.is_active) then
    raise exception 'The selected branch is invalid or inactive.';
  end if;
  if nullif(btrim(p_query),'') is null then return; end if;
  return query
  select p.id,p.name::text,p.sku::text,p.barcode::text,p.retail_price::numeric,
    p.is_serialized,p.requires_imei,i.quantity_available
  from public.products p join public.inventory i on i.product_id=p.id
    and i.organization_id=p_organization_id and i.branch_id=p_branch_id
  where p.organization_id=p_organization_id and p.is_active and i.quantity_available>0
    and (p.name ilike '%'||btrim(p_query)||'%' or p.sku ilike '%'||btrim(p_query)||'%'
      or p.barcode ilike '%'||btrim(p_query)||'%')
  order by p.name,p.id limit 20;
end;
$$;

-- No inventory.view requirement, cost fields, broad RLS changes or reservations.
create function public.get_pos_identifiers(p_organization_id uuid,p_branch_id uuid,p_product_id uuid)
returns table(id uuid,serial_number text,imei text)
language plpgsql stable security definer set search_path='' as $$
declare v_product public.products%rowtype;
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id)
    or not public.is_branch_member(p_branch_id)
    or not public.has_permission('sales.create',p_organization_id,p_branch_id) then
    raise exception 'You do not have permission to create sales.';
  end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id
    and b.organization_id=p_organization_id and b.is_active) then
    raise exception 'The selected branch is invalid or inactive.';
  end if;
  select * into v_product from public.products p
  where p.id=p_product_id and p.organization_id=p_organization_id and p.is_active;
  if not found then raise exception 'A selected product does not exist or is inactive.'; end if;
  if not (v_product.is_serialized or v_product.requires_imei) then return; end if;
  return query
  select ps.id,case when not v_product.requires_imei then ps.serial_number else null::text end,
    case when v_product.requires_imei then ps.imei else null::text end
  from public.product_serials ps
  where ps.organization_id=p_organization_id and ps.branch_id=p_branch_id
    and ps.product_id=p_product_id and ps.status='IN_STOCK'
    and ps.sale_id is null and ps.sold_at is null
    and ((v_product.requires_imei and ps.imei ~ '^[0-9]{15}$')
      or (not v_product.requires_imei and nullif(btrim(ps.serial_number),'') is not null))
    and exists(select 1 from public.inventory i where i.organization_id=p_organization_id
      and i.branch_id=p_branch_id and i.product_id=p_product_id and i.quantity_available>0)
  order by ps.id;
end;
$$;
revoke all on function public.search_pos_products(uuid,uuid,text),public.get_pos_identifiers(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.search_pos_products(uuid,uuid,text),public.get_pos_identifiers(uuid,uuid,uuid)
  to authenticated;
commit;
