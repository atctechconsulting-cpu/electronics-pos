-- READ ONLY. Run in the SQL Editor before deployment; retain the results.
-- This file does not assume the proposed migration has been applied.
select version from supabase_migrations.schema_migrations order by version desc limit 10;

select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
  pg_get_userbyid(c.relowner) as owner
from pg_class c where c.oid='public.branches'::regclass;

select r.role_name,
  has_table_privilege(r.role_name,'public.branches','SELECT') as can_select,
  has_table_privilege(r.role_name,'public.branches','INSERT') as can_insert,
  has_table_privilege(r.role_name,'public.branches','UPDATE') as can_update,
  has_table_privilege(r.role_name,'public.branches','DELETE') as can_delete,
  has_table_privilege(r.role_name,'public.branches','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as other_privileges
from (values ('anon'),('authenticated'),('service_role')) r(role_name);

select a.attname,a.attacl,r.role_name,
  has_column_privilege(r.role_name,a.attrelid,a.attnum,'SELECT') as can_select,
  has_column_privilege(r.role_name,a.attrelid,a.attnum,'INSERT') as can_insert,
  has_column_privilege(r.role_name,a.attrelid,a.attnum,'UPDATE') as can_update,
  has_column_privilege(r.role_name,a.attrelid,a.attnum,'REFERENCES') as can_reference
from pg_attribute a cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
where a.attrelid='public.branches'::regclass and a.attnum>0 and not a.attisdropped
order by a.attnum,r.role_name;

select policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename='branches';

select id,organization_id,name,code,upper(btrim(code)) as normalized_code,
  is_head_office,is_active,created_at,updated_at
from public.branches order by organization_id,code;

-- Must return zero rows before the normalized unique index can be created.
select organization_id,upper(btrim(code)) as normalized_code,count(*) as duplicates,array_agg(id) as branch_ids
from public.branches group by organization_id,upper(btrim(code)) having count(*)>1;

select org.id,org.name,count(b.id) as branches,
  count(b.id) filter(where b.is_head_office) as head_offices,
  count(b.id) filter(where b.is_active) as active_branches,
  count(b.id) filter(where b.is_head_office and b.is_active) as active_head_offices
from public.organizations org left join public.branches b on b.organization_id=org.id
group by org.id,org.name order by org.name;

select id,organization_id,name,code,is_head_office from public.branches where not is_active;

-- Before deployment these seven functions should be absent. Review any collisions.
-- Also inspect the existing onboarding owner/security mode before revoking table writes.
select p.oid::regprocedure as signature,pg_get_userbyid(p.proowner) as owner,
  p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('get_organization_branches','create_branch','update_branch',
  'set_branch_active_status','branch_management_lock','branch_validate_data','enforce_active_operational_branch','create_initial_business')
order by p.proname;

-- Existing operational triggers: check for live-only differences before deployment.
select t.tgrelid::regclass as table_name,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t where not t.tgisinternal and t.tgrelid in (
  'public.branches'::regclass,'public.inventory'::regclass,'public.stock_movements'::regclass,
  'public.product_serials'::regclass,'public.sales'::regclass,'public.sale_items'::regclass,
  'public.payments'::regclass,'public.returns'::regclass,'public.return_items'::regclass,
  'public.purchase_orders'::regclass,'public.purchase_order_items'::regclass,
  'public.repair_jobs'::regclass,'public.repair_payments'::regclass)
order by table_name,t.tgname;
