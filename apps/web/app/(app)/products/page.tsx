"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { getProducts } from "@/lib/services/products";
import { useAuth } from "@/components/auth-provider";
import { ProductDialog } from "@/components/products/product-dialog";
import { EditProductDialog } from "@/components/products/edit-product-dialog";


export default function ProductsPage() {
  const { organization } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);


    async function loadProducts() {
      if (!organization) return;

      setLoading(true);
      const data = await getProducts(organization.id);
      setProducts(data ?? []);
      setLoading(false);
    }

    useEffect(() => {
    loadProducts();
  }, [organization]);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Products
          </h1>
          <p className="text-sm text-slate-500">
            Manage your product catalogue.
          </p>
        </div>
        <ProductDialog onProductCreated={() => organization && loadProducts()} />
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name or SKU..."
            className="w-full outline-none text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4 text-left">Product</th>
                <th className="p-4 text-left">SKU</th>
                <th className="p-4 text-left">Category</th>
                <th className="p-4 text-left">Brand</th>
                <th className="p-4 text-left">Retail Price</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="border-t">
                    <td className="p-4 font-medium text-slate-900">
                      {product.name}
                    </td>
                    <td className="p-4">{product.sku}</td>
                    <td className="p-4">
                      {product.categories?.name ?? "-"}
                    </td>
                    <td className="p-4">
                      {product.brands?.name ?? "-"}
                    </td>
                    <td className="p-4">£{product.retail_price}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                        {product.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4">
                        <EditProductDialog
                            product={product}
                            onProductUpdated={loadProducts}
                        />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}