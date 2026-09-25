-- Future-sale evidence only. Historical NULL values are deliberately not backfilled.
begin;
alter table public.sale_items add column warranty_months_snapshot integer check(warranty_months_snapshot>=0),
  add column purchase_date_snapshot date;
create table public.sale_item_serials (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,
 sale_id uuid not null references public.sales(id) on delete restrict,
 sale_item_id uuid not null references public.sale_items(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete restrict,
 product_serial_id uuid not null references public.product_serials(id) on delete restrict,
 serial_number_snapshot text, imei_snapshot text, allocated_at timestamptz not null default now(),
 unique(sale_id,product_serial_id)
);
create index sale_item_serials_history_idx on public.sale_item_serials(organization_id,product_serial_id,allocated_at);
alter table public.sale_item_serials enable row level security;
create policy allocation_read on public.sale_item_serials for select to authenticated
 using(public.has_permission('sales.view',organization_id,branch_id));
revoke all on public.sale_item_serials from public,anon,authenticated,service_role;
grant select on public.sale_item_serials to authenticated;
create function public.warranty_immutable_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Historical evidence is immutable'; end; $$;
create trigger allocation_immutable before update or delete on public.sale_item_serials
 for each row execute function public.warranty_immutable_history();
create function public.warranty_sale_snapshot_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.warranty_months_snapshot is distinct from OLD.warranty_months_snapshot
 or NEW.purchase_date_snapshot is distinct from OLD.purchase_date_snapshot then
 raise exception 'Sale-time warranty terms are immutable'; end if;
 return NEW;
end; $$;
create trigger sale_warranty_snapshot_immutable before update on public.sale_items
 for each row execute function public.warranty_sale_snapshot_guard();
create function public.warranty_allocation_validate() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.sale_items i join public.sales s on s.id=i.sale_id
 join public.product_serials ps on ps.id=NEW.product_serial_id
 where i.id=NEW.sale_item_id and i.sale_id=NEW.sale_id and i.organization_id=NEW.organization_id
 and i.branch_id=NEW.branch_id and i.product_id=NEW.product_id
 and s.organization_id=NEW.organization_id and s.branch_id=NEW.branch_id
 and ps.organization_id=NEW.organization_id and ps.product_id=NEW.product_id
 and ps.branch_id=NEW.branch_id and ps.sale_id=NEW.sale_id and ps.status='SOLD'
 and ps.serial_number is not distinct from NEW.serial_number_snapshot
 and ps.imei is not distinct from NEW.imei_snapshot) then raise exception 'Invalid sale allocation'; end if;
 return NEW;
end; $$;
create trigger allocation_validate before insert on public.sale_item_serials
 for each row execute function public.warranty_allocation_validate();
revoke all on function public.warranty_immutable_history(),public.warranty_sale_snapshot_guard(),public.warranty_allocation_validate()
 from public,anon,authenticated,service_role;
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
        returning ps.id,ps.serial_number,ps.imei
      )
      select count(*),array_agg(id)
      into v_serial_count,v_allocated_serial_ids
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
commit;
