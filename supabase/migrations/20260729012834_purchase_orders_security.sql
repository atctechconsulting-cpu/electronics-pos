alter table public.purchase_orders
  enable row level security;

alter table public.purchase_order_items
  enable row level security;

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (
    status in (
      'DRAFT',
      'SUBMITTED',
      'ORDERED',
      'PARTIALLY_RECEIVED',
      'RECEIVED',
      'CANCELLED'
    )
  );

alter table public.purchase_orders
  add constraint purchase_orders_amounts_check
  check (
    subtotal >= 0
    and tax_amount >= 0
    and discount_amount >= 0
    and total_amount >= 0
  );

alter table public.purchase_order_items
  add constraint purchase_order_items_quantity_check
  check (quantity > 0);

alter table public.purchase_order_items
  add constraint purchase_order_items_received_quantity_check
  check (
    received_quantity >= 0
    and received_quantity <= quantity
  );

alter table public.purchase_order_items
  add constraint purchase_order_items_cost_price_check
  check (cost_price >= 0);

alter table public.purchase_order_items
  add constraint purchase_order_items_tax_rate_check
  check (tax_rate >= 0 and tax_rate <= 100);

alter table public.purchase_order_items
  add constraint purchase_order_items_discount_rate_check
  check (discount_rate >= 0 and discount_rate <= 100);

alter table public.purchase_order_items
  add constraint purchase_order_items_line_total_check
  check (line_total >= 0);

create or replace function public.set_purchase_order_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_purchase_order_updated_at
on public.purchase_orders;

create trigger set_purchase_order_updated_at
before update
on public.purchase_orders
for each row
execute function public.set_purchase_order_updated_at();

create policy "Organization members can view purchase orders"
on public.purchase_orders
for select
to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy "Organization members can create purchase orders"
on public.purchase_orders
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
  and created_by = auth.uid()
);

create policy "Organization members can update purchase orders"
on public.purchase_orders
for update
to authenticated
using (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
)
with check (
  public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy "Organization members can delete draft purchase orders"
on public.purchase_orders
for delete
to authenticated
using (
  status = 'DRAFT'
  and public.is_org_member(organization_id)
  and public.is_branch_member(branch_id)
);

create policy "Organization members can view purchase order items"
on public.purchase_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and public.is_org_member(po.organization_id)
      and public.is_branch_member(po.branch_id)
  )
);

create policy "Organization members can create purchase order items"
on public.purchase_order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.is_org_member(po.organization_id)
      and public.is_branch_member(po.branch_id)
  )
);

create policy "Organization members can update purchase order items"
on public.purchase_order_items
for update
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.is_org_member(po.organization_id)
      and public.is_branch_member(po.branch_id)
  )
)
with check (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.is_org_member(po.organization_id)
      and public.is_branch_member(po.branch_id)
  )
);

create policy "Organization members can delete purchase order items"
on public.purchase_order_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_items.purchase_order_id
      and po.status = 'DRAFT'
      and public.is_org_member(po.organization_id)
      and public.is_branch_member(po.branch_id)
  )
);

grant select, insert, update, delete
on public.purchase_orders
to authenticated;

grant select, insert, update, delete
on public.purchase_order_items
to authenticated;