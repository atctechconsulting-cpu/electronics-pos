import Link from "next/link";
import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  Home,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wrench,
  Tags,
  BadgeCheck,
  ArrowRightLeft,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/brands", label: "Brands", icon: BadgeCheck },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  {
  href: "/stock-movements",
  label: "Stock Movements",
  icon: ArrowRightLeft,
},
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/purchases", label: "Purchases", icon: Receipt },
  { href: "/repairs", label: "Repairs", icon: Wrench },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  return (
    <aside className="hidden min-h-screen w-64 border-r bg-white lg:block">
      <div className="flex h-16 items-center border-b px-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AlphaPOS</h1>
          <p className="text-xs text-slate-500">Retail Management</p>
        </div>
      </div>

      <nav className="space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-0 w-64 border-t p-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Current Branch</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Main Branch
          </p>
        </div>
      </div>
    </aside>
  );
}