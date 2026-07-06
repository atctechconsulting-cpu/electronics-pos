"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { createProduct } from "@/lib/services/products";
import { useAuth } from "@/components/auth-provider";
import { getBrandOptions, getCategoryOptions } from "@/lib/services/lookups";

type ProductDialogProps = {
  onProductCreated: () => void;
};

export function ProductDialog({ onProductCreated }: ProductDialogProps) {
  const { organization } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    category_id: "",
    brand_id: "",
    cost_price: 0,
    retail_price: 0,
    wholesale_price: 0,
    warranty_months: 12,
    track_inventory: true,
    is_serialized: false,
    requires_imei: false,
    is_active: true,
    is_featured: false,
  });

  useEffect(() => {
  async function loadOptions() {
    if (!organization) return;

    const [categoryData, brandData] = await Promise.all([
      getCategoryOptions(organization.id),
      getBrandOptions(organization.id),
    ]);

    setCategories(categoryData ?? []);
    setBrands(brandData ?? []);
  }

  if (open) {
    loadOptions();
  }
}, [open, organization]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!organization) {
      setErrorMessage("No organization found.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      await createProduct({
        organization_id: organization.id,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        supplier_id: null,
        main_image_url: null,
        ...form,
    });

      setOpen(false);
      setForm({
        name: "",
        sku: "",
        barcode: "",
        description: "",
        category_id: "",
        brand_id: "",
        cost_price: 0,
        retail_price: 0,
        wholesale_price: 0,
        warranty_months: 12,
        track_inventory: true,
        is_serialized: false,
        requires_imei: false,
        is_active: true,
        is_featured: false,
      });

      onProductCreated();
    } catch (error: any) {
      setErrorMessage(error.message ?? "Failed to create product.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Product
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Add Product
              </h2>
              <p className="text-sm text-slate-500">
                Create a new product in your catalogue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Product name</label>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">SKU</label>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.sku}
                    onChange={(e) =>
                      setForm({ ...form, sku: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Barcode</label>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.barcode}
                    onChange={(e) =>
                      setForm({ ...form, barcode: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Warranty months</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.warranty_months}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        warranty_months: Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Cost price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.cost_price}
                    onChange={(e) =>
                      setForm({ ...form, cost_price: Number(e.target.value) })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Retail price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.retail_price}
                    onChange={(e) =>
                      setForm({ ...form, retail_price: Number(e.target.value) })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Wholesale price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.wholesale_price}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        wholesale_price: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <div><label className="text-sm font-medium">Category</label>
                    <select className="mt-1 w-full rounded-lg border px-3 py-2" 
                        value={form.category_id} 
                        onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                        <option value="">No category</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>))}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium">Brand</label>
                    <select className="mt-1 w-full rounded-lg border px-3 py-2" 
                        value={form.brand_id}
                        onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                            <option value="">No brand</option>
                            {brands.map((brand) => (
                                <option key={brand.id} value={brand.id}>
                                    {brand.name}
                                </option>))}
                    </select>
                </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.track_inventory}
                    onChange={(e) =>
                      setForm({ ...form, track_inventory: e.target.checked })
                    }
                  />
                  Track inventory
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_serialized}
                    onChange={(e) =>
                      setForm({ ...form, is_serialized: e.target.checked })
                    }
                  />
                  Serialized
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.requires_imei}
                    onChange={(e) =>
                      setForm({ ...form, requires_imei: e.target.checked })
                    }
                  />
                  Requires IMEI
                </label>
              </div>

              {errorMessage && (
                <p className="text-sm text-red-600">{errorMessage}</p>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}