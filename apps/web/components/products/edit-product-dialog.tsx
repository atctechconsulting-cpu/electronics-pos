"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updateProduct } from "@/lib/services/products";

type EditProductDialogProps = {
  product: any;
  onProductUpdated: () => void;
};

export function EditProductDialog({
  product,
  onProductUpdated,
}: EditProductDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    organization_id: product.organization_id,
    category_id: product.category_id ?? null,
    brand_id: product.brand_id ?? null,
    supplier_id: product.supplier_id ?? null,
    name: product.name ?? "",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    description: product.description ?? "",
    cost_price: Number(product.cost_price ?? 0),
    retail_price: Number(product.retail_price ?? 0),
    wholesale_price: Number(product.wholesale_price ?? 0),
    warranty_months: Number(product.warranty_months ?? 12),
    track_inventory: Boolean(product.track_inventory),
    is_serialized: Boolean(product.is_serialized),
    requires_imei: Boolean(product.requires_imei),
    main_image_url: product.main_image_url ?? null,
    is_active: Boolean(product.is_active),
    is_featured: Boolean(product.is_featured),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");

    try {
      await updateProduct(product.id, form);
      setOpen(false);
      onProductUpdated();
    } catch (error: any) {
      setErrorMessage(error.message ?? "Failed to update product.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-medium hover:bg-slate-50"
      >
        <Pencil className="mr-2 h-3 w-3" />
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-slate-900">
              Edit Product
            </h2>
            <p className="text-sm text-slate-500">
              Update product details.
            </p>

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
                    value={form.barcode ?? ""}
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
                      setForm({
                        ...form,
                        cost_price: Number(e.target.value),
                      })
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
                      setForm({
                        ...form,
                        retail_price: Number(e.target.value),
                      })
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
                  value={form.description ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.track_inventory}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        track_inventory: e.target.checked,
                      })
                    }
                  />
                  Track inventory
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_serialized}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        is_serialized: e.target.checked,
                      })
                    }
                  />
                  Serialized
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.requires_imei}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        requires_imei: e.target.checked,
                      })
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
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}