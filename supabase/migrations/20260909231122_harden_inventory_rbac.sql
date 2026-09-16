-- ============================================================
-- AlphaPOS Inventory RBAC Hardening
--
-- Inventory, stock movements and serial/IMEI records are
-- branch-scoped operational data.
--
-- Reads require inventory.view.
--
-- Direct browser writes to stock tables are intentionally not
-- permitted. Stock mutations happen through protected
-- transactional business RPCs such as:
--
--   receive_stock
--   complete_pos_sale
--   complete_sale_return
--   receive_purchase_order_goods
--
-- SECURITY DEFINER RPCs perform their own authorization.
-- ============================================================


-- ============================================================
-- INVENTORY RLS
-- ============================================================

alter table public.inventory
enable row level security;

drop policy if exists
  "Inventory users can view inventory"
on public.inventory;

drop policy if exists
  "Organization members can view inventory"
on public.inventory;

drop policy if exists
  "Branch members can view inventory"
on public.inventory;

drop policy if exists
  "Organization members can manage inventory"
on public.inventory;

drop policy if exists
  "Branch members can manage inventory"
on public.inventory;


create policy "Inventory users can view inventory"
on public.inventory
for select
to authenticated
using (
  public.has_permission(
    'inventory.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- STOCK MOVEMENTS RLS
-- ============================================================

alter table public.stock_movements
enable row level security;

drop policy if exists
  "Inventory users can view stock movements"
on public.stock_movements;

drop policy if exists
  "Organization members can view stock movements"
on public.stock_movements;

drop policy if exists
  "Branch members can view stock movements"
on public.stock_movements;

drop policy if exists
  "Organization members can manage stock movements"
on public.stock_movements;

drop policy if exists
  "Branch members can manage stock movements"
on public.stock_movements;


create policy "Inventory users can view stock movements"
on public.stock_movements
for select
to authenticated
using (
  public.has_permission(
    'inventory.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- PRODUCT SERIAL / IMEI RLS
-- ============================================================

alter table public.product_serials
enable row level security;

drop policy if exists
  "Inventory users can view product serials"
on public.product_serials;

drop policy if exists
  "Organization members can view product serials"
on public.product_serials;

drop policy if exists
  "Branch members can view product serials"
on public.product_serials;

drop policy if exists
  "Organization members can manage product serials"
on public.product_serials;

drop policy if exists
  "Branch members can manage product serials"
on public.product_serials;


create policy "Inventory users can view product serials"
on public.product_serials
for select
to authenticated
using (
  public.has_permission(
    'inventory.view',
    organization_id,
    branch_id
  )
);


-- ============================================================
-- TRANSACTIONAL MANUAL STOCK RECEIVING
-- ============================================================

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

    if not v_product.is_serialized
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


revoke all
on function public.receive_stock(
  uuid,
  uuid,
  uuid,
  integer,
  numeric,
  text,
  text,
  jsonb
)
from public;

grant execute
on function public.receive_stock(
  uuid,
  uuid,
  uuid,
  integer,
  numeric,
  text,
  text,
  jsonb
)
to authenticated;