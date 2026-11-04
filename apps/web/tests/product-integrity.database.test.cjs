// Real PostgreSQL 17 sessions with authenticated role + JWT claim context.
// LOCAL container is fixed, no hosted URLs/env files. All fixtures and the
// temporary UPDATE grant roll back, including on assertion/connection failure.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const enabled = process.env.ALPHAPOS_LOCAL_PRODUCT_INTEGRITY_TEST === '1';

test('local product integrity with history hidden by RLS', { skip: !enabled }, async t => {
  const [org, other, branch, user, role, stocked, sold, moved, unused, foreign, tracked, sale] = Array.from({ length: 12 }, randomUUID);
  const checks = [];
  const check = (name, sql) => { checks.push(name); return `${sql}\nselect '${name}';\n`; };
  const statements = `
begin;
set local statement_timeout='30s';
do $$ begin
  if current_setting('server_version_num')::integer / 10000 <> 17 then raise exception 'PostgreSQL 17 required'; end if;
  if not (select bool_and(prosecdef) from pg_proc where oid in ('public.protect_product_identity()'::regprocedure,'public.prevent_invalid_serial_tracking_change()'::regprocedure)) then
    raise exception 'Install product integrity migration first';
  end if;
end $$;
grant update on public.products to authenticated;
insert into auth.users(id,email,raw_user_meta_data) values ('${user}','integrity-${user}@example.test','{}');
insert into public.organizations(id,name,slug) values ('${org}','LOCAL integrity test','integrity-${org}'),('${other}','LOCAL other organisation','integrity-${other}');
insert into public.branches(id,organization_id,name,code) values ('${branch}','${org}','LOCAL history branch','MAIN');
insert into public.roles(id,name) values ('${role}','integrity-${role}');
insert into public.role_permissions(role_id,permission_id) select '${role}',id from public.permissions where key in ('products.view','products.manage');
insert into public.user_organizations(user_id,organization_id,is_active) values ('${user}','${org}',true);
insert into public.user_roles(user_id,role_id,organization_id,branch_id) values ('${user}','${role}','${org}',null);
insert into public.products(id,organization_id,name,sku,is_serialized,requires_imei) values
 ('${stocked}','${org}','Stocked','STOCK',false,false),
 ('${sold}','${org}','Sold','SOLD',false,false),
 ('${moved}','${org}','History','MOVED',false,false),
 ('${unused}','${org}','Unused','UNUSED',false,false),
 ('${foreign}','${other}','Other','OTHER',false,false),
 ('${tracked}','${org}','Tracked','TRACKED',true,true);
insert into public.inventory(organization_id,branch_id,product_id,quantity_on_hand,average_cost) values ('${org}','${branch}','${stocked}',7,37.23);
insert into public.stock_movements(organization_id,branch_id,product_id,movement_type,quantity,unit_cost) values ('${org}','${branch}','${moved}','RECEIPT',1,41.29);
insert into public.sales(id,organization_id,branch_id,cashier_id,receipt_number,total_amount) values ('${sale}','${org}','${branch}','${user}','LOCAL-INTEGRITY',120);
insert into public.sale_items(sale_id,organization_id,branch_id,product_id,quantity,unit_price,unit_cost,line_total) values
 ('${sale}','${org}','${branch}','${sold}',1,60,33.17,60),
 ('${sale}','${org}','${branch}','${tracked}',1,60,33.17,60);
-- Compare complete history rows after the attempted edits, not only quantities.
create temporary table history_before as select jsonb_build_object(
 'inventory',(select jsonb_agg(i) from public.inventory i where organization_id='${org}'),
 'movements',(select jsonb_agg(m) from public.stock_movements m where organization_id='${org}'),
 'sales',(select jsonb_agg(s) from public.sales s where organization_id='${org}'),
 'items',(select jsonb_agg(s order by id) from public.sale_items s where organization_id='${org}')
) as data;
create function pg_temp.check_true(ok boolean) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'Integrity assertion failed'; end if;
end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then
   if sqlerrm=expected then return; end if;
   raise exception 'Unexpected integrity error: %',sqlerrm;
 end;
 raise exception 'Expected integrity rejection';
end $$;
create function pg_temp.expect_privilege_denial(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'Expected privilege denial';
end $$;
select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);
set local role authenticated;
${check('editor authorization and hidden inventory/sales confirmed', `
select pg_temp.check_true(auth.uid()='${user}'::uuid and public.has_permission('products.manage','${org}',null));
select pg_temp.check_true(not public.has_permission('inventory.view','${org}','${branch}') and not public.has_permission('sales.view','${org}','${branch}'));
select pg_temp.check_true((select count(id)=0 from public.inventory where organization_id='${org}'));
select pg_temp.check_true((select count(id)=0 from public.sale_items where organization_id='${org}'));
select pg_temp.check_true((select count(id)=0 from public.stock_movements where organization_id='${org}'));`)}
${check('hidden stock prevents SKU and tracking changes', `
select pg_temp.expect_error('update public.products set sku=''CHANGED'' where id=''${stocked}''','SKU cannot be changed after inventory activity exists.');
select pg_temp.expect_error('update public.products set is_serialized=true where id=''${stocked}''','This product already has stock. You cannot enable IMEI or serial tracking until inventory reaches zero.');
select pg_temp.expect_error('update public.products set requires_imei=true where id=''${stocked}''','This product already has stock. You cannot enable IMEI or serial tracking until inventory reaches zero.');`)}
${check('hidden sales prevent SKU and tracking changes with no current stock', `
select pg_temp.expect_error('update public.products set sku=''CHANGED'' where id=''${sold}''','SKU cannot be changed after inventory activity exists.');
select pg_temp.expect_error('update public.products set is_serialized=true where id=''${sold}''','Serialized setting cannot be changed after inventory activity exists.');
select pg_temp.expect_error('update public.products set requires_imei=true where id=''${sold}''','Serialized setting cannot be changed after inventory activity exists.');`)}
${check('movement history independently protects product identity', `
select pg_temp.expect_error('update public.products set sku=''CHANGED'' where id=''${moved}''','SKU cannot be changed after inventory activity exists.');`)}
${check('historical IMEI and serial flags cannot be disabled', `
select pg_temp.expect_error('update public.products set requires_imei=false where id=''${tracked}''','IMEI tracking cannot be changed after inventory activity exists.');
select pg_temp.expect_error('update public.products set requires_imei=false,is_serialized=false where id=''${tracked}''','Serialized setting cannot be changed after inventory activity exists.');`)}
${check('unused product editable and IMEI still normalizes serial tracking', `
update public.products set sku='UNUSED-EDITED',requires_imei=true where id='${unused}';
select pg_temp.check_true((select sku='UNUSED-EDITED' and requires_imei and is_serialized from public.products where id='${unused}'));`)}
${check('legitimate metadata edits succeed without history visibility', `
update public.products set name='Edited metadata',description='LOCAL metadata' where id in ('${stocked}','${sold}','${moved}','${tracked}');
select pg_temp.check_true((select count(id)=4 from public.products where organization_id='${org}' and name='Edited metadata'));`)}
${check('cross-organisation updates and tenant moves remain denied', `
with changed as (update public.products set name='Forbidden' where id='${foreign}' returning id) select pg_temp.check_true(count(*)=0) from changed;
select pg_temp.expect_privilege_denial('update public.products set organization_id=''${other}'' where id=''${unused}''');`)}
${check('history costs and privileged functions remain inaccessible', `
select pg_temp.expect_privilege_denial('select average_cost from public.inventory');
select pg_temp.expect_privilege_denial('select unit_cost from public.sale_items');
select pg_temp.expect_privilege_denial('select public.protect_product_identity()');
select pg_temp.expect_privilege_denial('select public.prevent_invalid_serial_tracking_change()');
select pg_temp.check_true(not has_function_privilege('anon','public.protect_product_identity()','EXECUTE') and not has_function_privilege('service_role','public.prevent_invalid_serial_tracking_change()','EXECUTE'));`)}
reset role;
-- Also prove the checks do not depend on SELECT ACLs at all. These REVOKEs
-- exist only in this transaction and are rolled back with the fixtures.
do $$ declare tab text; cols text; begin
 foreach tab in array array['inventory','stock_movements','sale_items'] loop
   execute format('revoke select on public.%I from public,authenticated',tab);
   select string_agg(quote_ident(attname),',') into cols from pg_attribute
   where attrelid=('public.'||tab)::regclass and attnum>0 and not attisdropped;
   execute format('revoke select (%s) on public.%I from public,authenticated',cols,tab);
 end loop;
end $$;
set local role authenticated;
${check('integrity and metadata edits work even without history SELECT privileges', `
select pg_temp.expect_privilege_denial('select id from public.inventory');
select pg_temp.expect_privilege_denial('select id from public.sale_items');
select pg_temp.expect_error('update public.products set sku=''CHANGED'' where id=''${sold}''','SKU cannot be changed after inventory activity exists.');
select pg_temp.expect_error('update public.products set requires_imei=true where id=''${stocked}''','This product already has stock. You cannot enable IMEI or serial tracking until inventory reaches zero.');
update public.products set description='Metadata without history SELECT' where id='${stocked}';
select pg_temp.check_true((select description='Metadata without history SELECT' from public.products where id='${stocked}'));`)}
reset role;
${check('all transaction history and financial values remain identical', `
select pg_temp.check_true((select data from history_before)=jsonb_build_object(
 'inventory',(select jsonb_agg(i) from public.inventory i where organization_id='${org}'),
 'movements',(select jsonb_agg(m) from public.stock_movements m where organization_id='${org}'),
 'sales',(select jsonb_agg(s) from public.sales s where organization_id='${org}'),
 'items',(select jsonb_agg(s order by id) from public.sale_items s where organization_id='${org}')
));`)}
rollback;
`;
  let output;
  try {
    output = execFileSync('docker', ['exec', '-i', 'supabase_db_electronics-pos', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
      { input: statements, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    // Only local SQL diagnostics, never connection credentials or Auth tokens.
    throw new Error('Local integrity transaction failed: ' + String(error.stderr));
  }
  for (const name of checks) await t.test(name, () => assert.ok(output.split(/\r?\n/).includes(name)));
  assert.match(output, /ROLLBACK/);
});
