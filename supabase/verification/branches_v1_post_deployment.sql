-- READ ONLY. Run only after an explicitly authorised deployment.
-- Re-run branches_v1_pre_deployment.sql too: it reports exact effective ACLs,
-- policies, rows and all seven definitions/grants without making changes.
select version from supabase_migrations.schema_migrations
where version='20260924040358'; -- Exactly one row expected.

select indexname,indexdef from pg_indexes where schemaname='public' and tablename='branches';
-- Must include branches_org_normalized_code_unique.

select r.role_name,
  has_table_privilege(r.role_name,'public.branches','SELECT') as can_select,
  has_table_privilege(r.role_name,'public.branches','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_any_column_privilege(r.role_name,'public.branches','INSERT,UPDATE,REFERENCES') as any_direct_mutation
from (values ('anon'),('authenticated'),('service_role')) r(role_name);
-- SELECT: anon false; authenticated/service_role true. Mutation: all false.

select relrowsecurity,relacl from pg_class where oid='public.branches'::regclass;
select policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename='branches'; -- SELECT policy only; RLS true.

select p.oid::regprocedure as signature,p.prosecdef,p.proconfig,p.proacl,
  pg_get_functiondef(p.oid) as definition,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('get_organization_branches','create_branch','update_branch',
  'set_branch_active_status','branch_management_lock','branch_validate_data','enforce_active_operational_branch');
-- Seven rows. Only the four public RPCs allow authenticated EXECUTE.
-- Anonymous/service EXECUTE false for all. search_path="" for all.
-- All SECURITY DEFINER except the pure validator.

select t.tgrelid::regclass as table_name,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t where t.tgname='active_branch_write_guard' and not t.tgisinternal
order by table_name; -- 12 enabled guards expected.

-- After creating the acceptance-test branch, replace NULL with its UUID.
-- Before any operational use expect one creator link, false is_default, no
-- branch-scoped roles and no rows in inventory/sales/purchases/repairs.
with target as (select null::uuid as branch_id)
select b.id,b.organization_id,b.code,b.is_active,b.is_head_office,
  (select jsonb_agg(jsonb_build_object('user_id',ub.user_id,'is_default',ub.is_default))
    from public.user_branches ub where ub.branch_id=b.id) as assignments,
  (select count(*) from public.user_roles ur where ur.branch_id=b.id) as branch_roles,
  (select count(*) from public.inventory i where i.branch_id=b.id) as inventory_rows,
  (select count(*) from public.sales s where s.branch_id=b.id) as sales,
  (select count(*) from public.purchase_orders po where po.branch_id=b.id) as purchases,
  (select count(*) from public.repair_jobs j where j.branch_id=b.id) as repairs
from public.branches b join target t on t.branch_id=b.id;

-- Inactive branch blocker audit: expected zero positive-stock/open-work counts
-- for branches deactivated through V1. Existing inactive legacy rows need review.
select b.id,b.organization_id,b.code,
  (select count(*) from public.inventory i where i.branch_id=b.id and (i.quantity_on_hand>0 or i.quantity_reserved>0)) as stock_rows,
  (select count(*) from public.product_serials ps where ps.branch_id=b.id and ps.status='IN_STOCK') as in_stock_serials,
  (select count(*) from public.repair_jobs j where j.branch_id=b.id and j.collected_at is null) as uncollected_repairs,
  (select count(*) from public.purchase_orders po where po.branch_id=b.id and po.status in ('DRAFT','SUBMITTED','ORDERED','PARTIALLY_RECEIVED')) as open_orders
from public.branches b where not b.is_active;
