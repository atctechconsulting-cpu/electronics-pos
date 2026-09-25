-- Read-only. Catalog checks do not replace role/concurrency acceptance testing.
begin transaction read only;
select version,name from supabase_migrations.schema_migrations where version in ('20260925010000','20260925010100') order by version;
select c.relname,c.relrowsecurity,c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('sale_item_serials','warranty_claims','warranty_claim_events');
select r.role_name,t.table_name,
has_table_privilege(r.role_name,'public.'||t.table_name,'SELECT') can_select,
has_table_privilege(r.role_name,'public.'||t.table_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') can_mutate,
has_any_column_privilege(r.role_name,'public.'||t.table_name,'INSERT,UPDATE,REFERENCES') can_mutate_columns
from (values('anon'),('authenticated'),('service_role')) r(role_name)
cross join (values('sale_item_serials'),('warranty_claims'),('warranty_claim_events')) t(table_name);
select p.oid::regprocedure function_name,p.prosecdef,p.proconfig,p.proacl,
has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like '%warranty%' or p.proname='complete_pos_sale') order by p.proname;
select schemaname,tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in ('sale_item_serials','warranty_claims','warranty_claim_events');
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
and tablename in ('sale_item_serials','warranty_claims','warranty_claim_events');
select conrelid::regclass table_name,conname,pg_get_constraintdef(oid) definition from pg_constraint
where conrelid in ('public.sale_item_serials'::regclass,'public.warranty_claims'::regclass,'public.warranty_claim_events'::regclass);
select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public'
and table_name='sale_items' and column_name in ('warranty_months_snapshot','purchase_date_snapshot');
select t.tgrelid::regclass table_name,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t
where not t.tgisinternal and t.tgrelid in ('public.sale_item_serials'::regclass,'public.sale_items'::regclass,
'public.warranty_claims'::regclass,'public.warranty_claim_events'::regclass,'public.branches'::regclass);
select p.oid::regprocedure function_name,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('complete_pos_sale','warranty_active_branch_guard','warranty_branch_deactivation_guard',
'warranty_assert_access','warranty_allocation_validate','warranty_sale_snapshot_guard','warranty_immutable_history');
rollback;
