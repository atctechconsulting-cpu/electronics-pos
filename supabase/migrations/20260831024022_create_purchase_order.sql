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
    raise exception 'You must be signed in to create a purchase order.';
  end if;

  if p_branch_id is null then
    raise exception 'A branch must be selected.';
  end if;

  if not public.is_branch_member(p_branch_id) then
    raise exception 'You do not have access to this branch.';
  end if;

  select organization_id
  into v_organization_id
  from public.branches
  where id = p_branch_id;

  if not found then
    raise exception 'The selected branch does not exist.';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'You do not belong to this organization.';
  end if;

  if not exists (
    select 1
    from public.suppliers
    where id = p_supplier_id
      and organization_id = v_organization_id
  ) then
    raise exception 'The selected supplier does not belong to this organization.';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product must be added to the purchase order.';
  end if;

  v_status := upper(trim(coalesce(p_status, 'DRAFT')));

  if v_status not in ('DRAFT', 'SUBMITTED', 'ORDERED') then
    raise exception 'A new purchase order must be Draft, Submitted or Ordered.';
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
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_cost_price := (v_item ->> 'cost_price')::numeric;

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
        raise exception 'A purchase order item contains invalid data.';
    end;

    if v_quantity <= 0 then
      raise exception 'Purchase quantities must be greater than zero.';
    end if;

    if v_cost_price < 0 then
      raise exception 'Product cost price cannot be negative.';
    end if;

    if v_tax_rate < 0 or v_tax_rate > 100 then
      raise exception 'Tax rate must be between 0 and 100.';
    end if;

    if v_discount_rate < 0 or v_discount_rate > 100 then
      raise exception 'Discount rate must be between 0 and 100.';
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
        v_base_amount * (v_discount_rate / 100),
        2
      );

    v_taxable_amount :=
      v_base_amount - v_discount_amount;

    v_tax_amount :=
      round(
        v_taxable_amount * (v_tax_rate / 100),
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