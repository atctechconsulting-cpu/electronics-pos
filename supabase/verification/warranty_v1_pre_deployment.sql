-- Read-only. Run before deployment; review returned definitions and collisions.
begin transaction read only;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('sale_items','product_serials','organizations','organization_settings') order by table_name,ordinal_position;
select p.oid::regprocedure function_name,pg_get_functiondef(p.oid) definition,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname in ('complete_pos_sale','complete_pos_sale_with_customer','enforce_active_operational_branch',
'branch_management_lock','set_branch_active_status','has_permission','create_repair');
select n.nspname,c.relname,c.relkind,c.relacl,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('sale_item_serials','warranty_claims','warranty_claim_events','warranty_claim_number_seq');
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like '%warranty%' or p.proname='sale_item_serials');
select p.key,r.name role_name from public.permissions p left join public.role_permissions rp on rp.permission_id=p.id
left join public.roles r on r.id=rp.role_id where p.key in ('warranty.view','warranty.manage') order by p.key,r.name;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public'
and tablename in ('sales','sale_items','product_serials','returns','return_items','return_serials','branches','repair_jobs');
select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public'
and table_name in ('sale_items','product_serials','branches') order by table_name,grantee,privilege_type;
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges where table_schema='public'
and table_name in ('sale_items','product_serials','branches') order by table_name,column_name,grantee;
select t.tgrelid::regclass table_name,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t
where not t.tgisinternal and t.tgrelid in ('public.sale_items'::regclass,'public.product_serials'::regclass,'public.branches'::regclass);
-- Verify every existing organisation has a usable timezone before
-- checkout begins deriving warranty purchase dates from it.
select
  id,
  name,
  timezone,
  case
    when timezone is null or btrim(timezone) = '' then false
    when exists (
      select 1
      from pg_timezone_names tz
      where tz.name = organizations.timezone
    ) then true
    else false
  end as timezone_is_valid
from public.organizations
order by name;

-- This must return zero rows.
select
  id,
  name,
  timezone
from public.organizations
where timezone is null
   or btrim(timezone) = ''
   or not exists (
     select 1
     from pg_timezone_names tz
     where tz.name = organizations.timezone
   ); rollback;
