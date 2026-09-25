-- READ ONLY. Run after separately approved deployment; this file changes nothing.
-- Expected: new migration present, three repair tables with RLS, SELECT-only
-- authenticated access, no anon access, no direct mutation grants, nine public
-- authenticated RPCs, seven owner-only helpers, fixed empty search_path.

select version from supabase_migrations.schema_migrations
order by version desc limit 5;

-- Columns/defaults/nullability, including immutable snapshots and derived money.
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('repair_jobs', 'repair_job_events', 'repair_payments')
order by table_name, ordinal_position;

-- Scope foreign keys, amount/status checks, unique references/idempotency keys.
select conrelid::regclass as table_name, conname, contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.repair_jobs'::regclass,
  'public.repair_job_events'::regclass, 'public.repair_payments'::regclass)
order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef from pg_indexes
where schemaname='public'
  and tablename in ('repair_jobs', 'repair_job_events', 'repair_payments')
order by tablename, indexname;

-- New and protected existing tables: no policy changes to Stage 1/2 objects.
select c.oid::regclass as object_name, c.relrowsecurity, c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'repair_jobs','repair_job_events','repair_payments','repair_job_number_seq',
  'profiles','user_organizations','user_branches','user_roles'
);

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename in (
  'repair_jobs','repair_job_events','repair_payments',
  'profiles','user_organizations','user_branches','user_roles'
) order by tablename, policyname;

select r.role_name, t.table_name,
  has_table_privilege(r.role_name,t.table_name,'SELECT') as can_select,
  has_table_privilege(r.role_name,t.table_name,
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as can_mutate,
  has_any_column_privilege(r.role_name,t.table_name,'INSERT,UPDATE,REFERENCES') as column_mutation
from (values ('anon'),('authenticated'),('service_role')) r(role_name)
cross join (values ('public.repair_jobs'),('public.repair_job_events'),('public.repair_payments')) t(table_name)
order by t.table_name,r.role_name;

select r.role_name,
  has_sequence_privilege(r.role_name,'public.repair_job_number_seq','USAGE,UPDATE') as can_allocate_job_number
from (values ('anon'),('authenticated'),('service_role')) r(role_name);

-- Append-only triggers; no browser update/delete path for the ledger/history.
select tgrelid::regclass as table_name,tgname,pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgrelid in (
  'public.repair_job_events'::regclass,'public.repair_payments'::regclass
);

-- Inspect authorization, locking, transition rules, scope checks, idempotency,
-- overpayment prevention, and reversal validation in the deployed definitions.
select p.oid::regprocedure as signature,pg_get_userbyid(p.proowner) as owner,
  p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'repair_prevent_history_change','repair_assert_access','repair_assignee_eligible',
  'repair_lock_job','repair_paid_amount','repair_event','repair_job_projection',
  'get_repair_assignees','create_repair','update_repair','assign_repair_staff',
  'change_repair_status','record_repair_payment','reverse_repair_payment',
  'query_repairs','get_repair_detail'
) order by p.proname;

select p.oid::regprocedure as signature,r.role_name,
  has_function_privilege(r.role_name,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
where n.nspname='public' and p.proname in (
  'repair_prevent_history_change','repair_assert_access','repair_assignee_eligible',
  'repair_lock_job','repair_paid_amount','repair_event','repair_job_projection',
  'get_repair_assignees','create_repair','update_repair','assign_repair_staff',
  'change_repair_status','record_repair_payment','reverse_repair_payment',
  'query_repairs','get_repair_detail'
) order by p.proname,r.role_name;
