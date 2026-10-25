const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
function load(file, mocks = {}) {
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, setTimeout, clearTimeout, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  } });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const { checkoutItems, addBasketProduct, decreaseBasketProduct } = load('lib/pos-basket.ts');
const device = { id: '83b00578-2baf-4ec6-b824-8bb0118e7087', imei: '123456789098765', serial_number: null };
const legacy = { id: '90f8eb23-788d-4126-bdea-9b67b7e4f0e1', imei: '3344435667', serial_number: null };
const second = { ...device, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', imei: '123456789098766' };
const product = { id: 'f3c79125-4d2b-4cd4-90eb-a472c12258bb', name: 'Phone', sku: 'PHONE', retail_price: 120, quantity_available: 4, is_serialized: true, requires_imei: true };
const ordinary = { ...product, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', is_serialized: false, requires_imei: false };
const tracked = () => addBasketProduct([], product, [device]);
test('chosen UAT identifier passes through basket and customer checkout RPC unchanged', async () => {
  const calls = [];
  const sales = load('lib/services/sales.ts', { '@/lib/supabase/client': { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { sale_id: 'sale' }, error: null }; } } } });
  await sales.completeSale({ organizationId: 'org', branchId: 'branch', customerId: 'customer', basket: tracked(), paymentMethod: 'CASH', total: 120 });
  assert.equal(calls[0].name, 'complete_pos_sale_with_customer');
  assert.deepEqual(plain(calls[0].args.p_items), [{ product_id: product.id, quantity: 1, product_serial_ids: [device.id] }]);
  assert.equal(calls[0].args.p_organization_id, 'org');
  assert.equal(calls[0].args.p_branch_id, 'branch');
  assert.equal(tracked()[0].identifiers[0].imei, device.imei);
  assert.equal(JSON.stringify(calls).includes(legacy.id), false);
});
test('missing, duplicate, mismatched and malformed selections fail before RPC', () => {
  assert.throws(() => addBasketProduct([], product), /Select a device/);
  assert.throws(() => checkoutItems([{ ...tracked()[0], identifiers: [] }]), /exactly one/);
  assert.throws(() => checkoutItems([{ ...tracked()[0], quantity: 2 }]), /exactly one/);
  assert.throws(() => addBasketProduct([], product, [device, device]), /only once/);
  assert.throws(() => checkoutItems([...tracked(), { ...tracked()[0], id: ordinary.id }]), /only once/);
  assert.throws(() => addBasketProduct([], product, [legacy]), /15 digits/);
  assert.throws(() => addBasketProduct([], product, [{ ...device, id: 'not-uuid' }]), /invalid/);
});
test('multi-unit tracked quantities follow explicit selection and predictable removal', () => {
  let basket = addBasketProduct(tracked(), product, [second]);
  assert.equal(basket[0].quantity, 2);
  assert.deepEqual(plain(basket[0].identifiers), [device, second]);
  const minus = decreaseBasketProduct(basket, product.id);
  assert.equal(minus[0].quantity, 1);
  assert.equal(minus[0].identifiers[0].id, device.id);
  basket = decreaseBasketProduct(basket, product.id, device.id);
  assert.equal(basket[0].identifiers[0].id, second.id);
  assert.equal(decreaseBasketProduct(basket, product.id, second.id).length, 0);
});
test('serialized-only uses independent serial; ordinary quantities and payload remain unchanged', () => {
  const serialProduct = { ...product, requires_imei: false };
  const serial = { ...device, imei: null, serial_number: 'SN-1' };
  assert.equal(addBasketProduct([], serialProduct, [serial])[0].quantity, 1);
  assert.throws(() => addBasketProduct([], serialProduct, [device]), /no serial number/);
  const basket = addBasketProduct(addBasketProduct([], ordinary), ordinary);
  assert.deepEqual(plain(checkoutItems(basket)), [{ product_id: ordinary.id, quantity: 2 }]);
  assert.throws(() => addBasketProduct([], ordinary, [serial]), /Ordinary products/);
});
test('POS lookups use scoped sales RPCs without browser inventory access', async () => {
  const calls = [];
  const service = load('lib/services/pos.ts', { '@/lib/supabase/client': { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: [], error: null }; } } } });
  await service.searchPosProducts('org', 'branch', 'phone');
  await service.getPosIdentifiers('org', 'branch', product.id);
  assert.equal(calls[0].name, 'search_pos_products');
  assert.equal(calls[1].name, 'get_pos_identifiers');
  assert.deepEqual(plain(calls[1].args), { p_organization_id: 'org', p_branch_id: 'branch', p_product_id: product.id });
  assert.doesNotMatch(read('lib/services/pos.ts'), /\.from\(/);
});
function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
// Small hook harness executes actual component event/effect callbacks, not a
// separate model of basket or selector behaviour.
function hooks() {
  const state = []; let cursor = 0; const effects = [];
  return { state, effects, reset() { cursor = 0; }, react: { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useMemo: fn => fn(), useEffect: fn => effects.push(fn), useRef: value => ({ current: value }),
  } };
}
test('provider opens selection for Add and +, and only confirmation changes tracked quantity', () => {
  const h = hooks();
  const Selector = () => null;
  const { PosProvider } = load('components/pos/pos-provider.tsx', { react: h.react, '@/components/pos/identifier-selector': { IdentifierSelector: Selector } });
  const render = () => { h.reset(); return PosProvider({ children: null }); };
  let tree = render(); tree.props.value.addProduct(product);
  tree = render(); assert.equal(tree.props.value.basket.length, 0);
  nodes(tree).find(node => node.type === Selector).props.onConfirm([device]);
  tree = render(); assert.equal(tree.props.value.basket[0].identifiers[0].id, device.id);
  tree.props.value.increaseQuantity(product.id);
  tree = render(); assert.equal(tree.props.value.basket[0].quantity, 1);
  nodes(tree).find(node => node.type === Selector).props.onConfirm([second]);
  tree = render(); assert.equal(tree.props.value.basket[0].quantity, 2);
  tree.props.value.resetSale();
  tree = render(); assert.equal(tree.props.value.basket.length, 0);
  assert.equal(nodes(tree).some(node => node.type === Selector), false);
});
test('selector excludes malformed legacy rows and ignores late responses after cleanup', async () => {
  const h = hooks(); const pending = [];
  const { IdentifierSelector } = load('components/pos/identifier-selector.tsx', {
    react: h.react,
    '@/components/auth-provider': { useAuth: () => ({ organization: { id: 'org' }, branch: { id: 'branch' } }) },
    '@/components/ui/app-dialog': load('components/ui/app-dialog.tsx'),
    '@/lib/services/pos': { getPosIdentifiers: () => new Promise(resolve => pending.push(resolve)) },
  });
  const props = { product, excludedIds: [], remainingQuantity: 3, onConfirm: () => {}, onClose: () => {} };
  IdentifierSelector(props); const cleanup = h.effects[0]();
  pending[0]([device, legacy]); await new Promise(resolve => setImmediate(resolve));
  h.reset(); const tree = IdentifierSelector(props);
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /123456789098765/); assert.doesNotMatch(markup, /3344435667/);
  assert.match(markup, /max-h-\[92vh\]/);
  cleanup(); const cancel = h.effects[1](); cancel();
  pending[1]([second]); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state[0].length, 0); // Cleanup prevented late data repopulation.
});
test('workspace key remounts basket and selector; switching hides children and search cancels stale responses', () => {
  const layout = read('app/(app)/layout.tsx');
  assert.match(layout, /if \(loading \|\| switchingContext \|\| accessLoading\)/);
  assert.match(layout, /<main key=\{`\$\{organization\?\.id \?\? "none"\}:\$\{branch\?\.id \?\? "none"\}`\}/);
  assert.match(read('components/pos/product-search.tsx'), /if \(!cancelled\) setResults\(data\)/);
});
test('receipt service reads scoped immutable evidence and never reconstructs current serial ownership', async () => {
  const calls = [];
  const data = {
    sales: { id: 'sale', total_amount: 120, organizations: { name: 'Shop' }, branches: { name: 'Main' } },
    sale_items: [{ id: 'line', product_id: product.id, quantity: 1, unit_price: 120, line_total: 120, products: { name: 'Phone', sku: 'PHONE' } },
      { id: 'historical', product_id: ordinary.id, quantity: 1, unit_price: 1, line_total: 1 }],
    sale_item_serials: [{ sale_item_id: 'line', product_serial_id: device.id, imei_snapshot: device.imei, serial_number_snapshot: 'ORIGINAL-SERIAL' }], payments: [],
  };
  const supabase = { from(table) { const call = { table, filters: [] }; calls.push(call);
    const q = { select() { return q; }, eq(...args) { call.filters.push(args); return q; }, order() { return q; }, single() { return q; }, then(resolve) { return Promise.resolve({ data: data[table], error: null }).then(resolve); } }; return q;
  } };
  const receipt = await load('lib/services/receipt.ts', { '@/lib/supabase/client': { supabase } }).getReceipt('sale', { organizationId: 'org', branchId: 'branch' });
  assert.equal(receipt.items[0].identifiers[0].imei_snapshot, device.imei);
  assert.equal(receipt.items[1].identifiers.length, 0);
  assert.deepEqual(calls.find(c => c.table === 'sale_item_serials').filters, [['sale_id', 'sale'], ['organization_id', 'org'], ['branch_id', 'branch']]);
  assert.equal(calls.some(c => c.table === 'product_serials'), false);
});
test('preview renders escaped immutable identifiers inside the same content used for print', () => {
  const h = hooks();
  h.state.push({ receipt_number: 'R1', created_at: '2026-10-07', organization_name: 'Shop', branch_name: 'Main', cashier_name: 'Staff', status: 'COMPLETED', subtotal: 100, vat_amount: 20, discount_amount: 0, total_amount: 120, payments: [],
    items: [{ id: 'line', product_name: 'Phone', sku: 'PHONE', quantity: 1, unit_price: 120, line_total: 120, identifiers: [{ product_serial_id: device.id, imei_snapshot: device.imei, serial_number_snapshot: '<script>bad</script>' }] }] });
  const { ReceiptDialog } = load('components/pos/receipt-dialog.tsx', { react: h.react,
    '@/components/auth-provider': { useAuth: () => ({ organization: { id: 'org' }, branch: { id: 'branch' } }) },
    '@/lib/services/receipt': {},
  });
  const markup = renderToStaticMarkup(ReceiptDialog({ open: true, saleId: 'sale', onClose: () => {} }));
  assert.match(markup, /IMEI: <!-- -->123456789098765|IMEI: 123456789098765/);
  assert.match(markup, /&lt;script&gt;/); assert.doesNotMatch(markup, /<script>bad/);
  assert.match(read('components/pos/receipt-dialog.tsx'), /\$\{receiptRef.current.innerHTML\}/);
});
const sql = read('../../supabase/migrations/20261007010000_pos_explicit_identifiers.sql');
const checkout = sql.slice(0, sql.indexOf('-- Cashier-safe'));
test('SQL rejects missing, malformed, repeated and mismatched IDs before any sale write', () => {
  for (const guard of ["jsonb_typeof(v_item->'product_serial_ids') is distinct from 'array'", "jsonb_typeof(entry) is distinct from 'string'", 'cardinality(v_selected_ids)<>v_quantity', 'count(distinct selected_id)', 'Ordinary products cannot have selected identifiers', 'v_product_id=any(v_seen_products)']) {
    assert.ok(checkout.indexOf(guard) > 0 && checkout.indexOf(guard) < checkout.indexOf('insert into public.sales'), guard);
  }
});
test('SQL locks supplied rows deterministically; wrong scope/product/sold/reserved/malformed fail under lock', () => {
  assert.match(checkout, /where ps.id=any\(v_all_serial_ids\)\s+and ps.organization_id=p_organization_id and ps.branch_id=p_branch_id\s+order by ps.id\s+for update of ps/);
  assert.match(checkout, /v_serial.product_id is distinct from v_expected_product/);
  assert.match(checkout, /v_serial.status is distinct from 'IN_STOCK'/);
  assert.match(checkout, /v_serial.sale_id is not null or v_serial.sold_at is not null/);
  assert.match(checkout, /v_serial.imei is null or v_serial.imei !~ '\^\[0-9\]\{15\}\$'/);
  assert.match(checkout, /v_serial_count<>cardinality\(v_all_serial_ids\)/);
  assert.doesNotMatch(checkout, /skip locked|order by ps.created_at|limit v_quantity/i);
});
test('SQL sells and snapshots exactly returned supplied IDs, preserving atomic failure', () => {
  assert.match(checkout, /where ps.id=any\(v_selected_ids\)/);
  assert.match(checkout, /count\(\*\),array_agg\(id\) into v_serial_count,v_allocated_serial_ids/);
  assert.match(checkout, /v_serial_count <> v_quantity then\s+raise exception/);
  assert.match(checkout, /from public.product_serials ps where ps.id=any\(v_allocated_serial_ids\)/);
  assert.match(checkout, /returning id into v_sale_item_id/);
  assert.doesNotMatch(checkout, /exception[\s\S]{0,40}when others then\s+(return|continue)|\bcommit\s*;/i);
});
test('pricing, payments, memberships, warranty snapshots and checkout EXECUTE boundaries retained', () => {
  const previous = read('../../supabase/migrations/20260925010000_warranty_sale_evidence.sql');
  for (const marker of ['if not public.is_org_member', 'if not public.is_branch_member', 'if not public.has_permission(', 'if abs(v_payment_total - v_total)', 'update public.inventory', 'insert into public.stock_movements', 'insert into public.payments', 'insert into public.sale_items', 'select (s.completed_at at time zone org.timezone)::date', 'return jsonb_build_object(']) {
    const start = previous.indexOf(marker), current = checkout.indexOf(marker), end = marker.startsWith('if') ? 'end if;' : ';';
    assert.ok(start >= 0 && current >= 0, marker);
    assert.equal(checkout.slice(current, checkout.indexOf(end, current)), previous.slice(start, previous.indexOf(end, start)), marker);
  }
  assert.match(checkout, /revoke all on function public.complete_pos_sale[\s\S]*from public,anon,authenticated,service_role/);
  assert.match(checkout, /grant execute on function public.complete_pos_sale[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /create or replace function public.complete_pos_sale_with_customer|alter table|create policy|drop policy/i);
});
test('lookup RPCs require sales.create without inventory.view and return only scoped public fields', () => {
  const lookup = sql.slice(sql.indexOf('-- Cashier-safe'));
  assert.equal((lookup.match(/public.has_permission\('sales.create',p_organization_id,p_branch_id\)/g) || []).length, 2);
  assert.equal((lookup.match(/auth.uid\(\) is null/g) || []).length, 2);
  assert.match(lookup, /returns table\(id uuid,serial_number text,imei text\)/);
  assert.match(lookup, /ps.organization_id=p_organization_id and ps.branch_id=p_branch_id/);
  assert.match(lookup, /ps.product_id=p_product_id and ps.status='IN_STOCK'/);
  assert.match(lookup, /ps.imei ~ '\^\[0-9\]\{15\}\$'/);
  assert.doesNotMatch(lookup, /has_permission\('inventory.view'|average_cost|unit_cost/);
  assert.equal((lookup.match(/security definer set search_path=''/g) || []).length, 2);
});
