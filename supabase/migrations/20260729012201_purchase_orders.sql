create table purchase_orders (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null references organizations(id),

    branch_id uuid not null references branches(id),

    supplier_id uuid not null references suppliers(id),

    po_number text not null unique,

    status text not null default 'DRAFT',

    expected_delivery_date date,

    ordered_at timestamptz,

    received_at timestamptz,

    subtotal numeric(12,2) not null default 0,

    tax_amount numeric(12,2) not null default 0,

    discount_amount numeric(12,2) not null default 0,

    total_amount numeric(12,2) not null default 0,

    notes text,

    created_by uuid references profiles(id),

    approved_by uuid references profiles(id),

    created_at timestamptz default now(),

    updated_at timestamptz default now()
);



create table purchase_order_items (

    id uuid primary key default gen_random_uuid(),

    purchase_order_id uuid not null references purchase_orders(id) on delete cascade,

    product_id uuid not null references products(id),

    quantity numeric(12,2) not null,

    received_quantity numeric(12,2) default 0,

    cost_price numeric(12,2) not null,

    tax_rate numeric(5,2) default 0,

    discount_rate numeric(5,2) default 0,

    line_total numeric(12,2) not null
);



create index idx_po_supplier
on purchase_orders(supplier_id);

create index idx_po_branch
on purchase_orders(branch_id);

create index idx_po_status
on purchase_orders(status);

create index idx_po_items
on purchase_order_items(purchase_order_id);