// Offline contracts + executable validation/service/print tests. No database is deployed here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '../../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const evidence = read('supabase/migrations/20260925010000_warranty_sale_evidence.sql');
const sql = read('supabase/migrations/20260925010100_warranty_v1.sql');
function fn(name) { const start = sql.indexOf(`create function public.${name}(`); assert.ok(start >= 0); return sql.slice(start, sql.indexOf('$$;', start)); }
function load(file, mocks = {}) {
  const source = read(`apps/web/${file}`);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports, require: n => Object.hasOwn(mocks, n) ? mocks[n] : require(n) }); return module.exports;
}
const validation = load('lib/validations/warranty.ts');
// Inspect the actual table definition, not RPC text or a duplicate JS model.
// Exact conjunctions plus NOT NULL discriminators establish a FALSE CHECK
// result for missing assessment fields; these are not PostgreSQL runtime tests.
const claimTable = sql.slice(sql.indexOf('create table public.warranty_claims ('), sql.indexOf('create unique index warranty_one_open_serial'));
function assessmentConstraint(name) {
  const match = claimTable.match(new RegExp(`constraint ${name} check\\(([\\s\\S]*?)\\n \\),`));
  assert.ok(match, `Missing table constraint ${name}`);
  return match[1].replace(/\s+/g, ' ').trim();
}
function eligibleAssessmentContract() {
  assert.equal(assessmentConstraint('warranty_eligible_assessment_check'),
    "status not in ('APPROVED','IN_PROGRESS','RESOLVED') or ( eligibility_decision='ELIGIBLE' and nullif(btrim(eligibility_reason),'') is not null and assessed_by is not null and assessed_at is not null )");
  assert.match(claimTable, /status text not null/);
  assert.match(claimTable, /eligibility_decision text not null/);
}
test('table CHECK rejects REJECTED with NULL reason instead of accepting UNKNOWN', () => {
  assert.equal(assessmentConstraint('warranty_rejected_assessment_check'),
    "status<>'REJECTED' or ( eligibility_decision='INELIGIBLE' and nullif(btrim(eligibility_reason),'') is not null and assessed_by is not null and assessed_at is not null )");
  assert.match(claimTable, /status text not null/);
  assert.match(claimTable, /eligibility_decision text not null/);
  assert.doesNotMatch(claimTable, /length\(btrim\(eligibility_reason\)\)>0/);
});
test('table CHECK rejects empty and space-only rejected reasons via NULLIF/BTRIM', () => {
  assert.match(assessmentConstraint('warranty_rejected_assessment_check'), /and nullif\(btrim\(eligibility_reason\),''\) is not null and/);
});
test('table CHECK requires both rejection assessor and assessment timestamp', () => {
  assert.match(assessmentConstraint('warranty_rejected_assessment_check'), /and assessed_by is not null and assessed_at is not null/);
});
for (const status of ['APPROVED', 'IN_PROGRESS', 'RESOLVED']) {
  test(`table CHECK requires ELIGIBLE, nonblank reason and assessor/time for ${status}`, eligibleAssessmentContract);
}
test('RECEIVED and ASSESSING remain pending/unassessed without matching either assessed-state guard', () => {
  eligibleAssessmentContract();
  assert.match(assessmentConstraint('warranty_rejected_assessment_check'), /^status<>'REJECTED' or /);
  assert.match(claimTable, /eligibility_decision text not null default 'PENDING'/);
  assert.match(claimTable, /eligibility_reason text, assessed_by uuid references public.profiles\(id\), assessed_at timestamptz/);
  assert.match(fn('update_warranty_claim'), /status='ASSESSING',eligibility_decision='PENDING',eligibility_reason=null,assessed_by=null,assessed_at=null/);
});
test('transition RPC retains explicit NULL-safe reason/decision validation and assessor/time recording', () => {
  const f = fn('transition_warranty_claim');
  assert.match(f, /reason:=nullif\(btrim\(p_data->>'eligibility_reason'\),''\)/);
  assert.match(f, /if reason is null then raise exception 'Explicit eligibility reason required'/);
  assert.match(f, /p_data->>'eligibility_decision' is distinct from decision/);
  assert.match(f, /assessed_by=case when p_status in \('APPROVED','REJECTED'\) then auth.uid\(\) else assessed_by end/);
  assert.match(f, /assessed_at=case when p_status in \('APPROVED','REJECTED'\) then now\(\) else assessed_at end/);
});
test('table closure and resolution consistency use two-valued NULL predicates', () => {
  assert.match(claimTable, /check\(\(status='RESOLVED'\)=\(resolution is not null\)\)/);
  assert.match(claimTable, /check\(\(status in \('RESOLVED','REJECTED','CANCELLED'\)\)=\(closed_at is not null\)\)/);
  assert.match(claimTable, /status text not null/);
});
test('MANUAL terms require nonblank notes and an expiry; UNKNOWN excludes calculated terms', () => {
  assert.match(claimTable, /terms_source text not null/);
  assert.match(claimTable, /check\(terms_source<>'MANUAL' or \(nullif\(btrim\(evidence_notes\),''\) is not null and warranty_expiry_date is not null\)\)/);
  assert.match(claimTable, /check\(terms_source<>'UNKNOWN' or \(warranty_months_snapshot is null and warranty_expiry_date is null\)\)/);
});
test('negative months fail while unknown remains nullable; required device and fault reject NULL', () => {
  assert.match(claimTable, /warranty_months_snapshot integer check\(warranty_months_snapshot>=0\)/);
  assert.match(claimTable, /device_description text not null check\(length\(btrim\(device_description\)\) between 1 and 200\)/);
  assert.match(claimTable, /reported_fault text not null check\(length\(btrim\(reported_fault\)\) between 1 and 5000\)/);
});
test('future checkout captures warranty and purchase date, leaving historical NULL untouched', () => {
  assert.match(evidence, /p\.warranty_months/); assert.match(evidence, /v_warranty_months,\s+v_purchase_date/);
  assert.match(evidence, /s.completed_at at time zone org.timezone/);
  assert.doesNotMatch(evidence, /update public.sale_items/);
  assert.doesNotMatch(fn('warranty_validate_evidence'), /prod.warranty_months/);
});
test('exact allocation is tied to returned sale item id inside checkout', () => {
  assert.match(evidence, /returning id into v_sale_item_id/);
  assert.match(evidence, /v_sale_id,v_sale_item_id,v_product_id,ps.id,ps.serial_number,ps.imei/);
  assert.match(evidence, /into v_serial_count,v_allocated_serial_ids/);
  assert.match(evidence, /ps.id=any\(v_allocated_serial_ids\)/);
});
test('checkout regression: authorization, prices, stock, payments and response remain transactional', () => {
  const original = read('supabase/migrations/20260713011520_transactional_checkout.sql');
  for (const marker of ["if not public.is_org_member", "if not public.is_branch_member", "if not public.has_permission(", "if abs(v_payment_total - v_total)", "update public.inventory", "insert into public.stock_movements", "insert into public.payments", "return jsonb_build_object("]) {
    const originalStart = original.indexOf(marker);
    const newStart = evidence.indexOf(marker);
    assert.ok(originalStart >= 0 && newStart >= 0, marker);
    const endMarker = marker.startsWith('if') ? 'end if;' : ';';
    assert.equal(evidence.slice(newStart,evidence.indexOf(endMarker,newStart)),original.slice(originalStart,original.indexOf(endMarker,originalStart)),marker);
  }
  assert.match(evidence,/for update skip locked/);
  assert.match(evidence,/v_serial_count <> v_quantity/);
  assert.match(evidence,/revoke all on function public.complete_pos_sale[\s\S]*from public,anon,authenticated,service_role/);
  assert.match(evidence,/grant execute on function public.complete_pos_sale[\s\S]*to authenticated/);
});
test('allocation history immutable; resale can add a new sale allocation', () => {
  assert.match(evidence, /before update or delete on public.sale_item_serials/);
  assert.match(evidence, /unique\(sale_id,product_serial_id\)/);
  assert.doesNotMatch(evidence, /product_serial_id uuid[^\n]*unique/);
  const ret = read('supabase/migrations/20260910014331_fix_complete_sale_return_rbac.sql');
  assert.doesNotMatch(ret, /sale_item_serials/);
});
test('zero is not unknown and manual expiry does not become internal evidence', () => {
  assert.match(validation.warrantyTerms(null, 'UNKNOWN'), /not snapshotted/);
  assert.equal(validation.warrantyTerms(0, 'SALE_SNAPSHOT'), 'No warranty (0 months)');
  assert.equal(validation.warrantyTerms(null, 'MANUAL'), 'Manual expiry date');
});
test('manual validation requires notes and enough terms', () => {
  const base = { customer_id: 'a20d0fc0-283c-4a12-a065-d4773d53eae5', product_id: null, source_product_serial_id: null, device_description: 'Phone', reported_fault: 'No power', serial_number_snapshot: null, imei_snapshot: null, intake_notes: null, source_sale_id: null, source_sale_item_id: null, purchase_date_snapshot: null, evidence_class: 'EXTERNAL_MANUAL', terms_source: 'MANUAL', warranty_months_snapshot: null, warranty_expiry_date: null, evidence_notes: null };
  assert.equal(validation.warrantyInputSchema.safeParse(base).success, false);
  const valid = validation.warrantyInputSchema.parse({ ...base, warranty_expiry_date: '2027-12-31', evidence_notes: 'Inspected original supplier warranty.' });
  assert.equal(valid.evidence_class, 'EXTERNAL_MANUAL');
  assert.equal(validation.warrantyInputSchema.safeParse({ ...valid, warranty_months_snapshot: 12 }).success, false);
});
test('coverage uses calendar months minus one day; zero cannot approve', () => {
  assert.match(fn('warranty_validate_evidence'), /make_interval\(months=>c.warranty_months_snapshot\)-interval '1 day'/);
  assert.match(fn('transition_warranty_claim'), /c.warranty_months_snapshot=0/);
  assert.match(fn('transition_warranty_claim'), /Terms expired before claim intake/);
});
test('verified, probable and external evidence have separate terms provenance', () => {
  assert.match(sql, /'VERIFIED_INTERNAL','PROBABLE_INTERNAL','EXTERNAL_MANUAL'/);
  assert.match(sql, /'SALE_SNAPSHOT','MANUAL','UNKNOWN'/);
  assert.match(fn('warranty_validate_evidence'), /Verified serialized evidence requires immutable sale-item allocation/);
  assert.match(fn('lookup_warranty_evidence'), /then 'PROBABLE_INTERNAL' else 'VERIFIED_INTERNAL'/);
  assert.doesNotMatch(fn('transition_warranty_claim'), /set evidence_class/);
});
test('scope, active actor and source permission are independently enforced', () => {
  assert.match(fn('warranty_assert_access'), /auth.uid\(\) is null or auth.role\(\) is distinct from 'authenticated'/);
  assert.match(fn('warranty_assert_access'), /'warranty.manage' else 'warranty.view'/);
  assert.match(fn('warranty_validate_evidence'), /has_permission\('sales.view',c.organization_id,s.branch_id\)/);
  for (const fragment of ['Customer does not belong to organisation', 'Product does not belong to organisation', 'Sale item and product must match', 'Serial does not belong to organisation/product']) assert.ok(sql.includes(fragment));
});
test('reads scope claim and queue to organisation plus servicing branch', () => {
  for (const name of ['query_warranty_claims', 'get_warranty_claim_detail']) { const f = fn(name); assert.match(f, /organization_id=p_org/); assert.match(f, /servicing_branch_id=p_branch/); assert.match(f, /warranty_assert_access\(p_org,p_branch,false\)/); }
});
test('source and refund projections fail closed without granting sales access', () => {
  assert.match(fn('warranty_projection'), /if not source_allowed then/);
  assert.match(fn('warranty_projection'), /has_permission\('sales.refund'/);
  assert.match(fn('lookup_warranty_evidence'), /Inaccessible evidence is not proof/);
  assert.match(fn('lookup_warranty_evidence'), /else null end returned_quantity/);
});
test('approval and rejection require explicit decisions/reason and managed lock', () => {
  const f = fn('transition_warranty_claim');
  assert.match(f, /warranty_lock_claim\(p_org,p_branch,p_claim,p_version\)/);
  assert.match(f, /then 'ELIGIBLE' else 'INELIGIBLE'/); assert.match(f, /eligibility_decision' is distinct from decision/);
  assert.match(f, /Explicit eligibility reason required/); assert.match(f, /assessed_by=.*auth.uid/);
});
test('evidence change clears assessment and forces reassessment', () => {
  assert.match(fn('update_warranty_claim'), /status='ASSESSING',eligibility_decision='PENDING',eligibility_reason=null,assessed_by=null,assessed_at=null/);
});
test('concurrent duplicate known serial claims prevented only while open', () => {
  assert.match(sql, /create unique index warranty_one_open_serial[\s\S]*?where source_product_serial_id is not null and status in \('RECEIVED','ASSESSING','APPROVED','IN_PROGRESS'\)/);
  assert.doesNotMatch(sql, /unique[^;]*(?:imei_snapshot|serial_number_snapshot)/);
});
test('terminal claims have no outgoing transitions; normal transitions match UI', () => {
  for (const s of ['RESOLVED','REJECTED','CANCELLED']) assert.equal(validation.warrantyTransitions[s].length, 0);
  assert.equal(validation.warrantyTransitions.APPROVED[0], 'IN_PROGRESS');
  assert.match(fn('warranty_lock_claim'), /Terminal claims cannot be changed/);
});
test('repaired requires collected AND repaired, not readiness', () => {
  assert.match(fn('transition_warranty_claim'), /r.status<>'collected' or r.repair_outcome is distinct from 'repaired'/);
  assert.match(fn('warranty_check_repair'), /r.customer_id<>c.customer_id/);
  assert.match(fn('warranty_check_repair'), /r.product_serial_id is distinct from c.source_product_serial_id/);
});
test('refund requires matching return line, positive completed refund and serial attribution', () => {
  const f = fn('transition_warranty_claim');
  for (const s of ["sale_item_id=c.source_sale_item_id", "rt.status<>'COMPLETED'", "rt.refund_method='NO_REFUND'", 'rt.refund_amount<=0', 'ri.line_refund_amount<=0', 'rs.product_serial_id=c.source_product_serial_id']) assert.ok(f.includes(s));
  assert.doesNotMatch(f, /complete_sale_return|insert into public.(inventory|sales|payments|stock_movements)|update public.(inventory|sales|payments|stock_movements)/);
});
test('repair creation and link are one transaction and retry returns existing link', () => {
  const f = fn('create_warranty_repair'); assert.match(f, /for update/); assert.match(f, /return c.repair_job_id/);
  assert.ok(f.indexOf('public.create_repair(') < f.indexOf('public.link_warranty_repair('));
  assert.doesNotMatch(f, /exception when|commit|repair_payments/);
});
test('inactive operations blocked; historical reads need no active branch', () => {
  const f = fn('warranty_assert_access'); assert.match(f, /if p_manage then[\s\S]*and is_active for share/);
  assert.match(sql, /before insert or update or delete on public.warranty_claims/);
  assert.match(fn('warranty_branch_deactivation_guard'), /c.status in \('RECEIVED','ASSESSING','APPROVED','IN_PROGRESS'\)/);
  assert.doesNotMatch(fn('warranty_branch_deactivation_guard'), /RESOLVED|REJECTED|CANCELLED/);
});
test('locks use organisation then profile then branch; versions and idempotency required', () => {
  const f = fn('warranty_assert_access'); assert.ok(f.indexOf('public.organizations') < f.indexOf('public.branches'));
  assert.match(fn('warranty_lock_claim'), /p_version is null or c.version<>p_version/);
  assert.match(fn('create_warranty_claim'), /pg_advisory_xact_lock/);
  assert.match(fn('create_warranty_claim'), /existing.servicing_branch_id<>p_branch or existing.created_by<>auth.uid/);
});
test('all Warranty helpers have fixed search path and API grants are allowlisted', () => {
  assert.doesNotMatch(sql, /security definer set search_path(?!='')/);
  assert.match(sql, /revoke all on function %s from public,anon,authenticated,service_role/);
  assert.match(sql, /has_any_column_privilege/); assert.match(sql, /enable row level security/);
});
test('route permissions, historical read-only route and stale request cleanup', () => {
  const guard = read('apps/web/components/permission-route-guard.tsx');
  assert.match(guard, /path: "\/warranty\/new", permission: "warranty.manage"/);
  assert.match(guard, /path: "\/warranty", permission: "warranty.view"/);
  const pages = read('apps/web/components/warranty/warranty-pages.tsx');
  assert.match(pages, /auth.loading \|\| auth.accessLoading \|\| auth.switchingContext/);
  assert.match(pages, /key=\{`\$\{auth.organization.id\}:\$\{auth.branch\?\.id/);
  assert.match(pages, /current = false/); assert.match(pages, /alive.current/);
  assert.match(pages, /!b.is_active && historicalReadPermissions/);
});
test('service forwards exact workspace and version without service-role access', async () => {
  const calls = []; const service = load('lib/services/warranty.ts', { '@/lib/supabase/client': { supabase: { rpc: async (name,args) => { calls.push({ name,args }); return { data: {}, error: null }; } } }, '@/lib/validations/warranty': validation });
  await service.getWarrantyClaim({ organizationId:'org-a',branchId:'main' },'claim-a');
  await service.transitionWarrantyClaim({ organizationId:'org-a',branchId:'west' },{id:'claim-a',version:3},'ASSESSING',{});
  assert.equal(calls[0].args.p_branch,'main'); assert.equal(calls[1].args.p_branch,'west'); assert.equal(calls[1].args.p_version,3);
});
test('print documents whitelist public content and escape customer text', () => {
  const component = load('components/warranty/warranty-print-dialog.tsx', { '@/lib/validations/warranty': validation, '@/components/ui/app-dialog': { AppDialog: ({children}) => React.createElement('section',null,children), AppDialogFooter: ({children}) => children, AppDialogActionButton: ({children}) => React.createElement('button',null,children) } });
  const claim = { claim_number:'WAR-1',organization_name:'Shop',branch_name:'Main',customer_name_snapshot:'<script>customer</script>',device_description:'Phone',reported_fault:'Fault',created_at:'2026-09-25T00:00:00Z',status:'APPROVED',customer_summary:'Covered repair',evidence_notes:'SECRET EVIDENCE',eligibility_reason:'SECRET REASON',resolution_notes:'SECRET RESOLUTION',intake_notes:'SECRET INTAKE' };
  const html = renderToStaticMarkup(React.createElement(component.WarrantyPrintDialog,{claim,kind:'intake',onClose:()=>{}}));
  assert.match(html,/does not confirm eligibility/); assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/SECRET|<script>/);
});
