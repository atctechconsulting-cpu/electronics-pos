"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { receiveStock } from "@/lib/services/stock-receiving";
import { getInventoryProducts } from "@/lib/services/inventory-lookups";
import { getSupplierOptions } from "@/lib/services/lookups";

export function ReceiveStockDialog({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const { organization, branch } = useAuth();

  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    product_id: "",
    quantity: 1,
    unit_cost: 0,
    reference: "",
    notes: "",
  });

  useEffect(() => {
    async function loadData() {
  if (!organization) return;

  const [productData, supplierData] = await Promise.all([
    getInventoryProducts(organization.id),
    getSupplierOptions(organization.id),
  ]);

  setProducts(productData ?? []);
  setSuppliers(supplierData ?? []);
}

if (open) {
  loadData();
}
  }, [open, organization]);

  const filteredProducts = products.filter((product) => {
  if (!form.supplier_id) return true;
  return product.supplier_id === form.supplier_id;
});

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!organization || !branch) return;

    setLoading(true);

    await receiveStock({
      organization_id: organization.id,
      branch_id: branch.id,
      product_id: form.product_id,
      quantity: Number(form.quantity),
      unit_cost: Number(form.unit_cost),
      reference: form.reference,
      notes: form.notes,
    });

    setLoading(false);
    setOpen(false);

    onSuccess();

    setForm({
      supplier_id: "",
      product_id: "",
      quantity: 1,
      unit_cost: 0,
      reference: "",
      notes: "",
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Package className="mr-2 h-4 w-4" />
        Receive Stock
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-slate-900">
  Receive Stock
</h2>
<p className="mt-1 text-sm text-slate-500">
  Add newly received items into inventory for this branch.
</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
  <label className="text-sm font-medium text-slate-700">
    Supplier
  </label>

  <select
    className="mt-1 w-full rounded-lg border px-3 py-2"
    value={form.supplier_id}
    onChange={(e) =>
      setForm({
        ...form,
        supplier_id: e.target.value,
        product_id: "",
      })
    }
  >
    <option value="">All suppliers</option>

    {suppliers.map((supplier) => (
      <option key={supplier.id} value={supplier.id}>
        {supplier.name}
      </option>
    ))}
  </select>
</div>
  <div>
    <label className="text-sm font-medium text-slate-700">
      Product
    </label>
    <select
      className="mt-1 w-full rounded-lg border px-3 py-2"
      value={form.product_id}
      onChange={(e) =>
        setForm({ ...form, product_id: e.target.value })
      }
      required
    >
      <option value="">Select product</option>
      {filteredProducts.map((product) => (
        <option key={product.id} value={product.id}>
          {product.name} — {product.sku}
        </option>
      ))}
    </select>
  </div>

  <div className="grid gap-4 md:grid-cols-2">
    <div>
      <label className="text-sm font-medium text-slate-700">
        Quantity received
      </label>
      <input
        type="number"
        min="1"
        className="mt-1 w-full rounded-lg border px-3 py-2"
        value={form.quantity}
        onChange={(e) =>
          setForm({ ...form, quantity: Number(e.target.value) })
        }
        required
      />
    </div>

    <div>
      <label className="text-sm font-medium text-slate-700">
        Unit cost (£)
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        className="mt-1 w-full rounded-lg border px-3 py-2"
        value={form.unit_cost}
        onChange={(e) =>
          setForm({ ...form, unit_cost: Number(e.target.value) })
        }
        required
      />
    </div>
  </div>

  <div>
    <label className="text-sm font-medium text-slate-700">
      Invoice / Reference number
    </label>
    <input
      className="mt-1 w-full rounded-lg border px-3 py-2"
      value={form.reference}
      onChange={(e) =>
        setForm({ ...form, reference: e.target.value })
      }
      placeholder="e.g. INV-1001"
    />
  </div>

  <div>
    <label className="text-sm font-medium text-slate-700">
      Notes
    </label>
    <textarea
      className="mt-1 w-full rounded-lg border px-3 py-2"
      rows={3}
      value={form.notes}
      onChange={(e) =>
        setForm({ ...form, notes: e.target.value })
      }
      placeholder="Optional notes about this stock receipt"
    />
  </div>

  <div className="rounded-lg bg-slate-50 p-4">
    <p className="text-sm font-medium text-slate-700">
      Receipt Summary
    </p>
    <p className="mt-1 text-sm text-slate-500">
      Total cost: £
      {(Number(form.quantity) * Number(form.unit_cost)).toFixed(2)}
    </p>
  </div>

  <div className="flex justify-end gap-3 pt-2">
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="rounded-lg border px-4 py-2 text-sm font-medium"
    >
      Cancel
    </button>

    <button
      disabled={loading}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {loading ? "Receiving..." : "Receive Stock"}
    </button>
  </div>
</form>
          </div>
        </div>
      )}
    </>
  );
}