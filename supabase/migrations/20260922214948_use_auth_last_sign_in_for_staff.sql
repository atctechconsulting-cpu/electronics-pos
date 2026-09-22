begin;

create or replace function public.get_organization_staff(
  target_organization_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  avatar_url text,
  job_title text,
  is_active boolean,
  last_login_at timestamptz,
  created_at timestamptz,
  branches jsonb,
  roles jsonb,
  account_is_active boolean,
  organization_is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_permission(
      'users.view',
      target_organization_id,
      null
    )
    or
    public.has_permission(
      'users.manage',
      target_organization_id,
      null
    )
  ) then
    raise exception 'You do not have permission to view organization staff';
  end if;

  return query

  select
    p.id,
    p.full_name,
    p.phone,
    p.avatar_url,
    p.job_title,
    (p.is_active and uo.is_active),
    au.last_sign_in_at,
    p.created_at,

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'code', b.code,
            'is_head_office', b.is_head_office,
            'is_default', ub.is_default
          )
          order by ub.is_default desc, b.name
        )
        from public.user_branches ub
        join public.branches b
          on b.id = ub.branch_id
        where ub.user_id = p.id
          and b.organization_id = target_organization_id
      ),
      '[]'::jsonb
    ) as branches,

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assignment_id', ur.id,
            'role_id', r.id,
            'role_name', r.name,
            'role_description', r.description,
            'organization_id', ur.organization_id,
            'branch_id', ur.branch_id,
            'scope',
              case
                when ur.branch_id is null
                  then 'organization'
                else 'branch'
              end,
            'branch_name', rb.name
          )
          order by
            case when ur.branch_id is null then 0 else 1 end,
            r.name,
            rb.name
        )
        from public.user_roles ur
        join public.roles r
          on r.id = ur.role_id
        left join public.branches rb
          on rb.id = ur.branch_id
        where ur.user_id = p.id
          and ur.organization_id = target_organization_id
      ),
      '[]'::jsonb
    ) as roles,

    p.is_active as account_is_active,
    uo.is_active as organization_is_active

  from public.profiles p

  join public.user_organizations uo
    on uo.user_id = p.id

  left join auth.users au
    on au.id = p.id

  where uo.organization_id = target_organization_id

  order by
    (p.is_active and uo.is_active) desc,
    lower(coalesce(p.full_name, '')),
    p.created_at;

end;
$$;

revoke all
on function public.get_organization_staff(uuid)
from public, anon, authenticated;

grant execute
on function public.get_organization_staff(uuid)
to authenticated;

commit;