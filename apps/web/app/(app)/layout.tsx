"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { PermissionRouteGuard } from "@/components/permission-route-guard";

function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const {
    user, profile, organization, branch, loading, accessLoading,
    switchingContext, hasOrganizationMemberships, contextError,
    refreshAuthContext, signOut,
  } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!loading && user && profile?.is_active && !contextError
      && hasOrganizationMemberships === false && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [loading, user, profile?.is_active, contextError, hasOrganizationMemberships, pathname, router]);

  if (loading || switchingContext || accessLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading AlphaPOS...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const accessMessage = contextError
    ?? (!profile?.is_active
      ? "Your AlphaPOS account is inactive. Contact platform support."
      : hasOrganizationMemberships && !organization
        ? "You have no active organisation memberships. Contact your organisation administrator."
        : null);

  if (accessMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Workspace unavailable</h1>
          <p className="mt-3 text-sm text-slate-600">{accessMessage}</p>
          <div className="mt-6 flex justify-center gap-4">
            <button type="button" onClick={() => void refreshAuthContext()} className="rounded-lg border px-4 py-2">
              Retry
            </button>
            <button type="button" onClick={() => void signOut()} className="rounded-lg bg-slate-900 px-4 py-2 text-white">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hasOrganizationMemberships === false && pathname !== "/onboarding") return null;

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader />

        <main key={`${organization?.id ?? "none"}:${branch?.id ?? "none"}`} className="flex-1 p-6">
          <PermissionRouteGuard>{children}</PermissionRouteGuard>
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedAppLayout>{children}</ProtectedAppLayout>
    </AuthProvider>
  );
}
