-- Stage 1: restrict direct profile writes without changing staff RPCs,
-- organisation membership, or the existing profile SELECT policies.
begin;

alter table public.profiles enable row level security;

-- Remove table-level privileges FIRST. A column-level REVOKE cannot
-- override a table-level UPDATE grant. REVOKE at table level also removes
-- corresponding column grants held by these grantees.
-- Browser INSERT/DELETE are unnecessary: signup uses handle_new_user,
-- and staff provisioning uses the trusted server/service-role path.
revoke all privileges on table public.profiles
from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

-- Preserve the server's required DML access even if it previously depended
-- on a PUBLIC grant. Leave all other service_role/owner privileges intact.
grant select, insert, update, delete on table public.profiles to service_role;

-- Evaluate the row itself, not a subquery against profiles: no recursive
-- RLS lookup. Suspended users retain existing self-SELECT access but cannot
-- update even the permitted personal fields.
alter policy "Users can update their own profile"
on public.profiles
to authenticated
using (id = auth.uid() and is_active = true)
with check (id = auth.uid() and is_active = true);

-- Maintain timestamps without granting browser UPDATE on updated_at.
-- This invoker trigger only changes NEW; it performs no privileged query.
-- now() matches the timestamp already used by staff administration RPCs.
create function public.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all privileges on function public.set_profile_updated_at()
from public, anon, authenticated;

create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

-- Fail the transaction if unexpected inherited/alternate grants prevent
-- the intended effective browser privileges. Do not change unrelated
-- role memberships or use cascading revocations to conceal that drift.
do $$
declare
  browser_role text;
begin
  foreach browser_role in array array['anon', 'authenticated'] loop
    if pg_catalog.has_table_privilege(
      browser_role, 'public.profiles',
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
    ) or pg_catalog.has_any_column_privilege(
      browser_role, 'public.profiles', 'INSERT, REFERENCES'
    ) then
      raise exception 'Unexpected profile mutation privileges remain for %', browser_role;
    end if;

    if pg_catalog.has_table_privilege(
      browser_role, 'public.profiles', 'SELECT'
    ) is distinct from (browser_role = 'authenticated')
    or pg_catalog.has_any_column_privilege(
      browser_role, 'public.profiles', 'SELECT'
    ) is distinct from (browser_role = 'authenticated') then
      raise exception 'Unexpected profile SELECT privileges for %', browser_role;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::pg_catalog.regclass
        and a.attnum > 0
        and not a.attisdropped
        and pg_catalog.has_column_privilege(
          browser_role, a.attrelid, a.attnum, 'UPDATE'
        ) is distinct from (
          browser_role = 'authenticated'
          and a.attname in ('full_name', 'phone')
        )
    ) then
      raise exception 'Unexpected profile column UPDATE privileges for %', browser_role;
    end if;
  end loop;
end;
$$;

-- Existing service_role grants and trusted-owner access are not revoked.
-- SECURITY DEFINER staff RPCs retain their existing authorization/behaviour.
commit;
