-- READ ONLY. Capture legacy rows/fingerprint before and after approved deployment.
select ps.id as product_serial_id, ps.organization_id, ps.branch_id, ps.product_id,
  prod.name as product_name, ps.imei, ps.serial_number
from public.product_serials ps
left join public.products prod on prod.id=ps.product_id
where ps.imei is not null and ps.imei !~ '^[0-9]{15}$'
order by ps.id;

-- Compare with the pre-deployment result; a count alone cannot prove unchanged values.
select count(*) as malformed_count,
  md5(coalesce(string_agg(to_jsonb(ps)::text, E'\n' order by ps.id), '')) as malformed_rows_fingerprint
from public.product_serials ps
where ps.imei is not null and ps.imei !~ '^[0-9]{15}$';

select version from supabase_migrations.schema_migrations
where version in ('20260923003351','20260923232804');

select p.oid::regprocedure as signature, p.prosecdef, p.proconfig, p.proacl,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_repair','enforce_product_serial_imei');

-- Expected create_repair: authenticated true, anon/service_role false.
-- Trigger function: false for all three API roles; invoked only by the trigger.
select p.oid::regprocedure as signature, r.role_name,
  has_function_privilege(r.role_name,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
where n.nspname='public' and p.proname in ('create_repair','enforce_product_serial_imei');

-- Constraint is deferred, not added NOT VALID. Inspect existing checks too.
select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.product_serials'::regclass;

-- Expected enabled ('O'), AFTER INSERT OR UPDATE, FOR EACH ROW.
select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid='public.product_serials'::regclass and not tgisinternal;

-- Read-only predicate examples, NOT a runtime write test. Inspect the deployed
-- trigger definition above for INSERT validation and unchanged UPDATE exemption.
select sample, sample is null or sample ~ '^[0-9]{15}$' as accepted_new_imei
from (values (null::text),('012345678901234'),('12345678901234'),
  ('1234567890123456'),('y6uu6rtu8'),('')) cases(sample);

-- RLS remains enabled; no new table grants or policies are introduced.
select relrowsecurity, relacl from pg_class where oid='public.product_serials'::regclass;
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename='product_serials';
