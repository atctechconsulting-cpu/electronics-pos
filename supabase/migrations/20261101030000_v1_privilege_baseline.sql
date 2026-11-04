-- Explicit V1 privilege baseline; existing row policies and business RPCs remain authoritative.
begin;
revoke all on public.branches from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.branches from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.branches'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.branches from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.branches from service_role',cols);
end $$;
revoke all on public.brands from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.brands from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.brands'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.brands from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.brands from service_role',cols);
end $$;
revoke all on public.categories from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.categories from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.categories'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.categories from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.categories from service_role',cols);
end $$;
revoke all on public.customers from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.customers from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.customers'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.customers from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.customers from service_role',cols);
end $$;
revoke all on public.inventory from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.inventory from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.inventory'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.inventory from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.inventory from service_role',cols);
end $$;
revoke all on public.organization_settings from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.organization_settings from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.organization_settings'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.organization_settings from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.organization_settings from service_role',cols);
end $$;
revoke all on public.organizations from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.organizations from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.organizations'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.organizations from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.organizations from service_role',cols);
end $$;
revoke all on public.payments from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.payments from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.payments'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.payments from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.payments from service_role',cols);
end $$;
revoke all on public.permissions from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.permissions from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.permissions'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.permissions from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.permissions from service_role',cols);
end $$;
revoke all on public.product_serials from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.product_serials from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.product_serials'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.product_serials from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.product_serials from service_role',cols);
end $$;
revoke all on public.products from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.products from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.products'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.products from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.products from service_role',cols);
end $$;
revoke all on public.profiles from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.profiles from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.profiles from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.profiles from service_role',cols);
end $$;
revoke all on public.purchase_order_items from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.purchase_order_items from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.purchase_order_items'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.purchase_order_items from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.purchase_order_items from service_role',cols);
end $$;
revoke all on public.purchase_orders from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.purchase_orders from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.purchase_orders'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.purchase_orders from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.purchase_orders from service_role',cols);
end $$;
revoke all on public.repair_job_events from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.repair_job_events from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.repair_job_events'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.repair_job_events from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.repair_job_events from service_role',cols);
end $$;
revoke all on public.repair_jobs from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.repair_jobs from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.repair_jobs'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.repair_jobs from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.repair_jobs from service_role',cols);
end $$;
revoke all on public.repair_payments from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.repair_payments from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.repair_payments'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.repair_payments from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.repair_payments from service_role',cols);
end $$;
revoke all on public.return_items from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.return_items from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.return_items'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.return_items from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.return_items from service_role',cols);
end $$;
revoke all on public.return_serials from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.return_serials from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.return_serials'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.return_serials from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.return_serials from service_role',cols);
end $$;
revoke all on public.returns from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.returns from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.returns'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.returns from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.returns from service_role',cols);
end $$;
revoke all on public.role_permissions from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.role_permissions from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.role_permissions'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.role_permissions from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.role_permissions from service_role',cols);
end $$;
revoke all on public.roles from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.roles from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.roles'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.roles from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.roles from service_role',cols);
end $$;
revoke all on public.sale_item_serials from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.sale_item_serials from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.sale_item_serials'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.sale_item_serials from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.sale_item_serials from service_role',cols);
end $$;
revoke all on public.sale_items from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.sale_items from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.sale_items'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.sale_items from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.sale_items from service_role',cols);
end $$;
revoke all on public.sales from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.sales from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.sales'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.sales from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.sales from service_role',cols);
end $$;
revoke all on public.staff_invitation_resends from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.staff_invitation_resends from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.staff_invitation_resends'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.staff_invitation_resends from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.staff_invitation_resends from service_role',cols);
end $$;
revoke all on public.stock_movements from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.stock_movements from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.stock_movements'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.stock_movements from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.stock_movements from service_role',cols);
end $$;
revoke all on public.supplier_invoices from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.supplier_invoices from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.supplier_invoices'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.supplier_invoices from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.supplier_invoices from service_role',cols);
end $$;
revoke all on public.supplier_payments from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.supplier_payments from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.supplier_payments'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.supplier_payments from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.supplier_payments from service_role',cols);
end $$;
revoke all on public.suppliers from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.suppliers from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.suppliers'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.suppliers from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.suppliers from service_role',cols);
end $$;
revoke all on public.user_branches from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.user_branches from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.user_branches'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.user_branches from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.user_branches from service_role',cols);
end $$;
revoke all on public.user_organizations from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.user_organizations from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.user_organizations'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.user_organizations from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.user_organizations from service_role',cols);
end $$;
revoke all on public.user_roles from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.user_roles from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.user_roles'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.user_roles from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.user_roles from service_role',cols);
end $$;
revoke all on public.warranty_claim_events from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.warranty_claim_events from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.warranty_claim_events'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.warranty_claim_events from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.warranty_claim_events from service_role',cols);
end $$;
revoke all on public.warranty_claims from public,anon,authenticated,service_role;
revoke truncate,references,trigger,maintain on public.warranty_claims from service_role;
do $$ declare cols text; begin
select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.warranty_claims'::regclass and attnum>0 and not attisdropped;
execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on public.warranty_claims from public,anon,authenticated,service_role',cols);
execute format('revoke references (%s) on public.warranty_claims from service_role',cols);
end $$;
grant select on public.branches to authenticated;
grant select on public.brands to authenticated;
grant select on public.categories to authenticated;
grant select on public.customers to authenticated;
grant select on public.organizations to authenticated;
grant select on public.payments to authenticated;
grant select on public.permissions to authenticated;
grant select on public.product_serials to authenticated;
grant select on public.profiles to authenticated;
grant select on public.return_items to authenticated;
grant select on public.return_serials to authenticated;
grant select on public.returns to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.roles to authenticated;
grant select on public.sale_item_serials to authenticated;
grant select on public.sales to authenticated;
grant select on public.supplier_invoices to authenticated;
grant select on public.supplier_payments to authenticated;
grant select on public.suppliers to authenticated;
grant select on public.user_branches to authenticated;
grant select on public.user_organizations to authenticated;
grant select on public.user_roles to authenticated;
grant select (id,organization_id,category_id,brand_id,supplier_id,name,sku,barcode,description,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured,created_at,updated_at) on public.products to authenticated;
grant select (id,organization_id,branch_id,product_id,quantity_on_hand,quantity_reserved,quantity_available,created_at,updated_at) on public.inventory to authenticated;
grant select (id,organization_id,branch_id,product_id,movement_type,quantity,reference,notes,created_by,created_at) on public.stock_movements to authenticated;
grant select (id,sale_id,organization_id,branch_id,product_id,quantity,unit_price,discount_amount,vat_amount,line_total,created_at,warranty_months_snapshot,purchase_date_snapshot) on public.sale_items to authenticated;
grant select(id,organization_id,branch_id,supplier_id,po_number,status,expected_delivery_date,ordered_at,received_at,notes,created_by,approved_by,created_at,updated_at) on public.purchase_orders to authenticated;
grant select(id,purchase_order_id,product_id,quantity,received_quantity) on public.purchase_order_items to authenticated;
grant select,insert,update,delete on public.profiles,public.user_organizations,public.user_branches,public.user_roles to service_role;
grant update(full_name,phone) on public.profiles to authenticated;
grant insert(organization_id,name,slug,description) on public.categories,public.brands to authenticated;
grant insert(organization_id,name,supplier_code,contact_name,email,phone,website,city,postcode,notes) on public.suppliers to authenticated;
grant insert(organization_id,category_id,brand_id,supplier_id,name,sku,barcode,description,cost_price,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured) on public.products to authenticated;
grant update(category_id,brand_id,supplier_id,name,sku,barcode,description,cost_price,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured) on public.products to authenticated;
grant insert(organization_id,customer_code,customer_type,first_name,last_name,company_name,email,phone,address_line_1,address_line_2,city,postcode,country,notes,is_active,created_by) on public.customers to authenticated;
grant update(customer_type,first_name,last_name,company_name,email,phone,address_line_1,address_line_2,city,postcode,country,notes,is_active) on public.customers to authenticated;

-- One scoped projection supplies both header and line purchasing values.
create or replace function public.get_purchasing_projection(p_organization_id uuid,p_branch_id uuid,p_order_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
if auth.uid() is null or p_branch_id is null or not public.has_permission('purchases.view',p_organization_id,p_branch_id) then
raise exception 'Purchasing access denied' using errcode='42501'; end if;
return jsonb_build_object('orders',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'subtotal',p.subtotal,'tax_amount',p.tax_amount,'discount_amount',p.discount_amount,'total_amount',p.total_amount)),'[]') from public.purchase_orders p where p.organization_id=p_organization_id and p.branch_id=p_branch_id and p.id=any(p_order_ids)),
'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'cost_price',i.cost_price,'tax_rate',i.tax_rate,'discount_rate',i.discount_rate,'line_total',i.line_total)),'[]') from public.purchase_order_items i join public.purchase_orders p on p.id=i.purchase_order_id where p.organization_id=p_organization_id and p.branch_id=p_branch_id and p.id=any(p_order_ids)));
end $$;
revoke all on function public.get_purchasing_projection(uuid,uuid,uuid[]) from public,anon,service_role;
grant execute on function public.get_purchasing_projection(uuid,uuid,uuid[]) to authenticated;

-- Internal trigger functions are never API endpoints.
do $$ declare f record; begin
for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype='trigger'::regtype loop
execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
end loop; end $$;

-- Public-schema defaults only; managed Auth/Storage defaults are untouched.
-- supabase_admin defaults deliberately remain unchanged: hosted postgres cannot
-- administer that role. Future application objects must use the controlled
-- postgres migration path with explicit ACLs. Per-schema revocations do not
-- override global default grants; audit global defaults before deployment.
alter default privileges for role postgres in schema public revoke all on tables from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public,anon,authenticated,service_role;

-- Abort on inherited maintenance privileges or financial-column exposure.
do $$ declare t text; r text; begin
foreach t in array array['branches','brands','categories','customers','inventory','organization_settings','organizations','payments','permissions','product_serials','products','profiles','purchase_order_items','purchase_orders','repair_job_events','repair_jobs','repair_payments','return_items','return_serials','returns','role_permissions','roles','sale_item_serials','sale_items','sales','staff_invitation_resends','stock_movements','supplier_invoices','supplier_payments','suppliers','user_branches','user_organizations','user_roles','warranty_claim_events','warranty_claims'] loop
if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS required: %',t; end if;
foreach r in array array['anon','authenticated','service_role'] loop
if has_table_privilege(r,'public.'||t,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(r,'public.'||t,'REFERENCES') then raise exception 'Excessive privileges: % %',r,t; end if;
end loop;
if t not in ('products','customers','categories','brands','suppliers','profiles') and has_any_column_privilege('authenticated','public.'||t,'INSERT,UPDATE') then raise exception 'Direct transactional writes: %',t; end if;
if has_table_privilege('authenticated','public.'||t,'DELETE') then raise exception 'Direct delete: %',t; end if;
if t in ('repair_jobs','repair_job_events','repair_payments','warranty_claims','warranty_claim_events','staff_invitation_resends','organization_settings') and has_any_column_privilege('authenticated','public.'||t,'SELECT') then raise exception 'RPC-only exposure: %',t; end if;
if has_any_column_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE') or has_table_privilege('anon','public.'||t,'DELETE') then raise exception 'Anonymous exposure: %',t; end if;
end loop;
if has_column_privilege('authenticated','public.products','cost_price','SELECT') or has_column_privilege('authenticated','public.inventory','average_cost','SELECT') or has_column_privilege('authenticated','public.sale_items','unit_cost','SELECT') or has_column_privilege('authenticated','public.stock_movements','unit_cost','SELECT') or has_column_privilege('authenticated','public.purchase_order_items','cost_price','SELECT') then raise exception 'Financial exposure'; end if;
end $$;
do $$ declare t text; c text; begin
for t,c in select * from (values ('purchase_orders','subtotal'),('purchase_orders','tax_amount'),('purchase_orders','discount_amount'),('purchase_orders','total_amount'),('purchase_order_items','cost_price'),('purchase_order_items','tax_rate'),('purchase_order_items','discount_rate'),('purchase_order_items','line_total')) v(t,c) loop
if has_column_privilege('authenticated','public.'||t,c,'SELECT') then raise exception 'Purchasing financial exposure: % %',t,c; end if;
end loop;
if has_column_privilege('authenticated','public.profiles','is_active','UPDATE') or has_column_privilege('authenticated','public.products','organization_id','UPDATE') then raise exception 'Protected identity column writable'; end if;
end $$;
notify pgrst,'reload schema';
commit;
