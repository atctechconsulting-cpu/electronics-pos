const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');
const migration = read('../../supabase/migrations/20261101010000_financial_read_projections.sql');
function load(result) {
  const module = { exports: {} }, calls = [];
  const supabase = { rpc(name, args) { calls.push({ name, args }); return Promise.resolve(result); } };
  vm.runInNewContext(ts.transpileModule(read('lib/services/financial-projections.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require() { return { supabase }; } });
  return { ...module.exports, calls };
}
test('hidden costs stay null and operational values remain intact', async () => {
  const h = load({ data: [], error: null }), input = [{ id: 'a', retail_price: 100, quantity_on_hand: 5 }];
  const [row] = await h.withCosts(input, 'org', 'branch', 'inventory', 'average_cost');
  assert.equal(row.average_cost, null); assert.equal(row.retail_price, 100); assert.equal(row.quantity_on_hand, 5);
  assert.equal(input[0].average_cost, undefined);
  assert.equal(h.calls[0].args.p_organization_id, 'org'); assert.equal(h.calls[0].args.p_branch_id, 'branch');
});
test('permitted zero and nonzero costs match only requested rows', async () => {
  const h = load({ data: [{ id: 'a', cost: 0 }, { id: 'b', cost: '42.50' }, { id: 'other', cost: 900 }], error: null });
  const rows = await h.withCosts([{ id: 'a' }, { id: 'b' }], 'org', null, 'products', 'cost_price');
  assert.equal(rows[0].cost_price, 0); assert.equal(rows[1].cost_price, 42.5); assert.equal(rows.length, 2);
});
test('projection failure never falls back to raw cost reads or reveals database errors', async () => {
  const h = load({ error: { message: 'private SQL detail' } });
  await assert.rejects(h.withCosts([{ id: 'a' }], 'org', null, 'products', 'cost_price'), /Unable to load financial access/);
  assert.equal(h.calls.length, 1);
});
test('operational services and mutation responses explicitly exclude financial columns', () => {
  for (const name of ['products', 'inventory', 'stock-movements']) {
    const source = read('lib/services/' + name + '.ts');
    assert.doesNotMatch(source, /select\(\s*(?:\)|["']\*|`\s*\*)/);
    assert.match(source, /withCosts/);
  }
  assert.doesNotMatch(read('lib/services/sale-details.ts'), /unit_cost/);
  assert.match(read('lib/services/products.ts'), /partial\(\{ cost_price: true \}\)/);
  assert.match(read('components/products/edit-product-dialog.tsx'), /cost_price: product.cost_price == null \? undefined/);
});
test('financial SELECT revokes table and column grants and asserts effective privileges', () => {
  for (const table of ['products', 'inventory', 'stock_movements', 'sale_items']) {
    assert.ok(migration.includes('revoke select on public.' + table));
    assert.ok(migration.includes('revoke select (%s) on public.' + table));
  }
  assert.match(migration, /has_column_privilege/);
  assert.doesNotMatch(migration, /grant select on (?:table )?public\.(products|inventory|stock_movements|sale_items)/);
});
test('cost projection uses caller membership, scoped permissions, fixed search path and narrow grants', () => {
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /auth.uid\(\) is null or not public.is_org_member/);
  for (const permission of ['finance.view', 'purchases.view', 'purchases.manage']) assert.ok(migration.includes("'" + permission + "',p_organization_id,p_branch_id"));
  assert.match(migration, /from public, anon, service_role/);
});
test('receiving changes only average-cost response, preserving all calculation and transaction SQL', () => {
  const old = read('../../supabase/migrations/20260926010000_fix_receiving_identifier_contract.sql');
  const start = 'create or replace function public.receive_stock(', end = '\n$$;';
  const extract = s => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start)) + end.length);
  const expected = extract(old).replace("'average_cost',\n    v_new_average_cost,", "'average_cost',\n    case when public.has_permission('finance.view', p_organization_id, p_branch_id)\n      then v_new_average_cost else null end,");
  assert.equal(extract(migration), expected);
});
test('unavailable valuation displays a dash and purchasing uses the selected branch', () => {
  assert.match(read('app/(app)/inventory/page.tsx'), /item.average_cost == null \? "—"/);
  assert.match(read('app/(app)/purchases/new/page.tsx'), /getProducts\(organization.id, branch.id\)/);
});
