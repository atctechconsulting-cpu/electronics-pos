"use client";

import { Eye, ReceiptText, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ReturnReceiptDialog } from "@/components/returns/return-receipt-dialog";
import {
  Currency,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui/alpha-components";
import {
  getReturnsHistory,
  type ReturnHistoryRow,
} from "@/lib/services/returns-history";

export default function ReturnsHistoryPage() {
  const [returns, setReturns] = useState<ReturnHistoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);

  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    async function loadReturns() {
      setLoading(true);
      setErrorMessage("");

      try {
        const data = await getReturnsHistory();
        setReturns(data);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load returns history."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadReturns();
  }, []);

  const filteredReturns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return returns;
    }

    return returns.filter((returnRecord) => {
      const searchableText = [
        returnRecord.return_number,
        returnRecord.original_receipt,
        returnRecord.customer_name,
        returnRecord.refund_method,
        returnRecord.status,
        returnRecord.processed_by,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [returns, search]);

  function openReturnReceipt(returnId: string) {
    setSelectedReturnId(returnId);
    setReceiptOpen(true);
  }

  function closeReturnReceipt() {
    setReceiptOpen(false);
    setSelectedReturnId(null);
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Returns History"
          description="View completed customer returns, refunds and return receipts."
        />

        <SectionCard>
          <div className="border-b p-4">
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Search by return number, receipt, customer, refund method or staff..."
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
              Loading returns history...
            </div>
          ) : filteredReturns.length === 0 ? (
            <EmptyState
              icon={RotateCcw}
              title={
                search.trim() ? "No matching returns" : "No returns recorded"
              }
              description={
                search.trim()
                  ? "Try another return number, original receipt, customer or refund method."
                  : "Completed customer returns will appear here."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    <th className="px-5 py-4">Return</th>
                    <th className="px-5 py-4">Original Sale</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Refund Method</th>
                    <th className="px-5 py-4">Refund Amount</th>
                    <th className="px-5 py-4">Processed By</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredReturns.map((returnRecord) => (
                    <tr
                      key={returnRecord.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-5 py-4">
                        <div className="font-mono font-medium text-slate-900">
                          {returnRecord.return_number}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {new Date(returnRecord.created_at).toLocaleString(
                            "en-GB"
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 font-mono text-sm text-slate-700">
                          <ReceiptText className="h-4 w-4 text-slate-400" />
                          {returnRecord.original_receipt}
                        </div>
                      </td>

                      <td className="px-5 py-4 font-medium text-slate-900">
                        {returnRecord.customer_name}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {returnRecord.refund_method
                          ? returnRecord.refund_method.replaceAll("_", " ")
                          : "NO REFUND"}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-900">
                        <Currency amount={returnRecord.refund_amount} />
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {returnRecord.processed_by}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={returnRecord.status} />
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openReturnReceipt(returnRecord.id)}
                            className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ReceiptText className="mr-2 h-4 w-4" />
                            Receipt
                          </button>

                          <Link
                            href={`/returns/${returnRecord.id}`}
                            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Return
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <ReturnReceiptDialog
        open={receiptOpen}
        returnId={selectedReturnId}
        onClose={closeReturnReceipt}
      />
    </>
  );
}
