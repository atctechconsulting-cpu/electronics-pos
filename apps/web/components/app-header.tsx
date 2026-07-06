"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { globalSearch } from "@/lib/services/global-search";

export function AppHeader() {
  const router = useRouter();
  const { user, profile, organization, branch, signOut } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);

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

  return (
    <header className="relative flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="relative hidden w-full max-w-md md:block">
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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