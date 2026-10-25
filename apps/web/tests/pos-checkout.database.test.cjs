// Optional real PostgreSQL tests. Never points at hosted Supabase.
// Supply an EMPTY disposable local database named alphapos_pos_test_* via
// ALPHAPOS_POS_TEST_DATABASE_URL, with psql installed (or ALPHAPOS_PSQL set).
// Creates a minimal transaction fixture and executes the actual migration,
// immutable allocation trigger and legacy IMEI trigger. Authorization helpers
// model a cashier's scoped claims; full deployed RBAC still needs acceptance.
// No URL, credentials or raw psql diagnostics are printed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const database = process.env.ALPHAPOS_POS_TEST_DATABASE_URL;
const migrationRoot = path.join(__dirname, '../../../supabase/migrations');
const read = name => fs.readFileSync(path.join(migrationRoot, name), 'utf8');
const org = '11111111-1111-4111-8111-111111111111';
const branch = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const actor = '44444444-4444-4444-8444-444444444444';
const product = 'f3c79125-4d2b-4cd4-90eb-a472c12258bb';
const wanted = '83b00578-2baf-4ec6-b824-8bb0118e7087';
const legacy = '90f8eb23-788d-4126-bdea-9b67b7e4f0e1';
const spare = '55555555-5555-4555-8555-555555555555';
function extracted(source, name) {
  const start = source.indexOf(`create function public.${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('$$;', start) + 3);
}
function psql(sql, onOutput) {
  const url = new URL(database);
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '5' };
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ALPHAPOS_PSQL || 'psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { env, windowsHide: true });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; onOutput?.(stdout); });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Local PostgreSQL test client unavailable.')));
    child.on('close', code => resolve({ code, stdout: stdout.trim() }));
    child.stdin.end(sql);
  });
}
const claims = `set request.jwt.claim.sub='${actor}'; set test.org='${org}'; set test.branch='${branch}'; set test.allowed='true';`;
const line = ids => ({ product_id: product, quantity: ids.length, product_serial_ids: ids });
function sale(items = [line([wanted])], amount = 120) {
  return `select public.complete_pos_sale('${org}','${branch}','${JSON.stringify(items)}'::jsonb,'[{"payment_method":"CASH","amount":${amount}}]'::jsonb);`;
}
const snapshot = `select jsonb_build_object(
 'sales',(select count(*) from public.sales),'items',(select count(*) from public.sale_items),
 'payments',(select count(*) from public.payments),'allocations',(select count(*) from public.sale_item_serials),
 'movements',(select count(*) from public.stock_movements),'quantity',(select sum(quantity_on_hand) from public.inventory),
 'serials',(select jsonb_agg(to_jsonb(ps) order by ps.id) from public.product_serials ps));`;

test('PostgreSQL: actual explicit checkout, concurrency and rollback', { skip: !database, timeout: 60000 }, async t => {
  const url = new URL(database);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'Local disposable database only');
  assert.match(url.pathname, /^\/alphapos_pos_test_[a-z0-9_]+$/);
  const empty = await psql("select count(*) from pg_tables where schemaname in ('public','auth');");
  assert.equal(empty.code, 0, 'Cannot connect to the local fixture database');
  assert.equal(empty.stdout, '0', 'Refusing a non-empty database');
  const fixture = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create function public.is_org_member(uuid) returns boolean language sql stable as $$ select auth.uid() is not null and $1::text=current_setting('test.org',true) $$;
create function public.is_branch_member(uuid) returns boolean language sql stable as $$ select auth.uid() is not null and $1::text=current_setting('test.branch',true) $$;
create function public.has_permission(text,uuid,uuid) returns boolean language sql stable as $$ select $1='sales.create' and public.is_org_member($2) and public.is_branch_member($3) and current_setting('test.allowed',true)='true' $$;
create table public.organizations(id uuid primary key,timezone text default 'Europe/London');
create table public.branches(id uuid primary key,organization_id uuid,is_active boolean default true);
create table public.products(id uuid primary key,organization_id uuid,name text,sku text,barcode text,retail_price numeric,is_active boolean default true,is_serialized boolean,requires_imei boolean,warranty_months integer);
create table public.inventory(id uuid primary key default gen_random_uuid(),organization_id uuid,branch_id uuid,product_id uuid,quantity_on_hand integer,quantity_reserved integer default 0,quantity_available integer generated always as (quantity_on_hand-quantity_reserved) stored,average_cost numeric,updated_at timestamptz);
create table public.sales(id uuid primary key,organization_id uuid,branch_id uuid,cashier_id uuid,receipt_number text,status text,subtotal numeric,vat_amount numeric,discount_amount numeric,total_amount numeric,notes text,completed_at timestamptz);
create table public.sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid,organization_id uuid,branch_id uuid,product_id uuid,quantity integer,unit_price numeric,unit_cost numeric,discount_amount numeric,vat_amount numeric,line_total numeric,warranty_months_snapshot integer,purchase_date_snapshot date);
create table public.stock_movements(id uuid primary key default gen_random_uuid(),organization_id uuid,branch_id uuid,product_id uuid,movement_type text,quantity integer,unit_cost numeric,reference text,notes text,created_by uuid);
create table public.product_serials(id uuid primary key,organization_id uuid,branch_id uuid,product_id uuid,status text,serial_number text,imei text,sale_id uuid,sold_at timestamptz,stock_movement_id uuid,created_at timestamptz default now());
create table public.sale_item_serials(id uuid primary key default gen_random_uuid(),organization_id uuid,branch_id uuid,sale_id uuid,sale_item_id uuid,product_id uuid,product_serial_id uuid,serial_number_snapshot text,imei_snapshot text,allocated_at timestamptz default now(),unique(sale_id,product_serial_id));
create table public.payments(id uuid primary key default gen_random_uuid(),sale_id uuid,organization_id uuid,branch_id uuid,payment_method text,amount numeric,reference text,received_by uuid);
insert into public.organizations(id) values('${org}'),('${other}');
insert into public.branches(id,organization_id) values('${branch}','${org}'),('${other}','${other}');
insert into public.products values('${product}','${org}','Phone','PHONE',null,120,true,true,true,12),('${other}','${org}','Other','OTHER',null,120,true,true,true,12);
insert into public.inventory(organization_id,branch_id,product_id,quantity_on_hand,average_cost) values('${org}','${branch}','${product}',3,50),('${org}','${branch}','${other}',3,50);
insert into public.product_serials(id,organization_id,branch_id,product_id,status,imei) values
 ('${wanted}','${org}','${branch}','${product}','IN_STOCK','123456789098765'),
 ('${legacy}','${org}','${branch}','${product}','IN_STOCK','3344435667'),
 ('${spare}','${org}','${branch}','${product}','IN_STOCK','123456789098766');
`;
  const evidence = read('20260925010000_warranty_sale_evidence.sql');
  const triggers = extracted(evidence, 'warranty_allocation_validate') + '\n' + extracted(evidence, 'warranty_immutable_history') + `
create trigger allocation_validate before insert on public.sale_item_serials for each row execute function public.warranty_allocation_validate();
create trigger allocation_immutable before update or delete on public.sale_item_serials for each row execute function public.warranty_immutable_history();
` + extracted(read('20260923232804_fix_repair_intake_and_imei_writes.sql'), 'enforce_product_serial_imei') + `
create trigger product_serial_imei_write_guard after insert or update on public.product_serials for each row execute function public.enforce_product_serial_imei();
`;
  assert.equal((await psql(fixture + triggers + read('20261007010000_pos_explicit_identifiers.sql'))).code, 0, 'Fixture/migration failed');
  await t.test('cashier without inventory.view sees only valid identifiers and public product fields', async () => {
    const result = await psql(claims + `select string_agg(imei,',') from public.get_pos_identifiers('${org}','${branch}','${product}');`);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes('123456789098765'));
    assert.ok(!result.stdout.includes('3344435667'));
    assert.equal((await psql(claims + `select count(*) from public.search_pos_products('${org}','${branch}','Phone');`)).stdout, '1');
  });
  async function failsUnchanged(statement, preparation = '') {
    const before = await psql(snapshot);
    const result = await psql(`begin;${claims}${preparation}${statement} rollback;`);
    assert.notEqual(result.code, 0, 'Invalid checkout unexpectedly succeeded');
    assert.equal((await psql(snapshot)).stdout, before.stdout, 'Failed checkout changed persisted state');
  }
  await t.test('missing, duplicates, null, invalid UUID and mismatched counts fail unchanged', async () => {
    for (const ids of [undefined, [], null, [wanted,wanted], ['invalid'], [null]]) {
      await failsUnchanged(sale([{ product_id: product, quantity: 1, ...(ids === undefined ? {} : { product_serial_ids: ids }) }]));
    }
    await failsUnchanged(sale([{ product_id: product, quantity: 2, product_serial_ids: [wanted] }], 240));
    await failsUnchanged(sale([line([wanted]), { product_id: other, quantity: 1, product_serial_ids: [wanted] }], 240));
  });
  await t.test('wrong org, branch, product, SOLD and RESERVED IDs fail without substitution', async () => {
    for (const change of [`organization_id='${other}'`, `branch_id='${other}'`, `product_id='${other}'`, "status='SOLD'", "status='RESERVED'"]) {
      await failsUnchanged(sale(), `update public.product_serials set ${change} where id='${wanted}';`);
    }
    await failsUnchanged(sale([line([legacy])]));
    await failsUnchanged(sale(), "set test.allowed='false';");
    await failsUnchanged(sale(), "set request.jwt.claim.sub='';");
  });
  await t.test('ordinary item still completes, but rejects unexpected selected IDs', async () => {
    const prepare = `update public.products set is_serialized=false,requires_imei=false where id='${product}';`;
    assert.equal((await psql(`begin;${claims}${prepare}${sale([{ product_id: product,quantity: 1 }])}rollback;`)).code, 0);
    await failsUnchanged(sale(), prepare);
  });
  await t.test('late payment failure rolls back sale, stock, SOLD update and immutable allocation', async () => {
    await failsUnchanged(sale(), `create function public.fail_payment() returns trigger language plpgsql as $$ begin raise exception 'test payment failure'; end; $$; create trigger fail_payment before insert on public.payments for each row execute function public.fail_payment();`);
  });
  await t.test('two concurrent sales of the exact device yield one success and one failure, no substitute', async () => {
    let announce;
    const ready = new Promise(resolve => { announce = resolve; });
    const first = psql(`begin;${claims}${sale()}select 'allocation_ready';select pg_sleep(2);commit;`, output => { if (output.includes('allocation_ready')) announce(); });
    await Promise.race([ready, first.then(() => { throw new Error('First checkout did not reach locked allocation'); })]);
    const second = psql(claims + sale());
    assert.equal((await first).code, 0);
    assert.notEqual((await second).code, 0);
    const result = await psql(`select jsonb_build_object('allocations',(select jsonb_agg(product_serial_id) from public.sale_item_serials),'legacy',(select status from public.product_serials where id='${legacy}'),'spare',(select status from public.product_serials where id='${spare}'),'snapshot',(select imei_snapshot from public.sale_item_serials),'warranty',(select warranty_months_snapshot from public.sale_items),'payments',(select count(*) from public.payments));`);
    assert.deepEqual(JSON.parse(result.stdout), { allocations: [wanted], legacy: 'IN_STOCK', spare: 'IN_STOCK', snapshot: '123456789098765', warranty: 12, payments: 1 });
  });
});
