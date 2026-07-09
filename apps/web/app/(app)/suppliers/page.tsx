"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { createSupplier, getSuppliers } from "@/lib/services/suppliers";

export default function SuppliersPage() {
  const { organization } = useAuth();

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    supplier_code: "",
    contact_name: "",
    email: "",
    phone: "",
    website: "",
    city: "",
    postcode: "",
    notes: "",
  });

  async function loadSuppliers() {
    if (!organization) return;
    const data = await getSuppliers(organization.id);
    setSuppliers(data ?? []);
  }

  useEffect(() => {
    loadSuppliers();
  }, [organization]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;

    setLoading(true);

    await createSupplier({
      organization_id: organization.id,
      name: form.name,
      supplier_code: form.supplier_code,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      city: form.city || null,
      postcode: form.postcode || null,
      notes: form.notes || null,
    });

    setForm({
      name: "",
      supplier_code: "",
      contact_name: "",
      email: "",
      phone: "",
      website: "",
      city: "",
      postcode: "",
      notes: "",
    });

    await loadSuppliers();
    setLoading(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Suppliers
          </h1>
          <p className="text-sm text-slate-500">
            Manage suppliers you purchase products from.
          </p>
        </div>

        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4 text-left">Supplier</th>
                <th className="p-4 text-left">Code</th>
                <th className="p-4 text-left">Contact</th>
                <th className="p-4 text-left">Phone</th>
                <th className="p-4 text-left">Email</th>
              </tr>
            </thead>

            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No suppliers yet.
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t">
                    <td className="p-4 font-medium text-slate-900">
                      {supplier.name}
                    </td>
                    <td className="p-4">{supplier.supplier_code}</td>
                    <td className="p-4">{supplier.contact_name || "-"}</td>
                    <td className="p-4">{supplier.phone || "-"}</td>
                    <td className="p-4">{supplier.email || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form
        onSubmit={handleCreate}
        className="h-fit rounded-xl border bg-white p-5 shadow-sm"
      >
        <h2 className="font-semibold text-slate-900">Add Supplier</h2>

        <div className="mt-4 space-y-4">
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Supplier name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Supplier code e.g. APPLE-UK"
            value={form.supplier_code}
            onChange={(e) =>
              setForm({ ...form, supplier_code: e.target.value })
            }
            required
          />

          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Contact name"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />

          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <textarea
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Notes"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <button
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            {loading ? "Saving..." : "Add Supplier"}
          </button>
        </div>
      </form>
    </div>
  );
}
