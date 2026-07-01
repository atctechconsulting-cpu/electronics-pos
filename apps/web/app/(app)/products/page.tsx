"use client";

import { useEffect, useState } from "react";
import { getProducts } from "@/lib/services/products";

const ORGANIZATION_ID = "REPLACE_WITH_YOUR_ORGANIZATION_ID";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await getProducts(ORGANIZATION_ID);
        setProducts(data ?? []);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  if (loading) {
    return <div className="p-6">Loading products...</div>;
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Products</h1>
        <p className="text-sm text-muted-foreground">
          Manage your electronics product catalogue.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-left">Barcode</th>
              <th className="p-3 text-left">Retail Price</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>

          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="border-t">
                  <td className="p-3 font-medium">{product.name}</td>
                  <td className="p-3">{product.sku}</td>
                  <td className="p-3">{product.barcode || "-"}</td>
                  <td className="p-3">£{product.retail_price}</td>
                  <td className="p-3">
                    {product.is_active ? "Active" : "Inactive"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}