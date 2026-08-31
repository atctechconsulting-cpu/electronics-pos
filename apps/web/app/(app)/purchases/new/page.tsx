"use client";

import {
  ArrowLeft,
  CalendarDays,
  PackagePlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { PageHeader, SectionCard } from "@/components/ui/alpha-components";
import { getProducts } from "@/lib/services/products";
import {
  createPurchaseOrder,
  type CreatePurchaseOrderItem,
} from "@/lib/services/purchase-orders";
import { getSuppliers } from "@/lib/services/suppliers";

type Supplier = {
  id: string;
  name: string;
  supplier_code: string;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  cost_price: number | string | null;
  selling_price: number | string | null;
  is_active: boolean;
};

type OrderItem = {
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  cost_price: number;
  tax_rate: number;
  discount_rate: number;
};

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const { organization, branch } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<OrderItem[]>([]);

  const [productSearch, setProductSearch] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadPageData() {
      if (!organization?.id) {
        return;
      }

      setLoadingData(true);
      setErrorMessage("");

      try {
        const [supplierData, productData] = await Promise.all([
          getSuppliers(organization.id),
          getProducts(organization.id),
        ]);

        setSuppliers((supplierData ?? []) as Supplier[]);

        setProducts(
          ((productData ?? []) as Product[]).filter(
            (product) => product.is_active !== false
          )
        );
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load purchasing data."
        );
      } finally {
        setLoadingData(false);
      }
    }

    void loadPageData();
  }, [organization?.id]);

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();

    if (!search) {
      return products.slice(0, 8);
    }

    return products
      .filter((product) => {
        return (
          product.name.toLowerCase().includes(search) ||
          product.sku?.toLowerCase().includes(search)
        );
      })
      .slice(0, 8);
  }, [products, productSearch]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let total = 0;

    for (const item of items) {
      const baseAmount = item.quantity * item.cost_price;

      const discountAmount = baseAmount * (item.discount_rate / 100);

      const taxableAmount = baseAmount - discountAmount;

      const taxAmount = taxableAmount * (item.tax_rate / 100);

      subtotal += baseAmount;
      discount += discountAmount;
      tax += taxAmount;
      total += taxableAmount + taxAmount;
    }

    return {
      subtotal,
      discount,
      tax,
      total,
    };
  }, [items]);

  function addProduct(product: Product) {
    setErrorMessage("");

    setItems((currentItems) => {
      const existingItem = currentItems.find(
        (item) => item.product_id === product.id
      );

      if (existingItem) {
        return currentItems.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...currentItems,
        {
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          quantity: 1,
          cost_price: Number(product.cost_price ?? 0),
          tax_rate: 0,
          discount_rate: 0,
        },
      ];
    });

    setProductSearch("");
  }

  function updateItem(
    productId: string,
    field: "quantity" | "cost_price" | "tax_rate" | "discount_rate",
    value: number
  ) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.product_id === productId
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function removeItem(productId: string) {
    setItems((currentItems) =>
      currentItems.filter((item) => item.product_id !== productId)
    );
  }

  async function handleCreate(status: "DRAFT" | "SUBMITTED" | "ORDERED") {
    if (!organization?.id) {
      setErrorMessage("No organization is currently selected.");
      return;
    }

    if (!branch?.id) {
      setErrorMessage("No branch is currently selected.");
      return;
    }

    if (!supplierId) {
      setErrorMessage("Please select a supplier.");
      return;
    }

    if (!items.length) {
      setErrorMessage("Please add at least one product to the purchase order.");
      return;
    }

    const invalidItem = items.find(
      (item) =>
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.cost_price) ||
        item.cost_price < 0 ||
        item.tax_rate < 0 ||
        item.tax_rate > 100 ||
        item.discount_rate < 0 ||
        item.discount_rate > 100
    );

    if (invalidItem) {
      setErrorMessage(
        "Please check the quantity, cost, tax and discount values."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const purchaseItems: CreatePurchaseOrderItem[] = items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        cost_price: item.cost_price,
        tax_rate: item.tax_rate,
        discount_rate: item.discount_rate,
      }));

      const result = await createPurchaseOrder({
        supplier_id: supplierId,
        branch_id: branch.id,
        expected_delivery_date: expectedDeliveryDate || null,
        notes: notes || null,
        status,
        items: purchaseItems,
      });

      router.push(`/purchases/${result.purchase_order_id}`);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the purchase order."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadingData) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        Loading purchasing workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/purchases"
        className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Purchase Orders
      </Link>

      <PageHeader
        title="New Purchase Order"
        description="Create an order for stock from a supplier."
      />

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard
            title="Supplier & Delivery"
            description="Choose the supplier and expected delivery date."
          >
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Supplier
                </label>

                <select
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                  className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Select supplier</option>

                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.supplier_code
                        ? ` (${supplier.supplier_code})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Expected Delivery
                </label>

                <div className="relative">
                  <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(event) =>
                      setExpectedDeliveryDate(event.target.value)
                    }
                    className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Deliver To
                </label>

                <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  {branch?.name ?? "No branch selected"}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Products"
            description="Search your catalogue and add products to this order."
          >
            <div className="border-b p-5">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search product name or SKU..."
                  className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              {productSearch.trim() && (
                <div className="mt-2 overflow-hidden rounded-lg border bg-white shadow-sm">
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">
                      No matching products.
                    </div>
                  ) : (
                    filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        className="flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {product.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {product.sku || "—"}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-500">
                            £{Number(product.cost_price ?? 0).toFixed(2)}
                          </span>

                          <Plus className="h-4 w-4 text-slate-500" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
                <div className="rounded-full bg-slate-100 p-3">
                  <PackagePlus className="h-6 w-6 text-slate-500" />
                </div>

                <p className="mt-4 font-medium text-slate-900">
                  No products added
                </p>

                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Search for products above and add them to this purchase order.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-3 py-3">Qty</th>
                      <th className="px-3 py-3">Unit Cost</th>
                      <th className="px-3 py-3">Tax %</th>
                      <th className="px-3 py-3">Discount %</th>
                      <th className="px-3 py-3 text-right">Total</th>
                      <th className="w-12 px-3 py-3" />
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((item) => {
                      const base = item.quantity * item.cost_price;

                      const discount = base * (item.discount_rate / 100);

                      const taxable = base - discount;

                      const tax = taxable * (item.tax_rate / 100);

                      const lineTotal = taxable + tax;

                      return (
                        <tr
                          key={item.product_id}
                          className="border-b last:border-0"
                        >
                          <td className="min-w-52 px-4 py-4">
                            <p className="font-medium text-slate-900">
                              {item.product_name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {item.sku || "No SKU"}
                            </p>
                          </td>

                          <td className="px-3 py-4">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(event) =>
                                updateItem(
                                  item.product_id,
                                  "quantity",
                                  Number(event.target.value)
                                )
                              }
                              className="w-20 rounded-lg border px-2 py-2"
                            />
                          </td>

                          <td className="px-3 py-4">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.cost_price}
                              onChange={(event) =>
                                updateItem(
                                  item.product_id,
                                  "cost_price",
                                  Number(event.target.value)
                                )
                              }
                              className="w-28 rounded-lg border px-2 py-2"
                            />
                          </td>

                          <td className="px-3 py-4">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={item.tax_rate}
                              onChange={(event) =>
                                updateItem(
                                  item.product_id,
                                  "tax_rate",
                                  Number(event.target.value)
                                )
                              }
                              className="w-20 rounded-lg border px-2 py-2"
                            />
                          </td>

                          <td className="px-3 py-4">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={item.discount_rate}
                              onChange={(event) =>
                                updateItem(
                                  item.product_id,
                                  "discount_rate",
                                  Number(event.target.value)
                                )
                              }
                              className="w-20 rounded-lg border px-2 py-2"
                            />
                          </td>

                          <td className="px-3 py-4 text-right font-semibold text-slate-900">
                            £{lineTotal.toFixed(2)}
                          </td>

                          <td className="px-3 py-4">
                            <button
                              type="button"
                              onClick={() => removeItem(item.product_id)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label={`Remove ${item.product_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Notes">
            <div className="p-5">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Supplier instructions, delivery information or internal notes..."
                className="w-full resize-none rounded-lg border p-3 text-sm outline-none focus:border-slate-400"
              />
            </div>
          </SectionCard>
        </div>

        <div>
          <div className="sticky top-6">
            <SectionCard title="Order Summary">
              <div className="space-y-4 p-5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Products</span>
                  <span className="font-medium text-slate-900">
                    {items.length}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total quantity</span>
                  <span className="font-medium text-slate-900">
                    {items.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span>£{totals.subtotal.toFixed(2)}</span>
                  </div>

                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-slate-500">Discount</span>
                    <span>-£{totals.discount.toFixed(2)}</span>
                  </div>

                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-slate-500">Tax</span>
                    <span>£{totals.tax.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between border-t pt-4 text-lg font-bold text-slate-900">
                  <span>Total</span>
                  <span>£{totals.total.toFixed(2)}</span>
                </div>

                <div className="space-y-2 border-t pt-5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreate("ORDERED")}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create & Order"}
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreate("DRAFT")}
                    className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save as Draft
                  </button>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
