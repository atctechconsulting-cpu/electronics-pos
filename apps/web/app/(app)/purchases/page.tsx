"use client";

import { Eye, PackagePlus, Search, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Currency,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui/alpha-components";
import {
  getPurchaseOrders,
  type PurchaseOrderRow,
} from "@/lib/services/purchase-orders";

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadPurchaseOrders() {
      setLoading(true);
      setErrorMessage("");

      try {
        const data = await getPurchaseOrders();
        setPurchaseOrders(data);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load purchase orders."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPurchaseOrders();
  }, []);

  const filteredPurchaseOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return purchaseOrders;
    }

    return purchaseOrders.filter((purchaseOrder) => {
      const searchableText = [
        purchaseOrder.po_number,
        purchaseOrder.supplier_name,
        purchaseOrder.branch_name,
        purchaseOrder.status,
        purchaseOrder.created_by_name,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [purchaseOrders, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Create and manage stock orders from your suppliers."
        actions={
          <Link
            href="/purchases/new"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <PackagePlus className="mr-2 h-4 w-4" />
            New Purchase Order
          </Link>
        }
      />

      <SectionCard>
        <div className="border-b p-4">
          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search by PO number, supplier, branch, status or staff..."
            />
          </div>
        </div>

        {errorMessage && (
          <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center p-8 text-sm text-slate-500">
            Loading purchase orders...
          </div>
        ) : filteredPurchaseOrders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={
              search.trim()
                ? "No matching purchase orders"
                : "No purchase orders yet"
            }
            description={
              search.trim()
                ? "Try another PO number, supplier, branch or status."
                : "Create your first purchase order to start managing supplier orders."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-4">Purchase Order</th>
                  <th className="px-5 py-4">Supplier</th>
                  <th className="px-5 py-4">Branch</th>
                  <th className="px-5 py-4">Expected Delivery</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Created By</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredPurchaseOrders.map((purchaseOrder) => (
                  <tr key={purchaseOrder.id} className="border-b last:border-0">
                    <td className="px-5 py-4">
                      <div className="font-mono font-medium text-slate-900">
                        {purchaseOrder.po_number}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(purchaseOrder.created_at).toLocaleString(
                          "en-GB"
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-900">
                      {purchaseOrder.supplier_name}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {purchaseOrder.branch_name}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {purchaseOrder.expected_delivery_date
                        ? new Date(
                            `${purchaseOrder.expected_delivery_date}T00:00:00`
                          ).toLocaleDateString("en-GB")
                        : "—"}
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-900">
                      <Currency amount={purchaseOrder.total_amount} />
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={purchaseOrder.status} />
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {purchaseOrder.created_by_name}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/purchases/${purchaseOrder.id}`}
                        className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
