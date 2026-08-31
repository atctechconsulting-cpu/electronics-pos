"use client";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  PackageCheck,
  Printer,
  ReceiptText,
  RotateCcw,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ReturnReceiptDialog } from "@/components/returns/return-receipt-dialog";
import {
  Currency,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui/alpha-components";
import {
  getReturnReceipt,
  type ReturnReceiptData,
} from "@/lib/services/return-receipt";

export default function ReturnDetailsPage() {
  const params = useParams<{ returnId: string }>();
  const returnId = params.returnId;

  const [returnRecord, setReturnRecord] = useState<ReturnReceiptData | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    async function loadReturn() {
      if (!returnId) {
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data = await getReturnReceipt(returnId);
        setReturnRecord(data);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load the return."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadReturn();
  }, [returnId]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        Loading return details...
      </div>
    );
  }

  if (errorMessage || !returnRecord) {
    return (
      <div className="space-y-6">
        <Link
          href="/returns"
          className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Returns History
        </Link>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {errorMessage || "Return not found."}
        </div>
      </div>
    );
  }

  const customerName = returnRecord.customer
    ? `${returnRecord.customer.first_name} ${
        returnRecord.customer.last_name ?? ""
      }`.trim()
    : "Walk-in Customer";

  const completedDate = new Date(
    returnRecord.completed_at ?? returnRecord.created_at
  ).toLocaleString("en-GB");

  return (
    <>
      <div className="space-y-6">
        <Link
          href="/returns"
          className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Returns History
        </Link>

        <PageHeader
          title="Return Details"
          description={returnRecord.return_number}
          actions={
            <button
              type="button"
              onClick={() => setReceiptOpen(true)}
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Printer className="mr-2 h-4 w-4" />
              View Return Receipt
            </button>
          }
        />

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <SectionCard
              title="Returned Items"
              description="Products included in this return transaction."
            >
              <div className="divide-y">
                {returnRecord.items.map((item) => (
                  <div key={item.id} className="p-5">
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {item.product_name}
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          SKU: {item.sku}
                        </p>

                        <p className="mt-2 text-sm text-slate-600">
                          {item.quantity} × £{item.unit_price.toFixed(2)}
                        </p>
                      </div>

                      <div className="md:text-right">
                        <Currency
                          amount={item.line_refund_amount}
                          className="text-lg font-bold text-slate-900"
                        />

                        <div className="mt-2">
                          <StatusBadge
                            status={item.restock ? "IN_STOCK" : "RETURNED"}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
                      <PackageCheck className="mt-0.5 h-5 w-5 text-slate-500" />

                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {item.restock
                            ? "Returned to inventory"
                            : "Not returned to inventory"}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.restock
                            ? "The stock quantity was increased and the item can be sold again."
                            : "The item was recorded as returned but was not added back to sellable stock."}
                        </p>
                      </div>
                    </div>

                    {item.serials.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Returned IMEI / Serial Numbers
                        </p>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {item.serials.map((serial) => (
                            <div
                              key={serial.id}
                              className="rounded-lg border bg-white p-3"
                            >
                              <p className="break-all font-mono text-sm font-medium text-slate-900">
                                {serial.imei ||
                                  serial.serial_number ||
                                  "No identifier"}
                              </p>

                              <div className="mt-2">
                                <StatusBadge status={serial.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Return Reason"
              description="Reason and notes recorded when the return was processed."
            >
              <div className="space-y-5 p-5">
                <div>
                  <p className="text-sm font-medium text-slate-500">Reason</p>

                  <p className="mt-2 text-sm text-slate-900">
                    {returnRecord.reason ?? "No reason recorded"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Notes</p>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                    {returnRecord.notes ?? "No additional notes"}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Return Summary">
              <div className="space-y-4 p-5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Return status</span>

                  <StatusBadge status={returnRecord.status} />
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Refund method</span>

                  <span className="text-right font-medium text-slate-900">
                    {returnRecord.refund_method?.replaceAll("_", " ") ??
                      "NO REFUND"}
                  </span>
                </div>

                <div className="flex justify-between border-t pt-4 text-lg font-bold text-slate-900">
                  <span>Refund total</span>

                  <Currency amount={returnRecord.refund_amount} />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Original Sale">
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2">
                    <ReceiptText className="h-5 w-5 text-slate-700" />
                  </div>

                  <div>
                    <p className="font-mono text-sm font-medium text-slate-900">
                      {returnRecord.original_receipt_number}
                    </p>

                    {returnRecord.original_sale_id && (
                      <Link
                        href={`/sales/${returnRecord.original_sale_id}`}
                        className="mt-2 inline-block text-sm font-medium text-slate-600 hover:text-slate-900"
                      >
                        View original sale
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Customer">
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2">
                    <UserRound className="h-5 w-5 text-slate-700" />
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{customerName}</p>

                    {returnRecord.customer ? (
                      <div className="mt-2 space-y-1 text-sm text-slate-500">
                        <p>{returnRecord.customer.customer_code}</p>

                        {returnRecord.customer.company_name && (
                          <p>{returnRecord.customer.company_name}</p>
                        )}

                        {returnRecord.customer.phone && (
                          <p>{returnRecord.customer.phone}</p>
                        )}

                        {returnRecord.customer.email && (
                          <p className="break-all">
                            {returnRecord.customer.email}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        The original sale was a walk-in transaction.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Transaction Information">
              <div className="space-y-5 p-5 text-sm">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Completed</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {completedDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Branch</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {returnRecord.branch_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Processed by</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {returnRecord.processed_by_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <RotateCcw className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Return number</p>
                    <p className="mt-1 break-all font-mono font-medium text-slate-900">
                      {returnRecord.return_number}
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      <ReturnReceiptDialog
        open={receiptOpen}
        returnId={returnRecord.return_id}
        onClose={() => setReceiptOpen(false)}
      />
    </>
  );
}
