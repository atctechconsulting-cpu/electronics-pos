const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const scope = { organizationId: 'org', branchId: 'main' };
const original = {
  id: 'sale', organization_id: 'org', branch_id: 'main', status: 'COMPLETED',
  receipt_number: 'REC-ORIGINAL', completed_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T09:59:00Z',
  subtotal: '100.00', vat_amount: '20.00', discount_amount: '0.00', total_amount: '120.00',
  customers: { id: 'customer', customer_code: 'C1', first_name: 'Alex', last_name: 'Smith', company_name: null, phone: '123' },
  profiles: { id: 'cashier', full_name: 'Original Cashier' }, branches: { id: 'main', name: 'Main' },
  organizations: { id: 'org', name: 'Shop' },
  payments: [{ id: 'payment', payment_method: 'CARD', amount: 120, reference: 'original-payment' }],
};

// Execute the real service against a read-only query double that applies its
// filters to fixtures. This tests application scoping, not deployed RLS.
function harness(file, tables) {
  const calls = [];
  const supabase = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    let rows = [...(tables[table] ?? [])]; let single = false;
    const query = {
      select() { return query; },
      eq(key, value) { call.filters.push([key, value]); rows = rows.filter(row => row[key] === value); return query; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
      ilike(key, pattern) { rows = rows.filter(row => row[key].toLowerCase().includes(pattern.slice(1, -1).toLowerCase())); return query; },
      order(key, options) { call.order = [key, options]; return query; },
      limit(value) { call.limit = value; rows = rows.slice(0, value); return query; },
      single() { single = true; return query; },
      then(resolve, reject) { return Promise.resolve({ data: single ? rows[0] : rows, error: single && !rows.length ? { message: 'Not found' } : null }).then(resolve, reject); },
    };
    return query;
  } };
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console: { error() {} }, require(name) {
    assert.equal(name, '@/lib/supabase/client'); return { supabase };
  } });
  return { service: module.exports, calls };
}

for (const [scenario, status] of [
  ['normal completed sale', 'COMPLETED'],
  ['partially returned sale', 'COMPLETED'],
  ['fully returned sale', 'REFUNDED'],
  ['full NO_REFUND return', 'REFUNDED'],
  ['full non-restocked return', 'REFUNDED'],
]) {
  test(`${scenario} remains visible without reading restricted returns`, async () => {
    // These are the sale statuses produced by the existing return workflow.
    const h = harness('lib/services/sales-history.ts', { sales: [{ ...original, status }] });
    const rows = await h.service.getSalesHistory(scope);
    assert.equal(rows.length, 1); assert.equal(rows[0].status, status);
    assert.deepEqual(h.calls.map(call => call.table), ['sales']);
  });
}

test('DRAFT, HELD and CANCELLED remain excluded', async () => {
  const h = harness('lib/services/sales-history.ts', { sales: ['DRAFT', 'HELD', 'CANCELLED', 'COMPLETED', 'REFUNDED'].map(status => ({ ...original, status })) });
  assert.deepEqual(plain((await h.service.getSalesHistory(scope)).map(row => row.status)), ['COMPLETED', 'REFUNDED']);
});

test('original evidence, ordering, limit and receipt search are preserved', async () => {
  const source = { ...original, status: 'REFUNDED' }; const before = JSON.stringify(source);
  const h = harness('lib/services/sales-history.ts', { sales: [source] });
  const [sale] = await h.service.getSalesHistory({ ...scope, search: ' REC-ORIGINAL ' });
  for (const key of ['receipt_number', 'completed_at', 'created_at']) assert.equal(sale[key], original[key]);
  for (const key of ['subtotal', 'vat_amount', 'discount_amount', 'total_amount']) assert.equal(sale[key], Number(original[key]));
  assert.deepEqual(plain(sale.customer), original.customers);
  assert.deepEqual(plain(sale.cashier), original.profiles);
  assert.deepEqual(plain(sale.payments), original.payments);
  assert.deepEqual(plain(h.calls[0].order), ['completed_at', { ascending: false, nullsFirst: false }]);
  assert.equal(h.calls[0].limit, 100); assert.equal(JSON.stringify(source), before);
});

test('history excludes other organisations and branches and fails closed without scope', async () => {
  const h = harness('lib/services/sales-history.ts', { sales: [original, { ...original, id: 'other-org', organization_id: 'other' }, { ...original, id: 'west', branch_id: 'west' }] });
  assert.deepEqual(plain((await h.service.getSalesHistory(scope)).map(row => row.id)), ['sale']);
  assert.equal((await h.service.getSalesHistory({ ...scope, organizationId: '' })).length, 0);
  assert.equal((await h.service.getSalesHistory({ ...scope, branchId: '' })).length, 0);
  assert.equal(h.calls.length, 1);
});

for (const [file, method] of [['sale-details', 'getSaleDetails'], ['receipt', 'getReceipt']]) {
  test(`refunded ${file} remains readable with original evidence and scoped queries`, async () => {
    const h = harness(`lib/services/${file}.ts`, { sales: [{ ...original, status: 'REFUNDED' }], payments: original.payments.map(p => ({ ...p, sale_id: 'sale', organization_id: 'org', branch_id: 'main' })) });
    const result = await h.service[method]('sale', scope);
    assert.equal(result.status, 'REFUNDED'); assert.equal(result.receipt_number, original.receipt_number);
    assert.equal(result.total_amount, 120); assert.equal(result.completed_at, original.completed_at);
    assert.equal(result.payments[0].reference, 'original-payment');
    for (const call of h.calls) {
      assert.ok(call.filters.some(([key, value]) => key === 'organization_id' && value === 'org'));
      assert.ok(call.filters.some(([key, value]) => key === 'branch_id' && value === 'main'));
    }
    await assert.rejects(h.service[method]('sale', { ...scope, branchId: 'west' }), /Not found/);
    await assert.rejects(h.service[method]('sale', { ...scope, organizationId: 'other' }), /Not found/);
  });
}

test('original receipt reprint path remains available independently of refund status', () => {
  const detail = read('app/(app)/sales/[saleId]/page.tsx');
  assert.match(detail, /onClick=\{\(\) => setReceiptOpen\(true\)\}/);
  assert.match(detail, /<ReceiptDialog[\s\S]*saleId=\{sale.id\}/);
  const receipt = read('components/pos/receipt-dialog.tsx');
  assert.match(receipt, /receiptRef.current.innerHTML/);
  assert.match(receipt, /window.print\(\)/);
  assert.doesNotMatch(receipt, /status\s*[!=]==?\s*["'](?:REFUNDED|COMPLETED)["']/);
});
