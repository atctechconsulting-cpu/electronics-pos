"use client";

import { Bell, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function AppHeader() {
  const router = useRouter();
  const { user, profile, organization, branch, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="hidden w-full max-w-md items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 md:flex">
        <Search className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-400">
          Search products, customers...
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden rounded-lg border px-3 py-2 text-sm md:block">
          <p className="font-medium text-slate-900">
            {branch?.name ?? "No branch assigned"}
          </p>
          <p className="text-xs text-slate-500">
            {organization?.name ?? "No organization"}
          </p>
        </div>

        <button className="rounded-lg border p-2 hover:bg-slate-50">
          <Bell className="h-4 w-4 text-slate-600" />
        </button>

        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-900">
            {profile?.full_name || user?.email || "User"}
          </p>
          <p className="text-xs text-slate-500">Signed in</p>
        </div>

        <button
          onClick={handleLogout}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Logout
        </button>
      </div>
    </header>
  );
}