create or replace function public.prevent_invalid_serial_tracking_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stock_quantity integer;
begin
  /*
   * Only check when serial/IMEI tracking is being enabled.
   */
  if (
    (
      new.is_serialized = true
      and coalesce(old.is_serialized, false) = false
    )
    or
    (
      new.requires_imei = true
      and coalesce(old.requires_imei, false) = false
    )
  ) then
    select coalesce(sum(quantity_on_hand), 0)
    into v_stock_quantity
    from public.inventory
    where product_id = new.id
      and organization_id = new.organization_id;

    if v_stock_quantity > 0 then
      raise exception
        'This product already has stock. You cannot enable IMEI or serial tracking until inventory reaches zero.';
    end if;
  end if;

  /*
   * IMEI-tracked products are also serialized by definition.
   */
  if new.requires_imei = true then
    new.is_serialized := true;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_invalid_serial_tracking_change
on public.products;

create trigger prevent_invalid_serial_tracking_change
before update of is_serialized, requires_imei
on public.products
for each row
execute function public.prevent_invalid_serial_tracking_change();