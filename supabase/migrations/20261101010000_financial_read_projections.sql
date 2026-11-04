-- Financial read boundary. Coordinate application cutover before production use.
-- No historical values, RLS policies or transaction calculations are changed.
begin;

-- Remove table AND pre-existing column SELECT grants; table REVOKE alone is insufficient.
revoke select on public.products from public, anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname), ',') into cols from pg_attribute
  where attrelid='public.products'::regclass and attnum>0 and not attisdropped;
  execute format('revoke select (%s) on public.products from public, anon, authenticated', cols);
end $$;
grant select (id,organization_id,category_id,brand_id,supplier_id,name,sku,barcode,description,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured,created_at,updated_at) on public.products to authenticated;

-- Remove table AND pre-existing column SELECT grants; table REVOKE alone is insufficient.
revoke select on public.inventory from public, anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname), ',') into cols from pg_attribute
  where attrelid='public.inventory'::regclass and attnum>0 and not attisdropped;
  execute format('revoke select (%s) on public.inventory from public, anon, authenticated', cols);
end $$;
grant select (id,organization_id,branch_id,product_id,quantity_on_hand,quantity_reserved,quantity_available,created_at,updated_at) on public.inventory to authenticated;

-- Remove table AND pre-existing column SELECT grants; table REVOKE alone is insufficient.
revoke select on public.stock_movements from public, anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname), ',') into cols from pg_attribute
  where attrelid='public.stock_movements'::regclass and attnum>0 and not attisdropped;
  execute format('revoke select (%s) on public.stock_movements from public, anon, authenticated', cols);
end $$;
grant select (id,organization_id,branch_id,product_id,movement_type,quantity,reference,notes,created_by,created_at) on public.stock_movements to authenticated;

-- Remove table AND pre-existing column SELECT grants; table REVOKE alone is insufficient.
revoke select on public.sale_items from public, anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname), ',') into cols from pg_attribute
  where attrelid='public.sale_items'::regclass and attnum>0 and not attisdropped;
  execute format('revoke select (%s) on public.sale_items from public, anon, authenticated', cols);
end $$;
grant select (id,sale_id,organization_id,branch_id,product_id,quantity,unit_price,discount_amount,vat_amount,line_total,created_at,warranty_months_snapshot,purchase_date_snapshot) on public.sale_items to authenticated;

-- Narrow cost projections. Empty rows mean no cost-read authority; clients must
-- represent missing costs as unavailable, never zero. RLS-equivalent operational
-- checks are repeated because this definer reads columns denied to the caller.
create function public.get_cost_projection(
  p_organization_id uuid, p_branch_id uuid, p_kind text, p_ids uuid[]
) returns table(id uuid, cost numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id=p_branch_id and b.organization_id=p_organization_id
  ) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_kind = 'purchase_products' then
    if p_branch_id is null or not (
      public.has_permission('purchases.view',p_organization_id,p_branch_id)
      or public.has_permission('purchases.manage',p_organization_id,p_branch_id)
    ) then raise exception 'Purchasing access denied' using errcode='42501'; end if;
    return query select p.id,p.cost_price from public.products p
      where p.organization_id=p_organization_id and p.id=any(p_ids);
  elsif p_kind = 'products' then
    -- Shared product catalogue: branch finance rights are not organisation-wide.
    if not public.has_permission('finance.view',p_organization_id,null) then return; end if;
    return query select p.id,p.cost_price from public.products p
      where p.organization_id=p_organization_id and p.id=any(p_ids);
  elsif p_kind in ('inventory','stock_movements','sale_items') then
    if p_branch_id is null then raise exception 'Branch required' using errcode='22023'; end if;
    if not public.has_permission('finance.view',p_organization_id,p_branch_id) then return; end if;
    if p_kind='inventory' and public.has_permission('inventory.view',p_organization_id,p_branch_id) then
      return query select i.id,i.average_cost from public.inventory i where i.organization_id=p_organization_id and i.branch_id=p_branch_id and i.id=any(p_ids);
    elsif p_kind='stock_movements' and public.has_permission('inventory.view',p_organization_id,p_branch_id) then
      return query select m.id,m.unit_cost from public.stock_movements m where m.organization_id=p_organization_id and m.branch_id=p_branch_id and m.id=any(p_ids);
    elsif p_kind='sale_items' and public.has_permission('sales.view',p_organization_id,p_branch_id) then
      return query select s.id,s.unit_cost from public.sale_items s where s.organization_id=p_organization_id and s.branch_id=p_branch_id and s.id=any(p_ids);
    end if;
  else raise exception 'Unknown projection' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.get_cost_projection(uuid,uuid,text,uuid[]) from public, anon, service_role;
grant execute on function public.get_cost_projection(uuid,uuid,text,uuid[]) to authenticated;

-- Preserve receiving calculations and authorization; redact only the response.
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
    case when public.has_permission('finance.view', p_organization_id, p_branch_id)
      then v_new_average_cost else null end,

    'stock_movement_id',
    v_stock_movement_id
  );
end;
$$;

-- Fail closed if inherited privileges defeat the intended column boundary.
do $$ declare r text; t text; c text; begin
  foreach r in array array['anon','authenticated'] loop
    for t,c in select * from (values ('products','cost_price'),('inventory','average_cost'),('stock_movements','unit_cost'),('sale_items','unit_cost')) v(t,c) loop
      if has_column_privilege(r,'public.'||t,c,'SELECT') then
        raise exception 'Unexpected financial SELECT privilege for % on %',r,t;
      end if;
    end loop;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
