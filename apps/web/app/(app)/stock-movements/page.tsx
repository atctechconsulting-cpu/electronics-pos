"use client";

import { useAuth } from "@/components/auth-provider";
import { getStockMovements } from "@/lib/services/stock-movements";
import { ArrowRightLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export default function StockMovementsPage() {
  const { organization, branch, switchingContext, accessLoading } = useAuth();

  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMovements = useCallback(async () => {
    if (!organization || !branch || switchingContext || accessLoading) {
      setMovements([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getStockMovements(organization.id, branch.id);

      setMovements(data ?? []);
    } catch (loadError) {
      console.error("Failed to load stock movements:", loadError);

      setMovements([]);
      setError("Unable to load stock movements for this branch.");
    } finally {
      setLoading(false);
    }
  }, [organization, branch, switchingContext, accessLoading]);

  useEffect(() => {
    if (switchingContext || accessLoading) {
      setMovements([]);
      setError(null);
      setLoading(true);
      return;
    }

    void loadMovements();
  }, [loadMovements, switchingContext, accessLoading]);

  const contextBusy = switchingContext || accessLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Movements</h1>

        <p className="text-sm text-slate-500">
          Complete audit trail of inventory transactions for your current
          branch.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
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
              {loading || contextBusy ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Loading stock movements...
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

                    <td className="p-4 font-medium">
                      {movement.products?.name ?? "Unknown product"}
                    </td>

                    <td className="p-4">{movement.quantity}</td>

                    <td className="p-4">
                      {movement.unit_cost == null
                        ? "-"
                        : `£${Number(movement.unit_cost).toFixed(2)}`}
                    </td>

                    <td className="p-4">{movement.reference ?? "-"}</td>
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
