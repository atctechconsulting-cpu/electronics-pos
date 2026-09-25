"use client";

import { Eye, ReceiptText, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import {
  getSalesHistory,
  type SalesHistoryRecord,
} from "@/lib/services/sales-history";

export default function SalesHistoryPage() {
  const { organization, branch, historicalBranches, historicalReadPermissions, switchingContext, accessLoading } = useAuth();
  const [historyBranchId, setHistoryBranchId] = useState("");
  const readableBranches = historicalBranches.filter(item => historicalReadPermissions[item.id]?.includes("sales.view"));
  const historyBranch = readableBranches.find(item => item.id === historyBranchId) ??
    readableBranches.find(item => item.id === branch?.id) ?? readableBranches[0] ?? null;

  const [sales, setSales] = useState<SalesHistoryRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSales() {
      setSales([]);
      setReceiptOpen(false);
      setSelectedSaleId(null);
      if (!organization || !historyBranch || switchingContext || accessLoading) {
        setSales([]);
        setErrorMessage("");
        setLoading(Boolean(switchingContext || accessLoading));
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data = await getSalesHistory({
          organizationId: organization.id,
          branchId: historyBranch.id,
          search,
        });

        if (!cancelled) setSales(data);
      } catch (error: unknown) {
        if (cancelled) return;
        setSales([]);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load sales history."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = window.setTimeout(() => {
      void loadSales();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [organization, historyBranch, search, switchingContext, accessLoading]);

  function openReceipt(saleId: string) {
    setSelectedSaleId(saleId);
    setReceiptOpen(true);
  }

  function closeReceipt() {
    setReceiptOpen(false);
    setSelectedSaleId(null);
  }

  function getCustomerName(sale: SalesHistoryRecord) {
    if (!sale.customer) {
      return "Walk-in Customer";
    }

    return `${sale.customer.first_name} ${
      sale.customer.last_name ?? ""
    }`.trim();
  }

  function getPaymentLabel(sale: SalesHistoryRecord) {
    if (sale.payments.length === 0) {
      return "-";
    }

    return sale.payments
      .map((payment) => payment.payment_method.replaceAll("_", " "))
      .join(", ");
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales History</h1>

          <p className="mt-1 text-sm text-slate-500">
            View completed sales and reprint customer receipts.
          </p>
        </div>

        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <label className="mb-4 block text-sm font-medium">History branch
              <select className="ml-3 rounded-lg border px-3 py-2" value={historyBranch?.id ?? ""}
                onChange={event => { setSales([]); setLoading(true); closeReceipt(); setHistoryBranchId(event.target.value); }}>
                {!historyBranch && <option value="">No readable branch</option>}
                {readableBranches.map(item => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " (inactive)"}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={switchingContext || accessLoading}
                className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Search by receipt number..."
              />
            </div>
          </div>

          {errorMessage && (
            <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading sales history...
            </div>
          ) : !historyBranch ? (
            <div className="p-12 text-center">
              <ReceiptText className="mx-auto h-12 w-12 text-slate-300" />

              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                No readable branch
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Select a branch to view sales history.
              </p>
            </div>
          ) : sales.length === 0 ? (
            <div className="p-12 text-center">
              <ReceiptText className="mx-auto h-12 w-12 text-slate-300" />

              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                {search.trim() ? "No matching sales" : "No completed sales yet"}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {search.trim()
                  ? "Try another receipt number."
                  : "Completed POS sales will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    <th className="px-5 py-4">Receipt</th>

                    <th className="px-5 py-4">Date</th>

                    <th className="px-5 py-4">Customer</th>

                    <th className="px-5 py-4">Payment</th>

                    <th className="px-5 py-4">Total</th>

                    <th className="px-5 py-4">Cashier</th>

                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b last:border-0">
                      <td className="px-5 py-4">
                        <div className="font-mono font-medium text-slate-900">
                          {sale.receipt_number}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {sale.branch?.name ?? "Branch"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {new Date(
                          sale.completed_at ?? sale.created_at
                        ).toLocaleString("en-GB")}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {getCustomerName(sale)}
                        </div>

                        {sale.customer && (
                          <div className="mt-1 text-xs text-slate-500">
                            {sale.customer.customer_code}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {getPaymentLabel(sale)}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-900">
                        £{sale.total_amount.toFixed(2)}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {sale.cashier?.full_name ?? "Cashier"}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openReceipt(sale.id)}
                            className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ReceiptText className="mr-2 h-4 w-4" />
                            Receipt
                          </button>

                          <Link
                            href={`/sales/${sale.id}?branch=${historyBranch.id}`}
                            className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Sale
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ReceiptDialog
        open={receiptOpen}
        saleId={selectedSaleId}
        historyBranchId={historyBranch?.id}
        onClose={closeReceipt}
      />
    </>
  );
}
