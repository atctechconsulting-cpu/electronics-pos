"use client";

import { useAuth } from "@/components/auth-provider";
import {
  getBrandOptions,
  getCategoryOptions,
  getSupplierOptions,
} from "@/lib/services/lookups";
import { createProduct } from "@/lib/services/products";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

type ProductDialogProps = {
  onProductCreated: () => void;
};

const initialForm = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  category_id: "",
  brand_id: "",
  supplier_id: "",
  cost_price: 0,
  retail_price: 0,
  wholesale_price: 0,
  warranty_months: 12,
  track_inventory: true,
  is_serialized: false,
  requires_imei: false,
  is_active: true,
  is_featured: false,
};

export function ProductDialog({ onProductCreated }: ProductDialogProps) {
  const { organization } = useAuth();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    async function loadOptions() {
      if (!organization || !open) {
        return;
      }

      setLoadingOptions(true);
      setErrorMessage("");

      try {
        const [categoryData, brandData, supplierData] = await Promise.all([
          getCategoryOptions(organization.id),
          getBrandOptions(organization.id),
          getSupplierOptions(organization.id),
        ]);

        setCategories(categoryData ?? []);
        setBrands(brandData ?? []);
        setSuppliers(supplierData ?? []);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load product options."
        );
      } finally {
        setLoadingOptions(false);
      }
    }

    void loadOptions();
  }, [open, organization]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!organization) {
      setErrorMessage("No organization found.");
      return;
    }

    if (form.requires_imei && !form.is_serialized) {
      setErrorMessage(
        "Products requiring IMEI tracking must also be serialized."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createProduct({
        ...form,
        organization_id: organization.id,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        supplier_id: form.supplier_id || null,
        barcode: form.barcode.trim() || null,
        description: form.description.trim() || null,
        main_image_url: null,
      });

      setForm(initialForm);
      setOpen(false);
      onProductCreated();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create product."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) {
      return;
    }

    setErrorMessage("");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Product
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="shrink-0 border-b px-5 py-4 sm:px-6">
              <h2 className="text-xl font-semibold text-slate-900">
                Add Product
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Create a new product in your catalogue.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Product name
                      </label>

                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            name: event.target.value,
                          })
                        }
                        placeholder="Samsung Galaxy S25"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        SKU
                      </label>

                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.sku}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            sku: event.target.value,
                          })
                        }
                        placeholder="SAM-S25-256"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Barcode
                      </label>

                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.barcode}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            barcode: event.target.value,
                          })
                        }
                        placeholder="Optional barcode"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Warranty months
                      </label>

                      <input
                        type="number"
                        min="0"
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.warranty_months}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            warranty_months: Number(event.target.value),
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Category
                      </label>

                      <select
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.category_id}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            category_id: event.target.value,
                          })
                        }
                        disabled={loadingOptions}
                      >
                        <option value="">No category</option>

                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Brand
                      </label>

                      <select
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.brand_id}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            brand_id: event.target.value,
                          })
                        }
                        disabled={loadingOptions}
                      >
                        <option value="">No brand</option>

                        {brands.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Supplier
                      </label>

                      <select
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.supplier_id}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            supplier_id: event.target.value,
                          })
                        }
                        disabled={loadingOptions}
                      >
                        <option value="">No supplier</option>

                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Cost price
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.cost_price}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            cost_price: Number(event.target.value),
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Retail price
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.retail_price}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            retail_price: Number(event.target.value),
                          })
                        }
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Wholesale price
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={form.wholesale_price}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            wholesale_price: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Description
                    </label>

                    <textarea
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                      rows={4}
                      value={form.description}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          description: event.target.value,
                        })
                      }
                      placeholder="Optional product description"
                    />
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-900">
                      Inventory tracking
                    </p>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.track_inventory}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              track_inventory: event.target.checked,
                            })
                          }
                        />
                        Track inventory
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.is_serialized}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              is_serialized: event.target.checked,
                              requires_imei: event.target.checked
                                ? form.requires_imei
                                : false,
                            })
                          }
                        />
                        Serialized
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.requires_imei}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              requires_imei: event.target.checked,
                              is_serialized: event.target.checked
                                ? true
                                : form.is_serialized,
                            })
                          }
                        />
                        Requires IMEI
                      </label>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={saving}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving || loadingOptions}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Product"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
