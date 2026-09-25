"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";

type PermissionRouteGuardProps = {
  children: ReactNode;
};

type RoutePermission = {
  path: string;
  permission: string;
};

const protectedRoutes: RoutePermission[] = [
  { path: "/warranty/new", permission: "warranty.manage" },
  { path: "/warranty", permission: "warranty.view" },
  { path: "/branches", permission: "branches.view" },
  {
    path: "/dashboard",
    permission: "dashboard.view",
  },
  {
    path: "/pos",
    permission: "sales.create",
  },
  {
    path: "/sales",
    permission: "sales.view",
  },
  {
    path: "/customers",
    permission: "customers.view",
  },
  {
    path: "/products",
    permission: "products.view",
  },
  {
    path: "/categories",
    permission: "products.view",
  },
  {
    path: "/brands",
    permission: "products.view",
  },
  {
    path: "/suppliers",
    permission: "suppliers.view",
  },
  {
    path: "/inventory",
    permission: "inventory.view",
  },
  {
    path: "/stock-movements",
    permission: "inventory.view",
  },
  {
    path: "/purchases",
    permission: "purchases.view",
  },
  {
    path: "/accounts-payable",
    permission: "finance.view",
  },
  {
    path: "/repairs",
    permission: "repairs.view",
  },
  {
    path: "/returns",
    permission: "sales.refund",
  },
  {
    path: "/staff",
    permission: "users.view",
  },
  {
    path: "/reports",
    permission: "reports.view",
  },
  {
    path: "/settings",
    permission: "settings.view",
  },
];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function PermissionRouteGuard({ children }: PermissionRouteGuardProps) {
  const pathname = usePathname();

  const {
    organization,
    branch,
    roles,
    hasPermission,
    historicalReadPermissions,
    loading,
    accessLoading,
    switchingContext,
  } = useAuth();

  const requiredRoute = protectedRoutes
    .filter((route) => matchesRoute(pathname, route.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const accessIsLoading = loading || accessLoading || switchingContext;

  if (accessIsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />

          <p className="mt-4 text-sm text-slate-500">Checking your access...</p>
        </div>
      </div>
    );
  }

  const historicalReadAllowed = requiredRoute &&
    (requiredRoute.path === "/sales" || requiredRoute.path === "/reports" || requiredRoute.path === "/warranty") &&
    Object.values(historicalReadPermissions).some(keys => keys.includes(requiredRoute.permission));

  if (!requiredRoute || hasPermission(requiredRoute.permission) || historicalReadAllowed) {
    return <>{children}</>;
  }

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
      : "No assigned role";

  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-6 w-6 text-red-600" />
        </div>

        <h1 className="mt-5 text-2xl font-semibold text-slate-900">
          Access denied
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your current role does not have permission to access this area of
          AlphaPOS.
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Organisation
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-800">
                {organization?.name ?? "No organisation"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Branch
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-800">
                {branch?.name ?? "No branch"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Effective role
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-800">
                {roleLabel}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Required permission
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-800">
                {requiredRoute.permission}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
