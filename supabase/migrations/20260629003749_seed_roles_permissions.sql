insert into public.roles (name, description, is_system_role)
values
  ('super_admin', 'Full access to the entire organization and all branches.', true),
  ('branch_manager', 'Manage assigned branch, staff, inventory, sales, expenses, and reports.', true),
  ('cashier', 'Process sales, returns, and view today''s sales.', true),
  ('inventory_officer', 'Manage stock, purchase orders, goods received, transfers, and suppliers.', true),
  ('accountant', 'Manage financial dashboard, expenses, VAT, reports, and payroll.', true)
on conflict (name) do nothing;

insert into public.permissions (key, description)
values
  ('dashboard.view', 'View dashboard.'),
  ('branches.view', 'View branches.'),
  ('branches.manage', 'Create, update, and deactivate branches.'),

  ('users.view', 'View users.'),
  ('users.manage', 'Invite, update, deactivate, and assign users.'),

  ('roles.view', 'View roles and permissions.'),
  ('roles.manage', 'Manage role assignments and permissions.'),

  ('products.view', 'View products.'),
  ('products.manage', 'Create, update, and deactivate products.'),

  ('inventory.view', 'View inventory.'),
  ('inventory.manage', 'Adjust inventory and manage stock.'),

  ('serials.view', 'View serial numbers and IMEI records.'),
  ('serials.manage', 'Create, update, and manage serial number records.'),

  ('sales.view', 'View sales.'),
  ('sales.create', 'Create sales through POS.'),
  ('sales.refund', 'Process refunds and exchanges.'),

  ('customers.view', 'View customers.'),
  ('customers.manage', 'Create and update customers.'),

  ('suppliers.view', 'View suppliers.'),
  ('suppliers.manage', 'Create and update suppliers.'),

  ('purchases.view', 'View purchase orders and goods received.'),
  ('purchases.manage', 'Create and manage purchase orders, goods received, and supplier payments.'),

  ('expenses.view', 'View expenses.'),
  ('expenses.manage', 'Create and manage expenses.'),

  ('reports.view', 'View reports.'),
  ('finance.view', 'View financial reports and profit data.'),

  ('repairs.view', 'View repair jobs.'),
  ('repairs.manage', 'Create and manage repair jobs.'),

  ('warranty.view', 'View warranty records.'),
  ('warranty.manage', 'Create and manage warranty records.'),

  ('transfers.view', 'View branch transfers.'),
  ('transfers.manage', 'Create, approve, ship, and receive branch transfers.'),

  ('settings.view', 'View settings.'),
  ('settings.manage', 'Manage system and organization settings.'),

  ('audit_logs.view', 'View audit logs.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'branches.view',
  'users.view',
  'users.manage',
  'products.view',
  'products.manage',
  'inventory.view',
  'inventory.manage',
  'serials.view',
  'serials.manage',
  'sales.view',
  'sales.create',
  'sales.refund',
  'customers.view',
  'customers.manage',
  'suppliers.view',
  'suppliers.manage',
  'purchases.view',
  'purchases.manage',
  'expenses.view',
  'expenses.manage',
  'reports.view',
  'repairs.view',
  'repairs.manage',
  'warranty.view',
  'warranty.manage',
  'transfers.view',
  'transfers.manage',
  'settings.view'
)
where r.name = 'branch_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'sales.view',
  'sales.create',
  'sales.refund',
  'customers.view',
  'customers.manage',
  'products.view',
  'inventory.view'
)
where r.name = 'cashier'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'products.view',
  'products.manage',
  'inventory.view',
  'inventory.manage',
  'serials.view',
  'serials.manage',
  'suppliers.view',
  'suppliers.manage',
  'purchases.view',
  'purchases.manage',
  'transfers.view',
  'transfers.manage',
  'reports.view'
)
where r.name = 'inventory_officer'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'sales.view',
  'expenses.view',
  'expenses.manage',
  'reports.view',
  'finance.view',
  'purchases.view',
  'suppliers.view',
  'audit_logs.view'
)
where r.name = 'accountant'
on conflict do nothing;