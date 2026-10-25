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
  vm.runInNewContext(code, { module, exports: module.exports, alert: mocks.alert ?? (() => {}), require: name => {
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
    react: { ...React, useRef: () => ({ current: null }), useEffect: () => {}, useState: () => { const i = index++; return [states[i], value => { if (i === 4) changed = value; }]; } },
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

const receivingValidation = load('lib/validations/receiving-identifiers.ts');
const { splitReceivingIdentifiers, validateReceivingIdentifiers } = receivingValidation;
const plain = value => JSON.parse(JSON.stringify(value));
test('bulk parsing supports Unix, Windows and Excel column line endings without changing values', () => {
  for (const separator of ['\n', '\r\n', '\r']) {
    const raw = splitReceivingIdentifiers(` ${imei} ${separator}012345678901234${separator}`);
    const result = validateReceivingIdentifiers(raw, 2, true);
    assert.equal(result.valid, true);
    assert.deepEqual(plain(result.values), [imei, '012345678901234']);
    assert.equal(raw[0], ` ${imei} `);
    assert.equal(raw.at(-1), '');
  }
});
test('only trailing blanks are ignored; leading and interior blanks preserve one-based errors', () => {
  const raw = ['', imei, '  ', '012345678901234', '', '   '];
  const result = validateReceivingIdentifiers(raw, 2, true);
  assert.equal(result.valid, false);
  assert.equal(result.entered, 2);
  assert.equal(result.invalidCount, 2);
  assert.deepEqual(plain(result.errors.map(error => error.line)), [1, 3]);
  assert.equal(result.values.length, 4);
  assert.equal(raw.length, 6);
  assert.equal(validateReceivingIdentifiers([imei, '', ' '], 1, true).valid, true);
});
test('malformed pasted IMEIs are rejected, never padded, shortened or converted', () => {
  for (const value of ['123', '1234567890987650', '1.23457E+14', '12345678909876X', '123456789098765\t012345678901234']) {
    const result = validateReceivingIdentifiers([value], 1, true);
    assert.equal(result.valid, false);
    assert.equal(result.values[0], value);
    assert.equal(result.errors[0].line, 1);
  }
});
test('serial validation retains case, rejects blanks and reports exact duplicate line references', () => {
  assert.equal(validateReceivingIdentifiers([' SN-AbC ', 'sn-abc'], 2, false).valid, true);
  assert.equal(validateReceivingIdentifiers(['  '], 1, false).valid, false);
  const result = validateReceivingIdentifiers(['SN-AbC', '', ' SN-AbC ', 'SN-AbC'], 3, false);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(plain(result.errors.filter(error => error.kind === 'duplicate').map(error => [error.line, error.originalLine])), [[3, 1], [4, 1]]);
  assert.equal(result.valid, false);
});
test('exact positive integer quantity required; 50 and 100 identifier receipts validate', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 2]) assert.equal(validateReceivingIdentifiers([imei], quantity, true).valid, false);
  for (const count of [50, 100]) {
    const values = Array.from({ length: count }, (_, index) => String(100000000000000 + index));
    const result = validateReceivingIdentifiers(splitReceivingIdentifiers(values.join('\r\n') + '\r\n'), count, true);
    assert.equal(result.valid, true);
    assert.equal(result.entered, count);
    assert.equal(result.duplicateCount, 0);
    assert.equal(validateReceivingIdentifiers(values, count - 1, true).valid, false);
  }
});
function receivingUi({ values = [imei], quantity = 1, tracked = true } = {}) {
  const states = [true, [{ id: 'product', requires_imei: tracked, is_serialized: tracked }], [], false,
    { supplier_id: '', product_id: 'product', quantity, unit_cost: 10, reference: 'UAT', notes: '', serial_numbers: values }, 'individual'];
  const refs = []; const effectDeps = []; let cursor = 0, refIndex = 0, effectIndex = 0; let pending = [];
  const calls = []; const alerts = []; let focusCount = 0;
  const mocks = {
    alert: message => alerts.push(message),
    react: { ...React,
      useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
      useRef: initial => { const index = refIndex++; return refs[index] ??= { current: initial }; },
      useEffect: (effect, deps) => { const index = effectIndex++; const previous = effectDeps[index];
        if (!previous || deps.some((value, i) => !Object.is(previous[i], value))) { pending.push(effect); effectDeps[index] = deps; } },
    },
    '@/components/auth-provider': { useAuth: () => ({ organization: organizationMock, branch: branchMock }) },
    '@/lib/services/stock-receiving': { receiveStock: async input => calls.push(input) },
    '@/lib/services/inventory-lookups': { getInventoryProducts: async () => states[1] },
    '@/lib/services/lookups': { getSupplierOptions: async () => [] },
    '@/components/ui/app-dialog': load('components/ui/app-dialog.tsx'),
  };
  const organizationMock = { id: 'org' }, branchMock = { id: 'branch' };
  const { ReceiveStockDialog } = load('components/inventory/receive-stock-dialog.tsx', mocks);
  function render() {
    cursor = 0; refIndex = 0; effectIndex = 0; pending = [];
    const tree = ReceiveStockDialog({ onSuccess: () => {} });
    const all = nodes(tree);
    const textarea = all.find(node => node.props?.id === 'receiving-bulk-identifiers');
    if (textarea) textarea.props.ref.current = { focus: () => focusCount++ };
    for (const effect of pending) effect();
    return { tree, all, textarea,
      toggle: mode => all.find(node => node.type === 'button' && node.props.children === (mode === 'bulk' ? 'Bulk & Scanner' : 'Individual')).props.onClick(),
      submit: () => all.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
      disabled: nodes(all.find(node => node.props?.title === 'Receive Stock').props.footer).find(node => node.props?.type === 'submit').props.disabled,
    };
  }
  return { render, states, calls, alerts, focusCount: () => focusCount };
}
test('Individual -> Bulk -> Individual is lossless and bulk typing does not steal focus', () => {
  const ui = receivingUi({ values: [` ${imei} `, '012345678901234'], quantity: 2 });
  ui.render().toggle('bulk');
  let view = ui.render();
  assert.equal(view.textarea.props.value, ` ${imei} \n012345678901234`);
  assert.equal(ui.focusCount(), 1);
  view.textarea.props.onChange({ target: { value: `${imei}\n012345678901234\n` } });
  view = ui.render(); assert.equal(ui.focusCount(), 1);
  assert.equal(view.textarea.props.value, `${imei}\n012345678901234\n`);
  view.toggle('individual'); view = ui.render();
  assert.equal(view.all.find(node => node.props?.id === 'receiving-identifier-0').props.value, imei);
  assert.equal(view.all.find(node => node.props?.id === 'receiving-identifier-1').props.value, '012345678901234');
  view.toggle('bulk'); view = ui.render();
  assert.equal(view.textarea.props.value, `${imei}\n012345678901234\n`);
  assert.equal(ui.focusCount(), 2);
});
test('quantity increase and decrease preserve values, expose excess and block until explicit removal', () => {
  const ui = receivingUi({ values: [imei, '012345678901234'], quantity: 2 });
  const quantityInput = view => view.all.find(node => node.type === 'input' && node.props.min === '1');
  quantityInput(ui.render()).props.onChange({ target: { value: '3' } });
  let view = ui.render(); assert.equal(ui.states[4].serial_numbers.length, 2); assert.equal(view.disabled, true);
  quantityInput(view).props.onChange({ target: { value: '1' } });
  view = ui.render(); assert.equal(ui.states[4].serial_numbers.length, 2); assert.equal(view.disabled, true);
  assert.equal(view.all.find(node => node.props?.id === 'receiving-identifier-1').props.value, '012345678901234');
  view.all.find(node => node.props?.['aria-label'] === 'Remove identifier 2').props.onClick();
  view = ui.render(); assert.equal(view.disabled, false); assert.equal(ui.states[4].serial_numbers[0], imei);
});
test('scanner Enter remains native newline and submits only on explicit form submission', async () => {
  const ui = receivingUi({ values: [], quantity: 2 });
  ui.render().toggle('bulk');
  let view = ui.render();
  assert.equal(view.textarea.props.onKeyDown, undefined);
  view.textarea.props.onChange({ target: { value: `${imei}\n` } });
  view = ui.render(); assert.equal(view.disabled, true); assert.equal(ui.calls.length, 0);
  view.textarea.props.onChange({ target: { value: `${imei}\n012345678901234\n` } });
  view = ui.render(); assert.equal(view.disabled, false); assert.equal(ui.calls.length, 0);
  await view.submit();
  assert.deepEqual(plain(ui.calls[0].serial_numbers), [imei, '012345678901234']);
  assert.equal(ui.calls[0].organization_id, 'org'); assert.equal(ui.calls[0].branch_id, 'branch');
});
test('invalid or duplicate draft blocks even a direct submit; ordinary products have no toggle', async () => {
  for (const values of [[imei, imei], ['', imei], ['bad', imei], [imei]]) {
    const ui = receivingUi({ values, quantity: 2 });
    const view = ui.render(); assert.equal(view.disabled, true);
    await view.submit(); assert.equal(ui.calls.length, 0); assert.equal(ui.alerts.length, 1);
  }
  const ui = receivingUi({ values: [], quantity: 2, tracked: false });
  const view = ui.render(); assert.equal(view.disabled, false);
  assert.equal(view.all.some(node => node.props?.['aria-label'] === 'Identifier entry mode'), false);
  await view.submit(); assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].serial_numbers.length, 0);
});
