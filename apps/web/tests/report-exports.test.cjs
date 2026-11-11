const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const ExcelJS = require('exceljs');
const root = path.resolve(__dirname, '..');

function loader(supabase) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } }).outputText;
    new Function("module", "exports", "require", code)(module, module.exports, function(name) {
        if (name === '@/lib/supabase/client') return { supabase };
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
        return require(name);
      });
    return module.exports;
  }
  return load;
}

function harness(tables, { finance = false, permitted = true, cap = 1000 } = {}) {
  const calls = [];
  const supabase = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'has_permission') return { data: permitted && (args.target_permission_key !== 'finance.view' || finance), error: null };
      assert.equal(name, 'get_cost_projection');
      return { data: finance ? args.p_ids.map(id => ({ id, cost: 7.5 })) : [], error: null };
    },
    from(table) {
      let rows = [...(tables[table] ?? [])], offset = 0, size = cap;
      const call = { table, filters: [], orders: [] }; calls.push(call);
      const query = {
        select(columns, options) { call.columns = columns; call.exact = options?.count === 'exact'; return query; },
        eq(key, value) { call.filters.push([key, value]); rows = rows.filter(row => row[key] === value); return query; },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
        gte(key, value) { rows = rows.filter(row => row[key] >= value); return query; },
        lt(key, value) { rows = rows.filter(row => row[key] < value); return query; },
        ilike(key, value) { rows = rows.filter(row => row[key].includes(value.slice(1, -1))); return query; },
        order(key, options) { call.orders.push([key, options]); return query; },
        range(start, end) { offset = start; size = Math.min(cap, end - start + 1); return query; },
        limit(limit) { size = limit; return query; },
        then(resolve, reject) { return Promise.resolve({ data: rows.slice(offset, offset + size), count: call.exact ? rows.length : null, error: null }).then(resolve, reject); },
      }; return query;
    },
  };
  return { load: loader(supabase), calls };
}
const request = { kind: 'sales', organizationId: 'org', organizationName: 'Test Shop', branchId: 'main', branchName: 'Main', startDate: '2026-06-01', endDate: '2026-06-01' };
const base = { id: '1', organization_id: 'org', branch_id: 'main', created_at: '2026-06-01T10:00:00Z' };
const sale = { ...base, status: 'COMPLETED', receipt_number: '000001', completed_at: base.created_at, total_amount: 12.5, subtotal: 12.5, vat_amount: 0, discount_amount: 0, payments: [{ id: 'p', amount: 12.5, payment_method: 'CASH' }], customers: null, profiles: { id: 'cashier', full_name: 'Cashier' }, branches: { id: 'main', name: 'Main' } };
const inventory = { ...base, quantity_on_hand: 3, quantity_available: 2, products: { name: 'Phone', sku: '00012', retail_price: 10, categories: { name: 'Phones' }, brands: { name: 'Brand' } } };
const movement = { ...base, products: { name: 'Phone' }, quantity: -1, movement_type: 'SALE', reference: '000001' };
const build = (h, input = request, guard = () => {}) => h.load('lib/exports/report-adapters.ts').buildReport(input, guard);

test('sales export retrieves 601 records and original totals, including refunded sales', async () => {
  const h = harness({ sales: Array.from({ length: 601 }, (_, index) => ({ ...sale, id: String(index), status: index % 2 ? 'REFUNDED' : 'COMPLETED' })) });
  const report = await build(h);
  assert.equal(report.rows.length, 601); assert.equal(report.totals[1].value, 7512.5);
  assert.equal(h.calls.filter(c => c.table).length, 3);
  assert.ok(report.rows.some(row => row[6] === 'REFUNDED'));
  assert.match(report.notes[0], /NO_REFUND/); assert.match(report.notes[0], /partial returns/);
});

for (const [kind, table, fixture] of [['inventory', 'inventory', inventory], ['movements', 'stock_movements', movement]]) {
  test(`${kind} paginates, scopes and denies cashier costs`, async () => {
    const h = harness({ [table]: [...Array.from({ length: 520 }, (_, i) => ({ ...fixture, id: String(i) })), { ...fixture, id: 'foreign', organization_id: 'other' }, { ...fixture, id: 'west', branch_id: 'west' }] });
    const report = await build(h, { ...request, kind });
    assert.equal(report.rows.length, 520);
    assert.equal(report.columns.some(c => /cost|value/i.test(c.title)), false);
    for (const call of h.calls.filter(c => c.table)) {
      assert.ok(call.filters.some(([k,v]) => k === 'organization_id' && v === 'org'));
      assert.ok(call.filters.some(([k,v]) => k === 'branch_id' && v === 'main'));
      assert.ok(call.orders.some(([k]) => k === 'id'));
    }
  });
  test(`${kind} includes only RPC-authorised finance values for administrator`, async () => {
    const h = harness({ [table]: [fixture] }, { finance: true });
    const report = await build(h, { ...request, kind });
    assert.ok(report.columns.some(c => /cost/i.test(c.title)));
    assert.ok(report.rows[0].includes(7.5));
    if (kind === 'inventory') assert.equal(report.totals.at(-1).value, 22.5);
  });
}

test('UK date ranges include BST midnight, exclude next day and handle DST transitions', async () => {
  const { dateBounds } = loader()('lib/exports/report-model.ts');
  assert.equal(dateBounds('2026-06-01', '2026-06-01').start, '2026-05-31T23:00:00.000Z');
  for (const [day, hours] of [['2026-03-29', 23], ['2026-10-25', 25]]) {
    const b = dateBounds(day, day); assert.equal((Date.parse(b.end) - Date.parse(b.start)) / 3600000, hours);
  }
  assert.throws(() => dateBounds('2026-02-30', '2026-03-01'));
  assert.throws(() => dateBounds('2026-06-02', '2026-06-01'));
  const times = ['2026-05-31T22:59:59Z', '2026-05-31T23:00:00.000Z', '2026-06-01T22:59:59Z', '2026-06-01T23:00:00.000Z'];
  const h = harness({ sales: times.map((completed_at, i) => ({ ...sale, id: String(i), completed_at })) });
  assert.equal((await build(h)).rows.length, 2);
});

test('unauthorised and missing workspace export requests fail', async () => {
  await assert.rejects(build(harness({}, { permitted: false })), /permission/);
  await assert.rejects(build(harness({}), { ...request, branchId: '' }), /organisation and branch/);
});
test('empty datasets produce zero summaries and incomplete or excessive datasets fail', async () => {
  assert.equal((await build(harness({}))).totals[0].value, 0);
  await assert.rejects(build(harness({ sales: Array.from({ length: 300 }, (_, i) => ({ ...sale, id: String(i) })) }, { cap: 100 })), /every matching record/);
  await assert.rejects(build(harness({ sales: Array.from({ length: 5001 }, (_, i) => ({ ...sale, id: String(i) })) })), /exceeds 5,000/);
});
test('workspace invalidation cancels even an A -> B -> A export', async () => {
  const session = loader()('lib/exports/export-session.ts').createExportSession();
  const guard = session.start(); session.invalidate(); session.invalidate();
  assert.throws(guard, /changed/);
  await assert.rejects(build(harness({ sales: [sale] }), request, guard), /changed/);
});
test('paging rejects changed counts and duplicate records', async () => {
  const collect = loader()('lib/services/export-pagination.ts').collectExportRows;
  await assert.rejects(collect(async page => {
    page.reportCount(page.offset ? 251 : 300);
    return Array.from({ length: 250 }, (_, id) => ({ id: String(id) }));
  }, () => {}), /changed/);
  await assert.rejects(collect(async page => { page.reportCount(2); return [{ id: 'a' }, { id: 'a' }]; }, () => {}), /changed/);
});

test('real XLSX preserves numeric money, UK dates, literal formulas and zero-prefixed identifiers', async () => {
  const h = harness({ sales: [{ ...sale, customers: { first_name: '=HYPERLINK("bad")', last_name: '' } }] });
  const report = await build(h);
  const blob = await h.load('lib/exports/excel.ts').renderExcel(report);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await blob.arrayBuffer());
  const sheet = workbook.worksheets[0];
  const heading = [...Array(sheet.rowCount)].map((_,i) => sheet.getRow(i+1)).find(r => r.getCell(1).value === 'Transaction date (UK)');
  const row = sheet.getRow(heading.number + 1);
  assert.equal(row.getCell(2).value, '000001'); assert.equal(row.getCell(3).value, '=HYPERLINK("bad")');
  assert.equal(row.getCell(3).type, ExcelJS.ValueType.String);
  assert.equal(row.getCell(6).value, 12.5); assert.ok(row.getCell(1).value instanceof Date);
  assert.equal(row.getCell(1).value.getUTCHours(), 11);
  assert.equal(sheet.views[0].ySplit, heading.number); assert.ok(sheet.autoFilter);
});
test('real PDF has A4 landscape pages, repeated headings and page numbers for 180 rows', async () => {
  const h = harness({ sales: Array.from({ length: 180 }, (_, i) => ({ ...sale, id: String(i) })) });
  const report = await build(h); const blob = h.load('lib/exports/pdf.ts').renderPdf(report);
  const text = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  const pages = (text.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages > 1); assert.ok((text.match(/Sale status/g) || []).length >= pages - 1);
  assert.ok(text.includes(`Page ${pages} of ${pages}`)); assert.ok(Math.abs(Number(text.match(/\/MediaBox \[0 0 ([\d.]+)/)[1]) - 841.89) < 0.01);
  assert.ok(text.includes('Original sales total'));
});


test('PDF rejects unsupported scripts explicitly while Excel preserves them', async () => {
  const name = String.fromCodePoint(0x6d4b, 0x8bd5);
  const h = harness({ sales: [{ ...sale, customers: { first_name: name, last_name: '' } }] });
  const report = await build(h);
  assert.throws(() => h.load('lib/exports/pdf.ts').renderPdf(report), /Download Excel/);
  const blob = await h.load('lib/exports/excel.ts').renderExcel(report);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await blob.arrayBuffer());
  let found = false;
  workbook.worksheets[0].eachRow(row => row.eachCell(cell => { if (cell.value === name) found = true; }));
  assert.ok(found);
});

test('workspace changes during retrieval invalidate the pending result', async () => {
  const session = loader()('lib/exports/export-session.ts').createExportSession();
  const guard = session.start();
  const collect = loader()('lib/services/export-pagination.ts').collectExportRows;
  await assert.rejects(collect(async page => {
    page.reportCount(1); session.invalidate(); return [{ id: 'old-workspace' }];
  }, guard), /changed/);
});
