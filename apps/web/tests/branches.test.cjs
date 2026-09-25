// Offline contracts, not a substitute for PostgreSQL role/concurrency tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const sql = read('supabase/migrations/20260924040358_branches_v1.sql');
function fn(name) {
  const start = sql.indexOf(`create function public.${name}(`);
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf('$$;', start));
}
function load(p, mocks = {}) {
  const code = ts.transpileModule(read(`apps/web/${p}`), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  });
  return module.exports;
}
const validation = load('lib/validations/branch.ts');
const workspace = load('lib/workspace-branches.ts');
const details = { name: ' High Street ', email: '', phone: '', address_line_1: '', address_line_2: '', city: '', county: '', postcode: '', country: 'United Kingdom' };
const branch = (id, active = true, org = 'A', defaults = false) => ({ id, organization_id: org, name: id, code: id, is_active: active, is_default: defaults, is_head_office: false });
const create = fn('create_branch');
const status = fn('set_branch_active_status');

test('create and mutations require authenticated, organisation-scoped branches.manage', () => {
  const lock = fn('branch_management_lock');
  assert.match(lock, /auth.uid\(\) is null or auth.role\(\) is distinct from 'authenticated'/);
  assert.match(lock, /p_org is null or not public.has_permission\('branches.manage',p_org,null\)/);
  assert.match(lock, /errcode='42501'/);
  for (const name of ['create_branch', 'update_branch', 'set_branch_active_status']) assert.match(fn(name), /perform public.branch_management_lock\(p_org\)/);
});
test('organisation isolation is explicit for reads, updates and active status', () => {
  assert.match(fn('get_organization_branches'), /b.organization_id=p_org/);
  assert.match(fn('get_organization_branches'), /public.has_permission\('branches.view',p_org,b.id\)/);
  for (const name of ['update_branch', 'set_branch_active_status']) assert.match(fn(name), /b.id=p_branch and b.organization_id=p_org for update/);
  assert.match(create, /values\(p_org,v_data->>'name'/);
});
test('code is trimmed and uppercase; invalid creation is rejected', () => {
  const parsed = validation.branchCreateSchema.parse({ ...details, code: ' east-2 ' });
  assert.equal(parsed.code, 'EAST-2'); assert.equal(parsed.name, 'High Street'); assert.equal(parsed.email, null);
  for (const code of ['', '   ', 'x'.repeat(65)]) assert.equal(validation.branchCreateSchema.safeParse({ ...details, code }).success, false);
  assert.equal(validation.branchCreateSchema.safeParse({ ...details, code: 'A', email: 'bad' }).success, false);
  assert.match(fn('branch_validate_data'), /v_text:=nullif\(btrim\(p_data->>v_key\),''\)/);
  assert.match(fn('branch_validate_data'), /v_text:=upper\(v_text\)/);
});
test('duplicate codes are rejected with normalized unique index and locked precheck', () => {
  assert.match(sql, /create unique index branches_org_normalized_code_unique\s+on public.branches \(organization_id,upper\(btrim\(code\)\)\)/);
  assert.match(sql, /having count\(\*\)>1/);
  assert.match(create, /upper\(btrim\(b.code\)\)=v_data->>'code'/);
  assert.ok(create.indexOf('branch_management_lock') < create.indexOf('if exists'));
});
test('update rejects code, tenant, head office and activation fields', () => {
  for (const [key, value] of Object.entries({ code: 'NEW', organization_id: 'B', is_head_office: true, is_active: false })) {
    assert.equal(validation.branchUpdateSchema.safeParse({ ...details, [key]: value }).success, false);
  }
  assert.match(fn('branch_validate_data'), /and not \(p_create and v_key='code'\)/);
  assert.doesNotMatch(fn('update_branch').split('update public.branches')[1], /\b(code|organization_id|is_head_office|is_active)=/);
  assert.match(fn('update_branch'), /country=v_changed.country,updated_at=now\(\)/);
});
test('creator gets membership only, with default false and no role or stock side effects', () => {
  assert.match(create, /insert into public.user_branches\(user_id,branch_id,is_default\)\s+values\(auth.uid\(\),v_branch_id,false\)/);
  assert.match(create, /v_data->>'country',true,false/);
  assert.deepEqual([...create.matchAll(/insert into public\.(\w+)/g)].map(m => m[1]), ['branches', 'user_branches']);
  assert.doesNotMatch(create, /update public.user_branches|insert into public.user_roles/);
});
test('head office and final active branch cannot be deactivated', () => {
  assert.match(status, /if v_branch.is_head_office then raise exception 'Head office cannot be deactivated.'/);
  assert.match(status, /b.organization_id=p_org and b.id<>p_branch and b.is_active/);
  assert.match(status, /At least one active branch is required/);
});
test('stock blockers include on-hand, reserved and IN_STOCK serial records', () => {
  assert.match(status, /inv.quantity_on_hand>0 or inv.quantity_reserved>0/);
  assert.match(status, /public.product_serials ps where ps.branch_id=p_branch and ps.status='IN_STOCK'/);
});
test('uncollected repairs including cancelled devices block closure', () => {
  assert.match(status, /public.repair_jobs job where job.branch_id=p_branch and job.collected_at is null/);
});
test('all existing open purchase statuses block closure', () => {
  assert.match(status, /po.status in \('DRAFT','SUBMITTED','ORDERED','PARTIALLY_RECEIVED'\)/);
});
test('activation bypasses closure blockers and retains memberships, roles and history', () => {
  assert.match(status, /if v_branch.is_active=p_active then return; end if;/);
  assert.ok(status.indexOf('if not p_active then') < status.indexOf('Head office'));
  assert.match(status, /end if;\s+update public.branches b set is_active=p_active,updated_at=now\(\)/);
  assert.doesNotMatch(status, /delete from|truncate|update public.user_|insert into/);
});
test('branch table is SELECT only; column ACLs, policy and function ACLs are checked', () => {
  assert.match(sql, /drop policy "Super admins can manage branches"/);
  assert.match(sql, /revoke all privileges on table public.branches from public,anon,authenticated,service_role/);
  assert.match(sql, /revoke all privileges \(%s\) on table public.branches/);
  assert.match(sql, /grant select on table public.branches to authenticated,service_role/);
  assert.match(sql, /has_any_column_privilege/);
  assert.match(sql, /polcmd<>'r'/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.doesNotMatch(sql, /create (?:or replace )?function public.delete_branch|delete from public.branches/);
});
test('operational writes lock organisation then active branch; management locks same order', () => {
  const guard = fn('enforce_active_operational_branch');
  assert.match(guard, /current_setting\('transaction_isolation'\) <> 'read committed'/);
  assert.ok(guard.indexOf('for key share') < guard.indexOf('for share'));
  assert.match(guard, /b.id=v_branch and b.organization_id=v_org for share/);
  assert.match(guard, /if not v_active then raise exception/);
  assert.ok(status.indexOf('for update') < status.indexOf('public.inventory'));
  assert.match(fn('branch_management_lock'), /organizations org where org.id=p_org for update/);
});
test('purchasing, repair, sale, receiving and refund write tables are guarded', () => {
  for (const table of ['inventory','stock_movements','product_serials','sales','sale_items','payments','returns','return_items','purchase_orders','purchase_order_items','repair_jobs','repair_payments']) {
    assert.ok(sql.includes(`before insert or update or delete on public.${table}\n`));
  }
  assert.match(fn('enforce_active_operational_branch'), /if not found and TG_OP='DELETE' then return OLD/);
});
test('operational selection excludes inactive and other-organisation branches', () => {
  const rows = [branch('closed', false), branch('other', true, 'B'), branch('active')];
  assert.equal(workspace.operationalBranches(rows, 'A').map(b => b.id).join(), 'active');
  assert.equal(rows.length, 3); // Filtering does not destroy historical metadata.
});
test('stale stored/preferred branch falls back to active default; none is safe null', () => {
  const rows = [branch('closed', false, 'A', true), branch('active'), branch('default', true, 'A', true)];
  assert.equal(workspace.selectOperationalBranch(rows, 'A', 'closed', 'closed').id, 'default');
  assert.equal(workspace.selectOperationalBranch([branch('closed', false)], 'A', 'closed', 'closed'), null);
  assert.equal(workspace.selectOperationalBranch(rows, 'B'), null);
});
test('historical reads retain independent branch permissions, metadata and finance redaction', () => {
  const auth = read('apps/web/components/auth-provider.tsx');
  assert.match(auth, /setHistoricalBranches\(assignedBranches\)/);
  assert.match(auth, /target_organization_id: organizationId, target_branch_id: candidate.id/);
  assert.match(auth, /key === "sales.view" \|\| key === "reports.view"/);
  assert.match(read('apps/web/app/(app)/reports/page.tsx'), /Boolean\(report\?\.access.can_view_finance\)/);
  assert.match(read('apps/web/components/pos/receipt-dialog.tsx'), /branchId: receiptBranch.id/);
  assert.doesNotMatch(sql, /create or replace function public.has_permission|drop policy.*[Ss]elect/);
});
test('onboarding owner path and existing MAIN creation are untouched', () => {
  const onboarding = read('supabase/migrations/20260916093243_organization_staff_activation.sql').split('create or replace function public.create_initial_business(')[1].split('$$;')[0];
  assert.match(onboarding, /security definer\s+set search_path = ''/);
  assert.match(onboarding, /insert into public.branches/);
  assert.match(onboarding, /'MAIN',\s+true/);
  assert.doesNotMatch(sql, /(?:replace|drop) function public.create_initial_business/);
});
test('service uses scoped RPCs and normalizes data; no direct table mutations', async () => {
  const calls = [];
  const service = load('lib/services/branches.ts', { '@/lib/validations/branch': validation,
    '@/lib/supabase/client': { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'new-id', error: null }; } } },
  });
  await service.createBranch('A', { ...details, code: ' east ' });
  await service.updateBranch('A', 'branch', details);
  await service.setBranchActiveStatus('A', 'branch', true);
  await service.getOrganizationBranches('A');
  assert.equal(calls[0].args.p_data.code, 'EAST');
  assert.ok(calls.every(call => call.args.p_org === 'A'));
  assert.equal(calls[2].args.p_active, true);
  assert.throws(() => service.createBranch('', { ...details, code: 'A' }), /Select an organisation/);
  assert.doesNotMatch(read('apps/web/lib/services/branches.ts'), /\.from\(/);
});
test('duplicate and permission errors are readable and unexpected database errors hidden', async () => {
  for (const [code, message] of [['23505', 'already exists'], ['42501', 'permission'], ['XX000', 'Unable to complete']]) {
    const service = load('lib/services/branches.ts', { '@/lib/validations/branch': validation,
      '@/lib/supabase/client': { supabase: { rpc: async () => ({ error: { code, message: 'internal detail' } }) } },
    });
    await assert.rejects(service.getOrganizationBranches('A'), new RegExp(message));
  }
});
test('branch navigation and route guard require branches.view; page works without selected branch', () => {
  assert.match(read('apps/web/components/permission-route-guard.tsx'), /path: "\/branches", permission: "branches.view"/);
  assert.match(read('apps/web/components/app-sidebar.tsx'), /href: "\/branches",[\s\S]*?permission: "branches.view"/);
  const page = read('apps/web/app/(app)/branches/page.tsx');
  assert.match(page, /directory\?\.can_manage/);
  assert.doesNotMatch(page, /if \(!branch\)|deleteBranch|Delete branch/);
});
