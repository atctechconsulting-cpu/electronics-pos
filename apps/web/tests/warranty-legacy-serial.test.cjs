// Offline regression contracts. Database execution/concurrency acceptance is separate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.join(__dirname, '../../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sql = read('supabase/migrations/20260925045457_fix_warranty_legacy_serial_repair.sql');
function fn(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf('end; $$;', start));
}
const create = fn('create_warranty_repair');
const match = fn('warranty_check_repair');
function load(file, mocks = {}) {
  const code = ts.transpileModule(read(`apps/web/${file}`), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: n => Object.hasOwn(mocks, n) ? mocks[n] : require(n) });
  return module.exports;
}
const validation = load('lib/validations/repair.ts');
const id = '60416400-5d2f-426e-82d4-d59c4457cb2d';
const input = { customer_id: id, product_id: null, product_serial_id: null, category_id: null, brand_id: null,
  device_type: 'Phone', brand_name: null, model: 'Phone', imei: null, serial_number: null, accessories_received: null,
  fault_description: 'Does not charge', physical_condition: null, intake_notes: null, priority: 'normal',
  assigned_to: null, estimated_amount: null, estimated_completion_at: null };
for (const imei of ['8677756566770', 'abcdefghijklmno']) {
  test(`manual repair still rejects ${imei}`, () => {
    assert.equal(validation.repairCreateSchema.safeParse({ ...input, imei }).success, false);
    const strict = read('supabase/migrations/20260923232804_fix_repair_intake_and_imei_writes.sql');
    assert.match(strict, /if v_imei is not null and v_imei !~ '\^\[0-9\]\{15\}\$' then/);
    assert.doesNotMatch(sql, /create or replace function public.create_repair\(/);
  });
}
test('valid 15-digit and optional manual IMEIs retain existing validation', () => {
  assert.equal(validation.repairCreateSchema.safeParse({ ...input, imei: '867775656677012' }).success, true);
  assert.equal(validation.repairCreateSchema.safeParse(input).success, true);
});
test('valid existing serial follows normal intake using authoritative stored identifiers', () => {
  assert.match(create, /v_legacy:=v_serial.imei is not null and v_serial.imei !~ '\^\[0-9\]\{15\}\$'/);
  assert.match(create, /'product_serial_id',case when v_legacy then null else c.source_product_serial_id end/);
  assert.match(create, /when c.source_product_serial_id is not null then v_serial.imei else c.imei_snapshot end/);
});
test('legacy existing serial initializes a NULL-IMEI repair then atomically attaches trusted ID', () => {
  assert.match(create, /'imei',case when v_legacy then null/);
  assert.match(create, /if v_legacy then[\s\S]*update public.repair_jobs j set product_serial_id=v_serial.id/);
  assert.ok(create.indexOf('public.create_repair(') < create.indexOf('update public.repair_jobs'));
  assert.ok(create.indexOf('update public.repair_jobs') < create.indexOf('public.link_warranty_repair('));
  assert.match(create, /j.id=r and j.organization_id=p_org and j.branch_id=p_branch/);
  assert.match(create, /j.customer_id=c.customer_id and j.product_id=c.product_id and j.product_serial_id is null/);
  assert.doesNotMatch(create, /exception when|\bcommit\b/);
  assert.match(read('supabase/migrations/20260923003351_repairs_v1.sql'), /imei text check \(imei is null or imei ~ '\^\[0-9\]\{15\}\$'\)/);
});
test('original legacy identifier is retained exactly in history, never rewritten', () => {
  assert.match(create, /'legacy_imei_snapshot',v_serial.imei/);
  assert.doesNotMatch(sql, /update public.product_serials|update public.warranty_claims|lpad\(|rpad\(|substring\(|substr\(/i);
  assert.doesNotMatch(sql, /alter table/);
});
test('server resolves trusted ID from locked claim with exact organisation/product and source permission', () => {
  assert.match(create, /id=p_claim and organization_id=p_org and servicing_branch_id=p_branch for update/);
  assert.match(create, /ps.id=c.source_product_serial_id[\s\S]*ps.organization_id=p_org and ps.product_id=c.product_id for share/);
  assert.match(create, /has_permission\('inventory.view',p_org,v_serial.branch_id\)/);
  assert.match(create, /perform public.warranty_validate_evidence\(c\)/);
  const original = read('supabase/migrations/20260925010100_warranty_v1.sql');
  assert.match(original, /has_permission\('sales.view',c.organization_id,s.branch_id\)/);
  assert.match(original, /Serial does not match immutable sale-item evidence/);
});
test('matching rejects different serial, organisation, customer, branch or product', () => {
  assert.match(match, /organization_id=c.organization_id and branch_id=c.servicing_branch_id/);
  assert.match(match, /r.customer_id<>c.customer_id/);
  assert.match(match, /r.product_id is distinct from c.product_id or r.product_serial_id is distinct from c.source_product_serial_id/);
  assert.match(match, /a.sale_id=c.source_sale_id and a.organization_id=c.organization_id and a.product_id=c.product_id/);
  assert.match(match, /a.product_serial_id=c.source_product_serial_id/);
});
test('trusted serial matching does not require legacy text equality; unlinked claims still do', () => {
  const trusted = match.slice(match.indexOf('if c.source_product_serial_id is not null then'), match.indexOf('\n else'));
  assert.doesNotMatch(trusted, /r.imei|r.serial_number/);
  assert.match(match, /else\s+if r.imei is distinct from c.imei_snapshot or r.serial_number is distinct from c.serial_number_snapshot/);
  assert.match(match, /c.product_id is null and r.model is distinct from c.device_description/);
});
test('API accepts no client identifier override, including a malformed claim snapshot', async () => {
  const calls = [];
  const service = load('lib/services/warranty.ts', { '@/lib/supabase/client': { supabase: { rpc: async (name,args) => { calls.push({name,args}); return {data:id,error:null}; } } }, '@/lib/validations/warranty': {} });
  await service.createWarrantyRepair({ organizationId:'org', branchId:'branch' }, { id, version:2, imei_snapshot:'arbitrary malformed', source_product_serial_id:'untrusted override' }, 'Phone');
  assert.deepEqual(Object.keys(calls[0].args).sort(), ['p_branch','p_claim','p_device_type','p_org','p_version']);
  assert.equal(calls[0].name,'create_warranty_repair');
  assert.doesNotMatch(JSON.stringify(calls[0]),/arbitrary malformed|untrusted override/);
});
test('existing active-branch, permission, retry and private-helper boundaries remain', () => {
  assert.match(create, /warranty_assert_access\(p_org,p_branch,true\)/);
  assert.match(create, /warranty_lock_claim\(p_org,p_branch,p_claim,p_version\)/);
  assert.match(create, /if c.repair_job_id is not null then perform public.warranty_check_repair\(c,c.repair_job_id\); return c.repair_job_id/);
  assert.match(match, /'repairs.view'/); assert.match(match, /'repairs.manage'/);
  assert.equal((sql.match(/security definer set search_path=''/g) || []).length, 2);
  assert.match(sql, /has_function_privilege\('authenticated',f.oid,'EXECUTE'\) is distinct from \(f.proname='create_warranty_repair'\)/);
  assert.doesNotMatch(sql, /grant execute|drop function|create or replace function public.enforce_product_serial_imei/);
});
