"use client";

import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export function AppHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    }

    loadUser();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="hidden w-full max-w-md items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 md:flex">
        <Search className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-400">Search products, customers...</span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <button className="rounded-lg border p-2 hover:bg-slate-50">
          <Bell className="h-4 w-4 text-slate-600" />
        </button>

        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-900">
            {email || "User"}
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