"use client";

import {
  ArrowRightLeft,
  BadgeCheck,
  BarChart3,
  Boxes,
  Building2,
  Home,
  Package,
  Receipt,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingCart,
  Tags,
  UserCog,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth-provider";

type NavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  permission: string;
};

type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

const navigation: NavigationSection[] = [
  {
    title: "Sales",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: Home,
        permission: "dashboard.view",
      },
      {
        href: "/pos",
        label: "Point of Sale",
        icon: ShoppingCart,
        permission: "sales.create",
      },
      {
        href: "/sales",
        label: "Sales History",
        icon: ReceiptText,
        permission: "sales.view",
      },
      {
        href: "/customers",
        label: "Customers",
        icon: Users,
        permission: "customers.view",
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        href: "/products",
        label: "Products",
        icon: Package,
        permission: "products.view",
      },
      {
        href: "/categories",
        label: "Categories",
        icon: Tags,
        permission: "products.view",
      },
      {
        href: "/brands",
        label: "Brands",
        icon: BadgeCheck,
        permission: "products.view",
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        icon: Building2,
        permission: "suppliers.view",
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        permission: "inventory.view",
      },
      {
        href: "/stock-movements",
        label: "Stock Movements",
        icon: ArrowRightLeft,
        permission: "inventory.view",
      },
      {
        href: "/purchases",
        label: "Purchases",
        icon: Receipt,
        permission: "purchases.view",
      },
      {
        href: "/accounts-payable",
        label: "Accounts Payable",
        icon: WalletCards,
        permission: "finance.view",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/repairs",
        label: "Repairs",
        icon: Wrench,
        permission: "repairs.view",
      },
      {
        href: "/returns",
        label: "Returns",
        icon: RotateCcw,
        permission: "sales.refund",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/branches",
        label: "Branches",
        icon: Building2,
        permission: "branches.view",
      },
      {
        href: "/staff",
        label: "Staff",
        icon: UserCog,
        permission: "users.view",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: BarChart3,
        permission: "reports.view",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        permission: "settings.view",
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  const {
    branch,
    organization,
    roles,
    hasPermission,
    historicalReadPermissions,
    loading,
    accessLoading,
    switchingContext,
  } = useAuth();

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasPermission(item.permission) ||
        ((item.href === "/sales" || item.href === "/reports") &&
          Object.values(historicalReadPermissions).some(keys => keys.includes(item.permission)))),
    }))
    .filter((section) => section.items.length > 0);

  const accessIsLoading = loading || accessLoading || switchingContext;

  const roleLabel =
    roles.length > 0
      ? roles
          .map((role) =>
            role
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          )
          .join(", ")
      : null;

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r bg-white lg:flex lg:flex-col">
      <div className="flex h-16 shrink-0 items-center border-b px-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AlphaPOS</h1>

          <p className="text-xs text-slate-500">Retail Management</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {accessIsLoading ? (
          <div className="space-y-3 px-3 py-2">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
            <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : visibleNavigation.length > 0 ? (
          <div className="space-y-7">
            {visibleNavigation.map((section) => (
              <section key={section.title}>
                <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </h2>

                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />

                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">
              No modules available
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Your current role does not provide access to any AlphaPOS modules.
            </p>
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t p-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">
            Current Workspace
          </p>

          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            {branch?.name ?? "No branch selected"}
          </p>

          <p className="mt-1 truncate text-xs text-slate-500">
            {organization?.name ?? "No organisation"}
          </p>

          {!accessIsLoading && roleLabel && (
            <div className="mt-3 border-t border-slate-200 pt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Effective Role
              </p>

              <p className="mt-1 truncate text-xs font-semibold text-slate-700">
                {roleLabel}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
