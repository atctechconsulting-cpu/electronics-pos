create or replace function public.protect_product_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_has_inventory boolean;
    v_has_movements boolean;
    v_has_sales boolean;
begin

    select exists(
        select 1
        from public.inventory
        where product_id = old.id
          and quantity_on_hand > 0
    )
    into v_has_inventory;

    select exists(
        select 1
        from public.stock_movements
        where product_id = old.id
    )
    into v_has_movements;

    select exists(
        select 1
        from public.sale_items
        where product_id = old.id
    )
    into v_has_sales;

    if v_has_inventory
       or v_has_movements
       or v_has_sales then

        if new.sku <> old.sku then
            raise exception
            'SKU cannot be changed after inventory activity exists.';
        end if;

        if new.is_serialized <> old.is_serialized then
            raise exception
            'Serialized setting cannot be changed after inventory activity exists.';
        end if;

        if new.requires_imei <> old.requires_imei then
            raise exception
            'IMEI tracking cannot be changed after inventory activity exists.';
        end if;

    end if;

    return new;

end;
$$;

drop trigger if exists protect_product_identity
on public.products;

create trigger protect_product_identity
before update
on public.products
for each row
execute function public.protect_product_identity();