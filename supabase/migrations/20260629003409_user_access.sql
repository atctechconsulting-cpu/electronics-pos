create table public.user_organizations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),

  primary key (user_id, organization_id)
);

create table public.user_branches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),

  primary key (user_id, branch_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, role_id, organization_id, branch_id),

  constraint user_roles_scope_check check (
    organization_id is not null or branch_id is not null
  )
);

create index user_organizations_organization_id_idx
on public.user_organizations (organization_id);

create index user_branches_branch_id_idx
on public.user_branches (branch_id);

create index user_roles_user_id_idx
on public.user_roles (user_id);

create index user_roles_role_id_idx
on public.user_roles (role_id);

create index user_roles_organization_id_idx
on public.user_roles (organization_id);

create index user_roles_branch_id_idx
on public.user_roles (branch_id);