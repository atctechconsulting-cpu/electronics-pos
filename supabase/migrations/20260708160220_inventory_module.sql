create table if not exists public.inventory (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null references organizations(id) on delete cascade,
    branch_id uuid not null references branches(id) on delete cascade,
    product_id uuid not null references products(id) on delete cascade,

    quantity_on_hand integer not null default 0,
    quantity_reserved integer not null default 0,
    quantity_available integer generated always as
      (quantity_on_hand - quantity_reserved) stored,

    average_cost numeric(12,2) not null default 0,

    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    unique(branch_id, product_id)
);

create table if not exists public.stock_movements (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null references organizations(id),
    branch_id uuid not null references branches(id),

    product_id uuid not null references products(id),

    movement_type text not null,

    quantity integer not null,

    unit_cost numeric(12,2),

    reference text,

    notes text,

    created_by uuid references auth.users(id),

    created_at timestamptz default now()
);

create table if not exists public.product_serials (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null references organizations(id),

    product_id uuid not null references products(id),

    branch_id uuid not null references branches(id),

    serial_number text,

    imei text,

    status text default 'IN_STOCK',

    stock_movement_id uuid references stock_movements(id),

    created_at timestamptz default now()
);