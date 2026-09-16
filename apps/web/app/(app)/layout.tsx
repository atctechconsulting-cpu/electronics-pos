"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { PermissionRouteGuard } from "@/components/permission-route-guard";

function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading AlphaPOS...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader />

        <main className="flex-1 p-6">
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
