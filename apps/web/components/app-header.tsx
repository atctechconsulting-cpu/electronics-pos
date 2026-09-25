"use client";

import { useAuth } from "@/components/auth-provider";
import { globalSearch } from "@/lib/services/global-search";
import { Bell, Building2, ChevronDown, Search, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AppHeader() {
  const router = useRouter();

  const {
    user,
    profile,
    organization,
    organizations,
    branch,
    branches,
    switchingContext,
    switchOrganization,
    switchBranch,
    refreshAuthContext,
    signOut,
  } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  useEffect(() => {
    async function runSearch() {
      if (!organization || query.trim().length < 2) {
        setResults(null);
        return;
      }

      setSearching(true);

      try {
        const data = await globalSearch(organization.id, query);
        setResults(data);
      } finally {
        setSearching(false);
      }
    }

    const timer = setTimeout(runSearch, 300);

    return () => clearTimeout(timer);
  }, [query, organization]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  function closeSearch() {
    setQuery("");
    setResults(null);
  }

  async function handleOrganizationChange(organizationId: string) {
    try {
      closeSearch();
      await switchOrganization(organizationId);
      router.refresh();
    } catch (error) {
      console.error("Unable to switch organization:", error);
    }
  }

  async function handleBranchChange(branchId: string) {
    try {
      closeSearch();
      await switchBranch(branchId);
      router.refresh();
    } catch (error) {
      console.error("Unable to switch branch:", error);
    }
  }

  return (
    <header className="relative flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="relative hidden w-full max-w-md md:block">
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, categories, brands..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {query.trim().length >= 2 && (
          <div className="absolute left-0 top-12 z-50 w-full rounded-xl border bg-white p-3 shadow-lg">
            {searching ? (
              <p className="p-3 text-sm text-slate-500">Searching...</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="px-2 text-xs font-semibold uppercase text-slate-400">
                    Products
                  </p>

                  {results?.products?.length ? (
                    results.products.map((product: any) => (
                      <Link
                        key={product.id}
                        href="/products"
                        onClick={closeSearch}
                        className="block rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">
                          {product.name}
                        </span>

                        <span className="ml-2 text-slate-500">
                          {product.sku}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="px-2 py-2 text-sm text-slate-400">
                      No products found
                    </p>
                  )}
                </div>

                <div>
                  <p className="px-2 text-xs font-semibold uppercase text-slate-400">
                    Categories
                  </p>

                  {results?.categories?.length ? (
                    results.categories.map((category: any) => (
                      <Link
                        key={category.id}
                        href="/categories"
                        onClick={closeSearch}
                        className="block rounded-lg px-2 py-2 text-sm text-slate-900 hover:bg-slate-50"
                      >
                        {category.name}
                      </Link>
                    ))
                  ) : (
                    <p className="px-2 py-2 text-sm text-slate-400">
                      No categories found
                    </p>
                  )}
                </div>

                <div>
                  <p className="px-2 text-xs font-semibold uppercase text-slate-400">
                    Brands
                  </p>

                  {results?.brands?.length ? (
                    results.brands.map((brand: any) => (
                      <Link
                        key={brand.id}
                        href="/brands"
                        onClick={closeSearch}
                        className="block rounded-lg px-2 py-2 text-sm text-slate-900 hover:bg-slate-50"
                      >
                        {brand.name}
                      </Link>
                    ))
                  ) : (
                    <p className="px-2 py-2 text-sm text-slate-400">
                      No brands found
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setContextMenuOpen((current) => !current)}
            disabled={switchingContext}
            className="flex min-w-[210px] items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            <div className="rounded-md bg-slate-100 p-1.5">
              <Building2 className="h-4 w-4 text-slate-600" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {branch?.name ??
                  (switchingContext ? "Switching..." : "No active branch assigned")}
              </p>

              <p className="truncate text-xs text-slate-500">
                {organization?.name ?? "No organization"}
              </p>
            </div>

            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>

          {contextMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Close business selector"
                onClick={() => setContextMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />

              <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border bg-white shadow-xl">
                <div className="border-b bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Business Context
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Choose the organisation and branch you are currently working
                    in.
                  </p>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <label
                      htmlFor="organization-switcher"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Organisation
                    </label>

                    <select
                      id="organization-switcher"
                      value={organization?.id ?? ""}
                      onChange={(event) =>
                        void handleOrganizationChange(event.target.value)
                      }
                      disabled={switchingContext || organizations.length <= 1}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {!organization && (
                        <option value="">Select organisation</option>
                      )}

                      {organizations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.is_default ? " — Default" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="branch-switcher"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Branch
                    </label>

                    <select
                      id="branch-switcher"
                      value={branch?.id ?? ""}
                      onChange={(event) =>
                        void handleBranchChange(event.target.value)
                      }
                      disabled={switchingContext || branches.length <= 1}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {!branch && <option value="">No active branch assigned</option>}

                      {branches.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.is_default ? " — Default" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3 py-3">
                    <button type="button" className="mb-3 text-xs font-medium underline" disabled={switchingContext}
                      onClick={() => { closeSearch(); void refreshAuthContext(); }}>Refresh workspace access</button>
                    <div className="flex items-start gap-2">
                      <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />

                      <div>
                        <p className="text-xs font-medium text-slate-700">
                          Current workspace
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {organization?.name ?? "No organisation"}
                          {" · "}
                          {branch?.name ?? "No branch"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg border p-2 hover:bg-slate-50"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 text-slate-600" />
        </button>

        <div className="hidden text-right sm:block">
          <p className="max-w-[180px] truncate text-sm font-medium text-slate-900">
            {profile?.full_name || user?.email || "User"}
          </p>

          <p className="text-xs text-slate-500">Signed in</p>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
