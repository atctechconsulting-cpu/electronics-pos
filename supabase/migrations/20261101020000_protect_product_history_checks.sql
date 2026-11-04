-- Product integrity checks must see history even when the editor cannot.
-- Keep both existing function bodies, trigger attachments and business rules.
-- UPDATE authorization remains enforced by public.products privileges and RLS.
begin;

-- Supabase's application migration owner can inspect history independently of
-- the caller's RLS visibility. Do not transfer ownership to an API role.
alter function public.protect_product_identity() owner to postgres;
alter function public.prevent_invalid_serial_tracking_change() owner to postgres;

alter function public.protect_product_identity() security definer;
alter function public.protect_product_identity() set search_path = '';
alter function public.prevent_invalid_serial_tracking_change() security definer;
alter function public.prevent_invalid_serial_tracking_change() set search_path = '';

-- These are trigger functions, not RPC entry points. Existing triggers continue
-- to execute them; browser/service roles must not attach new privileged triggers.
revoke all on function public.protect_product_identity()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_invalid_serial_tracking_change()
  from public, anon, authenticated, service_role;

-- Fail rather than silently install a definer that still cannot see all history.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'postgres' and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Product integrity function owner must bypass history RLS';
  end if;
end;
$$;

commit;
