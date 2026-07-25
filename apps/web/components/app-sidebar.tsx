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
  Users,
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
      },
      {
        href: "/pos",
        label: "Point of Sale",
        icon: ShoppingCart,
      },
      {
        href: "/sales",
        label: "Sales History",
        icon: ReceiptText,
      },
      {
        href: "/customers",
        label: "Customers",
        icon: Users,
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
      },
      {
        href: "/categories",
        label: "Categories",
        icon: Tags,
      },
      {
        href: "/brands",
        label: "Brands",
        icon: BadgeCheck,
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        icon: Building2,
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
      },
      {
        href: "/stock-movements",
        label: "Stock Movements",
        icon: ArrowRightLeft,
      },
      {
        href: "/purchases",
        label: "Purchases",
        icon: Receipt,
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
      },
      {
        href: "/returns",
        label: "Returns",
        icon: RotateCcw,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/reports",
        label: "Reports",
        icon: BarChart3,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { branch, organization } = useAuth();

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r bg-white lg:flex lg:flex-col">
      <div className="flex h-16 shrink-0 items-center border-b px-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AlphaPOS</h1>

          <p className="text-xs text-slate-500">Retail Management</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-7">
          {navigation.map((section) => (
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
      </nav>

      <div className="shrink-0 border-t p-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Current Branch</p>

          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            {branch?.name ?? "No branch selected"}
          </p>

          <p className="mt-1 truncate text-xs text-slate-500">
            {organization?.name ?? "No organization"}
          </p>
        </div>
      </div>
    </aside>
  );
}
