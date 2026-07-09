"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Boxes, Package, Search, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getInventory } from "@/lib/services/inventory";
import { ReceiveStockDialog } from "@/components/inventory/receive-stock-dialog";

export default function InventoryPage() {
  const { organization, branch } = useAuth();

  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadInventory() {
    if (!organization || !branch) return;

    setLoading(true);

    const data = await getInventory(organization.id, branch.id);
    setItems(data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadInventory();
  }, [organization, branch]);

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase().trim();

    if (!query) return true;

    const productName = item.products?.name?.toLowerCase() ?? "";
    const sku = item.products?.sku?.toLowerCase() ?? "";
    const barcode = item.products?.barcode?.toLowerCase() ?? "";

    return (
      productName.includes(query) ||
      sku.includes(query) ||
      barcode.includes(query)
    );
  });

  const totalProducts = items.length;

  const totalUnits = items.reduce(
    (sum, item) => sum + Number(item.quantity_on_hand ?? 0),
    0
  );

  const totalInventoryValue = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity_on_hand ?? 0) * Number(item.average_cost ?? 0),
    0
  );

  const lowStockItems = items.filter(
    (item) => Number(item.quantity_available ?? 0) <= 5
  ).length;

  const stats = [
    {
      label: "Products in Stock",
      value: totalProducts,
      icon: Package,
    },
    {
      label: "Units in Stock",
      value: totalUnits,
      icon: Boxes,
    },
    {
      label: "Inventory Value",
      value: `£${totalInventoryValue.toFixed(2)}`,
      icon: Wallet,
    },
    {
      label: "Low Stock",
      value: lowStockItems,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inventory
          </h1>
          <p className="text-sm text-slate-500">
            Track stock levels for your current branch.
          </p>
        </div>

        <ReceiveStockDialog onSuccess={loadInventory} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.label}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {stat.label}
                </p>
                <div className="rounded-lg bg-slate-100 p-2">
                  <Icon className="h-4 w-4 text-slate-700" />
                </div>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                {stat.value}
              </h2>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inventory by product, SKU or barcode..."
            className="w-full text-sm outline-none"
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
                <th className="p-4 text-left">On Hand</th>
                <th className="p-4 text-left">Available</th>
                <th className="p-4 text-left">Avg Cost</th>
                <th className="p-4 text-left">Stock Value</th>
                <th className="p-4 text-left">Retail Price</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Loading inventory...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No inventory records yet. Receive stock to get started.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-4 font-medium text-slate-900">
                      {item.products?.name}
                    </td>
                    <td className="p-4">{item.products?.sku}</td>
                    <td className="p-4">
                      {item.products?.categories?.name ?? "-"}
                    </td>
                    <td className="p-4">
                      {item.products?.brands?.name ?? "-"}
                    </td>
                    <td className="p-4">{item.quantity_on_hand}</td>
                    <td className="p-4">{item.quantity_available}</td>
                    <td className="p-4">£{item.average_cost}</td>
                    <td className="p-4">
                      £
                      {(
                        Number(item.quantity_on_hand ?? 0) *
                        Number(item.average_cost ?? 0)
                      ).toFixed(2)}
                    </td>
                    <td className="p-4">£{item.products?.retail_price}</td>
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
