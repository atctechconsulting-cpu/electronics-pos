// Offline service/UI execution and static SQL contracts; no deployed database writes.
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
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  } });
  return module.exports;
}
function harness(error = null, rejects = false) {
  const calls = [];
  const mocks = { '@/lib/supabase/client': { supabase: { rpc: (name, args) => ({ then(resolve, reject) {
    calls.push({ name, args });
    return (rejects ? Promise.reject(error) : Promise.resolve({ data: {}, error })).then(resolve, reject);
  } }) } } };
  return { calls, stock: load('lib/services/stock-receiving.ts', mocks).receiveStock,
    purchase: load('lib/services/purchase-orders.ts', mocks).receivePurchaseOrderGoods };
}
const input = { organization_id: 'org', branch_id: 'branch', product_id: 'product', quantity: 1, unit_cost: 10, reference: 'UAT' };
const imei = '123456789098765';
test('normal, serialized-only and both-flags IMEI receipts send scoped distinct identifiers', async () => {
  const h = harness();
  await h.stock(input);
  await h.stock({ ...input, is_serialized: true, serial_numbers: ['SN-1'] });
  await h.stock({ ...input, requires_imei: true, is_serialized: true, serial_numbers: [imei] });
  assert.equal(h.calls[0].args.p_identifiers.length, 0);
  assert.equal(h.calls[1].args.p_identifiers[0].serial_number, 'SN-1');
  assert.equal(h.calls[1].args.p_identifiers[0].imei, null);
  assert.equal(h.calls[2].args.p_identifiers[0].imei, imei);
  assert.equal(h.calls[2].args.p_identifiers[0].serial_number, null);
  for (const call of h.calls) {
    assert.equal(call.args.p_organization_id, 'org');
    assert.equal(call.args.p_branch_id, 'branch');
  }
});
test('missing required identifiers, malformed IMEI, blank reference and duplicate batch fail before RPC', async () => {
  const h = harness();
  await assert.rejects(h.stock({ ...input, is_serialized: true }), /serial number is required/);
  await assert.rejects(h.stock({ ...input, requires_imei: true, is_serialized: true }), /IMEI is required/);
  for (const value of ['12345678909876', '1234567890987650', '12345678909876X', 'legacy-bad']) {
    await assert.rejects(h.stock({ ...input, requires_imei: true, serial_numbers: [value] }), /exactly 15 digits/);
  }
  await assert.rejects(h.stock({ ...input, reference: '  ' }), /reference is required/);
  await assert.rejects(h.stock({ ...input, quantity: 2, requires_imei: true, serial_numbers: [imei, imei] }), /Duplicate identifiers/);
  assert.equal(h.calls.length, 0);
});
test('expected plain Postgres errors are readable; unknown messages/details and transport errors are hidden', async () => {
  for (const [error, expected] of [
    [{ code: 'P0001', message: `IMEI ${imei} already exists.` }, /already exists in this organisation/],
    [{ code: 'P0001', message: 'Serial number SN-1 already exists.' }, /already exists/],
    [{ code: 'P0001', message: 'An IMEI is required for Phone.' }, /IMEI is required/],
    [{ code: '23514', message: 'IMEI must contain exactly 15 digits.' }, /exactly 15 digits/],
    [{ code: 'P0001', message: 'private database internals', details: 'secret' }, /^Unable to receive stock/],
    [{ code: '23505', message: 'private constraint', details: 'secret' }, /^Unable to receive stock/],
  ]) {
    const h = harness(error);
    await assert.rejects(h.stock(input), e => expected.test(e.message) && !/private|secret/.test(e.message));
    await assert.rejects(h.purchase('po', [{ quantity: 1 }]), e => expected.test(e.message) && !/private|secret/.test(e.message));
  }
  await assert.rejects(harness(new Error('private transport'), true).stock(input), /Unable to receive stock/);
});
test('purchase service accepts IMEI-only without inventing a serial and rejects malformed IMEI', async () => {
  const h = harness();
  await h.purchase('po', [{ purchase_order_item_id: 'item', quantity: 1, identifiers: [{ imei, serial_number: null }] }]);
  assert.equal(h.calls[0].args.p_items[0].identifiers[0].imei, imei);
  assert.equal(h.calls[0].args.p_items[0].identifiers[0].serial_number, null);
  await assert.rejects(h.purchase('po', [{ quantity: 1, identifiers: [{ imei: 'invalid' }] }]), /exactly 15 digits/);
  const ui = read('components/purchases/receive-purchase-order-dialog.tsx');
  assert.match(ui, /item.requires_imei\s+\? \{\s+imei: value,\s+serial_number: null,/);
});
const migration = read('../../supabase/migrations/20260926010000_fix_receiving_identifier_contract.sql');
function sqlFunction(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('$$;', start) + 3);
}
for (const [name, oldFile] of [
  ['receive_stock', '20260909231122_harden_inventory_rbac.sql'],
  ['receive_purchase_order_goods', '20260908045948_harden_purchasing_rbac.sql'],
]) {
  test(`${name}: SQL requires serial only for non-IMEI products; mandatory valid IMEI retained`, () => {
    const sql = sqlFunction(migration, name);
    assert.match(sql, /if v_product.is_serialized\s+and not v_product.requires_imei\s+and v_serial_number is null then\s+raise exception/);
    assert.match(sql, /if v_product.requires_imei\s+and v_imei is null then\s+raise exception/);
    assert.match(sql, /if v_imei is not null and v_imei !~ '\^\[0-9\]\{15\}\$' then\s+raise exception/);
    assert.doesNotMatch(sql, /v_serial_number\s*:=\s*v_imei/);
  });
  test(`${name}: all other authorization, quantity, duplicate, locking and transaction SQL is unchanged`, () => {
    const sql = sqlFunction(migration, name);
    const reverted = sql
      .replace(/^ +and not v_product.requires_imei\n/gm, '')
      .replace(/^ +if v_imei is not null and v_imei !~ '\^\[0-9\]\{15\}\$' then\n +raise exception 'IMEI must contain exactly 15 digits\.' using errcode = '23514';\n +end if;\n\n/gm, '');
    assert.equal(reverted, sqlFunction(read('../../supabase/migrations/' + oldFile), name));
    assert.match(sql, /security definer\nset search_path = public/);
    assert.match(sql, /public.has_permission\(/);
    assert.match(sql, /for update;/);
    assert.match(sql, /already exists/);
  });
}
test('forward migration leaves legacy rows, RLS, triggers and existing EXECUTE ACLs alone', () => {
  assert.equal((migration.match(/create or replace function/g) || []).length, 2);
  assert.match(migration, /\nbegin;/);
  assert.match(migration, /\ncommit;/);
  assert.doesNotMatch(migration, /\b(drop|grant|revoke|alter)\s/i);
  assert.doesNotMatch(migration, /update public.product_serials|delete from public.product_serials/);
});
function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
test('dialog product/supplier changes clear identifiers and reference uses native required validation', () => {
  const form = { supplier_id: '', product_id: 'imei', quantity: 1, unit_cost: 10, reference: '', notes: '', serial_numbers: [imei] };
  const states = [true, [{ id: 'imei', requires_imei: true, is_serialized: true }], [], false, form];
  let index = 0;
  let changed;
  const mocks = {
    react: { ...React, useEffect: () => {}, useState: () => { const i = index++; return [states[i], value => { if (i === 4) changed = value; }]; } },
    '@/components/auth-provider': { useAuth: () => ({ organization: { id: 'org' }, branch: { id: 'branch' } }) },
    '@/lib/services/stock-receiving': { receiveStock: () => {} },
    '@/lib/services/inventory-lookups': {}, '@/lib/services/lookups': {},
    '@/components/ui/app-dialog': load('components/ui/app-dialog.tsx'),
  };
  const tree = load('components/inventory/receive-stock-dialog.tsx', mocks).ReceiveStockDialog({ onSuccess: () => {} });
  const all = nodes(tree);
  const selects = all.filter(node => node.type === 'select');
  selects[1].props.onChange({ target: { value: 'serialized' } });
  assert.equal(changed.serial_numbers.length, 0);
  selects[0].props.onChange({ target: { value: 'supplier' } });
  assert.equal(changed.product_id, '');
  assert.equal(changed.serial_numbers.length, 0);
  assert.equal(all.find(node => node.props?.placeholder === 'e.g. INV-1001').props.required, true);
  const dialog = all.find(node => node.props?.title === 'Receive Stock');
  const footer = nodes(dialog.props.footer);
  assert.equal(footer.find(node => node.type === 'button').props.form, 'receive-stock-form');
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /max-h-\[92vh\]/);
  assert.match(markup, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(markup, /shrink-0 border-t/);
});
