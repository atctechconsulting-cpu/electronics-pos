"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getStockMovements } from "@/lib/services/stock-movements";

export default function StockMovementsPage() {
  const { organization, branch } = useAuth();

  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMovements() {
    if (!organization || !branch) return;

    setLoading(true);

    const data = await getStockMovements(organization.id, branch.id);

    setMovements(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadMovements();
  }, [organization, branch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Movements</h1>

        <p className="text-sm text-slate-500">
          Complete audit trail of inventory transactions.
        </p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4 text-left">Date</th>

              <th className="p-4 text-left">Type</th>

              <th className="p-4 text-left">Product</th>

              <th className="p-4 text-left">Quantity</th>

              <th className="p-4 text-left">Cost</th>

              <th className="p-4 text-left">Reference</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  Loading...
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No stock movements yet.
                </td>
              </tr>
            ) : (
              movements.map((movement) => (
                <tr key={movement.id} className="border-t">
                  <td className="p-4">
                    {new Date(movement.created_at).toLocaleString()}
                  </td>

                  <td className="p-4">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      <ArrowRightLeft className="mr-1 h-3 w-3" />

                      {movement.movement_type}
                    </span>
                  </td>

                  <td className="p-4 font-medium">{movement.products?.name}</td>

                  <td className="p-4">{movement.quantity}</td>

                  <td className="p-4">£{movement.unit_cost}</td>

                  <td className="p-4">{movement.reference}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
