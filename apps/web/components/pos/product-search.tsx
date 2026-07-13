"use client";

import { useAuth } from "@/components/auth-provider";
import { usePos } from "@/components/pos/pos-provider";
import { searchPosProducts } from "@/lib/services/pos";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

export function ProductSearch() {
  const { organization, branch } = useAuth();
  const { addProduct } = usePos();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function runSearch() {
      if (!organization || !branch || query.trim().length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);

      try {
        const data = await searchPosProducts(organization.id, branch.id, query);

        setResults(data);
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(runSearch, 250);

    return () => clearTimeout(timer);
  }, [query, organization, branch]);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
        <Search className="h-4 w-4 text-slate-400" />

        <input
          autoFocus
          className="w-full outline-none"
          placeholder="Search product, SKU or scan barcode..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-6 min-h-96">
        {loading ? (
          <div className="flex h-96 items-center justify-center text-slate-400">
            Searching...
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-96 items-center justify-center rounded-lg border-2 border-dashed text-slate-400">
            {query.trim().length < 2
              ? "Start typing to search products"
              : "No in-stock products found"}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((item) => {
              const product = item.products;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() =>
                    addProduct({
                      ...product,
                      quantity_available: item.quantity_available,
                    })
                  }
                  className="rounded-xl border p-4 text-left hover:border-slate-400 hover:bg-slate-50"
                >
                  <p className="font-medium text-slate-900">{product.name}</p>

                  <p className="mt-1 text-sm text-slate-500">
                    SKU: {product.sku}
                  </p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      £{Number(product.retail_price).toFixed(2)}
                    </span>

                    <span className="text-xs text-slate-500">
                      Stock: {item.quantity_available}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
