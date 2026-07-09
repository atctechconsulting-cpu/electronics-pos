"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { createBrand, getBrands } from "@/lib/services/brands";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BrandsPage() {
  const { organization } = useAuth();
  const [brands, setBrands] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadBrands() {
    if (!organization) return;
    const data = await getBrands(organization.id);
    setBrands(data ?? []);
  }

  useEffect(() => {
    loadBrands();
  }, [organization]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;

    setLoading(true);

    await createBrand({
      organization_id: organization.id,
      name,
      slug: slugify(name),
      description: description || null,
    });

    setName("");
    setDescription("");
    await loadBrands();
    setLoading(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Brands
          </h1>
          <p className="text-sm text-slate-500">
            Organise products into groups like Apple, HP, Sony and Hisense.
          </p>
        </div>

        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Slug</th>
                <th className="p-4 text-left">Status</th>
              </tr>
            </thead>

            <tbody>
              {brands.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    No brands yet.
                  </td>
                </tr>
              ) : (
                brands.map((brand) => (
                  <tr key={brand.id} className="border-t">
                    <td className="p-4 font-medium text-slate-900">
                      {brand.name}
                    </td>
                    <td className="p-4">{brand.slug}</td>
                    <td className="p-4">
                      {brand.is_active ? "Active" : "Inactive"}
                    </td>
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
        <h2 className="font-semibold text-slate-900">Add Brand</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apple"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <button
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            {loading ? "Saving..." : "Add Brand"}
          </button>
        </div>
      </form>
    </div>
  );
}
