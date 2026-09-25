// Offline checks: node --test tests/repairs.test.cjs
// These do not execute the migration or replace PostgreSQL acceptance tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// SQL contract regressions inspect the actual unapplied migration. These are
// deliberately static: PostgreSQL transaction/trigger behavior needs DB tests.
const migration = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260923003351_repairs_v1.sql'), 'utf8');
function sqlFunction(name) {
  const start = migration.indexOf(`create function public.${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  return migration.slice(start, migration.indexOf('$$;', start));
}
const updateSql = sqlFunction('update_repair');
const statusSql = sqlFunction('change_repair_status');
const projectionSql = sqlFunction('repair_job_projection');
const outcomeRule = /repair_outcome=case when p_status='ready_for_collection' then p_outcome\s+when p_status in \('collected','cancelled'\) then repair_outcome else null end/;
const completionRule = /completed_at=case when p_status='ready_for_collection' then now\(\) when p_status not in \('collected','cancelled'\) then null else completed_at end/;

test('SQL contract: collected final charge rejects any distinct value before writing', () => {
  const guard = /if j.status='collected' and changed.final_amount is distinct from j.final_amount then\s+raise exception 'The final charge cannot be changed after collection';\s+end if;/;
  assert.match(updateSql, guard); // NULL, increases and decreases all differ.
  assert.ok(updateSql.indexOf('jsonb_populate_record') < updateSql.search(guard));
  assert.ok(updateSql.search(guard) < updateSql.indexOf('update public.repair_jobs'));
  assert.match(updateSql, /repair_lock_job\(p_org,p_branch,p_job,p_version\)/);
});
test('SQL contract: ordinary collected charge edits cannot create or erase balance', () => {
  assert.match(updateSql, /changed.final_amount is distinct from j.final_amount/);
  assert.match(updateSql, /cap:=coalesce\(changed.final_amount,changed.estimated_amount\)/);
  assert.match(updateSql, /if paid>0 and \(cap is null or cap<paid\) then/);
  assert.match(projectionSql, /'outstanding_balance',case when j.final_amount is null then null else j.final_amount-public.repair_paid_amount\(j.id\) end/);
  assert.doesNotMatch(updateSql, /(?:insert into|update|delete from) public.repair_payments/);
  assert.match(updateSql, /internal_notes=changed.internal_notes/); // Notes remain editable.
});
test('SQL contract: ready to active work clears outcome and completion', () => {
  assert.match(statusSql, outcomeRule);
  assert.match(statusSql, completionRule);
  assert.match(statusSql, /p_status not in \('diagnosing','awaiting_approval','awaiting_parts','in_repair'\)/);
  assert.match(statusSql, /A reason is required for a backwards or reopen transition/);
});
test('SQL contract: collected and cancelled reopen only into diagnosis without stale outcome', () => {
  assert.match(statusSql, /j.status in \('cancelled','collected'\) and p_status<>'diagnosing'/);
  assert.match(statusSql, outcomeRule);
  assert.match(statusSql, completionRule);
  assert.doesNotMatch(statusSql, /coalesce\(p_outcome,repair_outcome\)/);
});
test('SQL contract: only readiness accepts an outcome and requires a valid value', () => {
  assert.match(statusSql, /if p_status='ready_for_collection' then\s+if p_outcome is null or p_outcome not in/);
  assert.match(statusSql, /\('repaired','no_fault_found','unrepaired','beyond_economic_repair','customer_declined','other'\)/);
  assert.match(statusSql, /elsif p_outcome is not null then\s+raise exception 'An outcome may only be supplied when marking work ready for collection'/);
  assert.ok(statusSql.indexOf('elsif p_outcome is not null') < statusSql.indexOf('update public.repair_jobs'));
});
test('SQL contract: ready to collected preserves outcome and requires settled final charge', () => {
  assert.match(statusSql, outcomeRule);
  assert.match(statusSql, completionRule);
  assert.match(statusSql, /j.status not in \('ready_for_collection','cancelled'\)/);
  assert.match(statusSql, /j.final_amount is null or public.repair_paid_amount\(j.id\)<>j.final_amount/);
  assert.match(statusSql, /version=version\+1/);
  assert.match(statusSql, /repair_event\(j,'status_changed'/);
});
test('SQL contract: reversal after collection changes ledger balance, not final charge or status', () => {
  const reversal = sqlFunction('reverse_repair_payment');
  assert.match(reversal, /repair_lock_job\(p_org,p_branch,p_job\)/);
  assert.doesNotMatch(reversal, /j.status|final_amount\s*=/);
  assert.match(reversal, /original.amount,j.currency_code/);
  assert.match(reversal, /p_request_key,original.id,trim\(p_reason\)/);
  assert.match(reversal, /update public.repair_jobs set version=version\+1,updated_at=now\(\),updated_by=auth.uid\(\) where id=j.id/);
  assert.match(sqlFunction('repair_paid_amount'), /sum\(case when reverses_payment_id is null then amount else -amount end\)/);
  assert.match(projectionSql, /j.final_amount-public.repair_paid_amount\(j.id\)/);
});

function load(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  });
  return module.exports;
}
const validation = load('lib/validations/repair.ts');
const imeiValidation = load('lib/validations/imei.ts');
const uuid = n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const scope = { organizationId: uuid('1'), branchId: uuid('2') };
const input = {
  customer_id: uuid('3'), product_id: null, product_serial_id: null, category_id: null, brand_id: null,
  device_type: 'Phone', brand_name: 'External brand', model: 'Customer phone', imei: null, serial_number: 'SN-A',
  accessories_received: 'Charger', fault_description: 'Does not power on', physical_condition: 'Screen scratched',
  intake_notes: 'Private intake note', priority: 'normal', assigned_to: null, estimated_amount: 0, estimated_completion_at: null,
};
test('external device accepts zero estimate and no inventory links', () => {
  const parsed = validation.repairCreateSchema.parse(input);
  assert.equal(parsed.estimated_amount, 0);
  assert.equal(parsed.product_serial_id, null);
});

test('repair IMEI cases preserve independent serial numbers and readable validation errors', () => {
  for (const imei of [null, '012345678901234']) {
    const parsed = validation.parseRepairInput(validation.repairCreateSchema, { ...input, imei, serial_number: 'ABC-short-serial' });
    assert.equal(parsed.imei, imei);
    assert.equal(parsed.serial_number, 'ABC-short-serial');
  }
  for (const imei of ['12345678901234', '1234567890123456', '12345678901234X', 'ABCDEFGHIJKLMNO']) {
    assert.throws(() => validation.parseRepairInput(validation.repairCreateSchema, { ...input, imei }),
      error => error.message === 'IMEI must contain exactly 15 digits.');
  }
  assert.throws(() => validation.parseRepairInput(validation.repairCreateSchema, { ...input, fault_description: '' }),
    error => /Describe the reported fault/.test(error.message) && !/\[|"code"|"origin"/.test(error.message));
});

test('non-IMEI catalogue and linked serial repair inputs reach the scoped RPC unchanged', async () => {
  const { services, calls } = serviceHarness();
  await services.createRepair(scope, { ...input, product_id: uuid('8'), imei: null });
  await services.createRepair(scope, { ...input, product_id: uuid('8'), product_serial_id: uuid('9'), imei: '012345678901234' });
  assert.equal(calls[0].args.p_data.imei, null);
  assert.equal(calls[1].args.p_data.product_serial_id, uuid('9'));
  assert.equal(calls[1].args.p_data.imei, '012345678901234');
  assert.throws(() => services.createRepair(scope, { ...input, imei: 'legacy-bad' }),
    error => error.message === 'IMEI must contain exactly 15 digits.');
  assert.equal(calls.length, 2);
});

test('both receiving services reject malformed IMEIs before RPC and allow ordinary serials', async () => {
  const calls = [];
  const mocks = {
    '@/lib/validations/imei': imeiValidation,
    '@/lib/supabase/client': { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: {}, error: null }; } } },
  };
  const stock = load('lib/services/stock-receiving.ts', mocks);
  const purchase = load('lib/services/purchase-orders.ts', mocks);
  for (const imei of ['12345678901234', '1234567890123456', 'y6uu6rtu8']) {
    await assert.rejects(stock.receiveStock({ requires_imei: true, serial_numbers: [imei] }), /exactly 15 digits/);
    await assert.rejects(purchase.receivePurchaseOrderGoods(uuid('1'), [{ quantity: 1, identifiers: [{ imei }] }]), /exactly 15 digits/);
  }
  assert.equal(calls.length, 0);
  await stock.receiveStock({ requires_imei: true, serial_numbers: ['012345678901234'] });
  await stock.receiveStock({ is_serialized: true, serial_numbers: ['SN-short'] });
  await purchase.receivePurchaseOrderGoods(uuid('1'), [{ quantity: 1, identifiers: [{ imei: '012345678901234' }, { serial_number: 'SN-short' }] }]);
  assert.equal(calls[0].args.p_identifiers[0].imei, '012345678901234');
  assert.equal(calls[1].args.p_identifiers[0].serial_number, 'SN-short');
  assert.equal(calls.length, 3);
});

const forwardSql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260923232804_fix_repair_intake_and_imei_writes.sql'), 'utf8');
test('forward SQL contract: repair variables cannot collide with table aliases', () => {
  const declaration = forwardSql.match(/declare([\s\S]*?)\nbegin/)[1];
  const variables = [...declaration.matchAll(/^\s+(\w+)\s+(?:public\.|uuid|text)/gm)].map(match => match[1]);
  assert.ok(variables.every(name => name.startsWith('v_')));
  for (const name of variables) assert.doesNotMatch(forwardSql, new RegExp(`from public\\.\\w+ ${name}\\b`));
  assert.match(forwardSql, /public.categories cat where cat.id=v_category_id/);
  assert.match(forwardSql, /select cust\.\* into v_customer/);
  assert.match(forwardSql, /security definer set search_path = ''/);
  assert.match(forwardSql, /public.repair_assert_access\(p_org,p_branch,true\)/);
  assert.match(forwardSql, /public.has_permission\('inventory.view',p_org,v_serial.branch_id\)/);
  assert.match(forwardSql, /v_imei:=case when v_serial_id is not null then v_serial.imei/);
  assert.match(forwardSql, /v_imei is not null and v_imei !~ '\^\[0-9\]\{15\}\$'/);
  assert.doesNotMatch(forwardSql, /drop function|grant .*create_repair|revoke .*create_repair/i);
});

test('forward SQL contract: all inserts and changed IMEIs validated, legacy rows never rewritten', () => {
  assert.match(forwardSql, /after insert or update on public.product_serials/);
  assert.match(forwardSql, /if TG_OP='UPDATE' then\s+if NEW.imei is not distinct from OLD.imei then return NEW; end if;/);
  assert.match(forwardSql, /NEW.imei is not null and NEW.imei !~ '\^\[0-9\]\{15\}\$'/);
  assert.doesNotMatch(forwardSql, /(?:update|insert into|delete from) public.product_serials\b|NEW\.imei\s*:=|add constraint|validate constraint/i);
  assert.match(forwardSql, /revoke all on function public.enforce_product_serial_imei\(\) from public,anon,authenticated,service_role/);
});
test('invalid amounts, identifiers and missing customer/fault fail validation', () => {
  for (const change of [{ estimated_amount: -1 }, { estimated_amount: Infinity }, { estimated_amount: NaN },
    { estimated_amount: 1.005 }, { imei: '123' }, { customer_id: '' }, { fault_description: '' }]) {
    assert.equal(validation.repairCreateSchema.safeParse({ ...input, ...change }).success, false);
  }
});
test('final charge distinguishes zero from not agreed', () => {
  const fields = { priority: 'normal', estimated_amount: null, estimated_completion_at: null,
    parts_notes: null, labour_notes: null, internal_notes: null, customer_notes: null };
  assert.equal(validation.repairUpdateSchema.parse({ ...fields, final_amount: null }).final_amount, null);
  assert.equal(validation.repairUpdateSchema.parse({ ...fields, final_amount: 0 }).final_amount, 0);
});
test('status guidance does not expose completed or premature collection', () => {
  assert.equal(validation.repairStatuses.includes('completed'), false);
  assert.equal(validation.availableRepairStatuses('received').includes('collected'), false);
  assert.equal(validation.availableRepairStatuses('ready_for_collection').includes('collected'), true);
  assert.equal(validation.availableRepairStatuses('cancelled').includes('collected'), true);
  assert.deepEqual(Array.from(validation.availableRepairStatuses('collected')), ['diagnosing']);
});
function serviceHarness() {
  const calls = [];
  const services = load('lib/services/repairs.ts', {
    '@/lib/validations/repair': validation,
    '@/lib/supabase/client': { supabase: {
      rpc: async (name, args) => { calls.push({ name, args }); return { data: uuid('4'), error: null }; },
      from: () => assert.fail('Repair mutations must not use direct table writes'),
    } },
  });
  return { services, calls };
}
test('create and update carry explicit scope and update version without actor claims', async () => {
  const { services, calls } = serviceHarness();
  await services.createRepair(scope, input);
  await services.updateRepair(scope, { id: uuid('4'), version: 9 }, {
    priority: 'urgent', estimated_amount: 50, final_amount: 40, estimated_completion_at: null,
    parts_notes: null, labour_notes: null, internal_notes: 'Diagnosis', customer_notes: 'Repaired',
  });
  for (const call of calls) {
    assert.equal(call.args.p_org, scope.organizationId);
    assert.equal(call.args.p_branch, scope.branchId);
    assert.equal(Object.hasOwn(call.args, 'actor_user_id'), false);
  }
  assert.equal(calls[1].args.p_version, 9);
  assert.throws(() => services.createRepair({ organizationId: '', branchId: '' }, input));
});
test('payments and reversals preserve caller request keys and repair scope', async () => {
  const { services, calls } = serviceHarness();
  const key = uuid('5');
  await services.recordRepairPayment(scope, uuid('4'), 10, 'CASH', null, key);
  await services.recordRepairPayment(scope, uuid('4'), 10, 'CASH', null, key);
  await services.reverseRepairPayment(scope, uuid('4'), uuid('6'), 'Wrong amount', uuid('7'));
  assert.equal(calls[0].args.p_request_key, calls[1].args.p_request_key);
  assert.equal(calls[2].name, 'reverse_repair_payment');
  assert.equal(calls[2].args.p_job, uuid('4'));
  assert.equal(calls[2].args.p_reason, 'Wrong amount');
});
test('reads and assignment retain explicit workspace; no Staff administration RPC', async () => {
  const { services, calls } = serviceHarness();
  await services.queryRepairs(scope, { search: '123', status: '', priority: '', assignee: '', page: 2 });
  await services.getRepairDetail(scope, uuid('4'));
  await services.getRepairAssignees(scope);
  await services.assignRepairStaff(scope, { id: uuid('4'), version: 3 }, uuid('8'));
  assert.equal(calls[0].args.p_offset, 100);
  assert.equal(calls[2].name, 'get_repair_assignees');
  assert.equal(calls[3].args.p_version, 3);
  assert.ok(calls.every(call => call.args.p_org === scope.organizationId && call.args.p_branch === scope.branchId));
});
test('customer print documents escape device text and exclude private notes', () => {
  const fields = load('components/repairs/repair-fields.tsx');
  const { RepairPrintDialog } = load('components/repairs/repair-print-dialog.tsx', {
    '@/components/ui/app-dialog': {
      AppDialog: ({ children }) => React.createElement('main', null, children),
      AppDialogFooter: ({ children }) => children,
      AppDialogCancelButton: ({ children }) => children,
      AppDialogActionButton: ({ children }) => children,
    },
    '@/components/ui/alpha-components': { Currency: ({ amount }) => React.createElement('span', null, amount) },
    '@/lib/validations/repair': validation,
    './repair-fields': fields,
  });
  const detail = { job: { ...input, job_number: 'REP-1', organization_name: 'Test shop', branch_name: 'Branch',
    customer_name: 'Customer', received_at: '2026-09-23T10:00:00Z', collected_at: '2026-09-23T12:00:00Z',
    model: '<img src=x onerror=alert(1)>', internal_notes: 'INTERNAL_SECRET', parts_notes: 'PARTS_SECRET',
    labour_notes: 'LABOUR_SECRET', intake_notes: 'INTAKE_SECRET', customer_notes: '<script>alert(1)</script>',
    final_amount: 10, paid_amount: 10, outstanding_balance: 0, repair_outcome: 'repaired',
  }, payments: [] };
  for (const kind of ['intake', 'collection']) {
    const html = renderToStaticMarkup(React.createElement(RepairPrintDialog, { detail, kind, onClose: () => {} }));
    assert.doesNotMatch(html, /INTERNAL_SECRET|PARTS_SECRET|LABOUR_SECRET|INTAKE_SECRET|<script>|<img/);
    assert.match(html, /&lt;img/);
  }
});

test('status dialog omits retained outcome on collection/reopen and sends it for readiness', async () => {
  for (const [current, target] of [['ready_for_collection', 'collected'], ['collected', 'diagnosing'], ['in_repair', 'ready_for_collection']]) {
    const calls = [];
    const { RepairStatusDialog } = load('components/repairs/repair-status-dialog.tsx', {
      react: { ...React, useState: initial => [initial, () => {}] },
      '@/components/ui/app-dialog': {
        AppDialog: 'dialog', AppDialogFooter: 'footer',
        AppDialogCancelButton: 'button', AppDialogActionButton: 'button',
      },
      '@/lib/services/repairs': { changeRepairStatus: async (...args) => { calls.push(args); } },
      '@/lib/validations/repair': { ...validation, availableRepairStatuses: () => [target] },
      './repair-fields': load('components/repairs/repair-fields.tsx'),
    });
    const job = { status: current, repair_outcome: 'repaired' };
    const tree = RepairStatusDialog({ job, scope, onClose() {}, onSaved() {} });
    const buttons = React.Children.toArray(tree.props.footer.props.children);
    buttons[1].props.onClick();
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], target);
    assert.equal(calls[0][3], target === 'ready_for_collection' ? 'repaired' : null);
  }
});
