create or replace function public.create_initial_business(
  business_name text,
  business_slug text,
  branch_name text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  new_org_id uuid;
  new_branch_id uuid;
  super_admin_role_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1 from public.user_organizations
    where user_id = current_user_id
  ) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (name, slug)
  values (business_name, business_slug)
  returning id into new_org_id;

  insert into public.branches (
    organization_id,
    name,
    code,
    is_head_office
  )
  values (
    new_org_id,
    branch_name,
    'MAIN',
    true
  )
  returning id into new_branch_id;

  select id into super_admin_role_id
  from public.roles
  where name = 'super_admin';

  insert into public.user_organizations (
    user_id,
    organization_id,
    is_default
  )
  values (
    current_user_id,
    new_org_id,
    true
  );

  insert into public.user_branches (
    user_id,
    branch_id,
    is_default
  )
  values (
    current_user_id,
    new_branch_id,
    true
  );

  insert into public.user_roles (
    user_id,
    role_id,
    organization_id
  )
  values (
    current_user_id,
    super_admin_role_id,
    new_org_id
  );

  return json_build_object(
    'organization_id', new_org_id,
    'branch_id', new_branch_id
  );
end;
$$;

grant execute on function public.create_initial_business(text, text, text)
to authenticated;