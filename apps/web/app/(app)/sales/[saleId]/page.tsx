"use client";

import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  CreditCard,
  Mail,
  Phone,
  Printer,
  ReceiptText,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { getSaleDetails, type SaleDetails } from "@/lib/services/sale-details";

export default function SaleDetailsPage() {
  const params = useParams<{ saleId: string }>();
  const saleId = params.saleId;

  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    async function loadSale() {
      if (!saleId) {
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data = await getSaleDetails(saleId);
        setSale(data);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load the sale."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSale();
  }, [saleId]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        Loading sale details...
      </div>
    );
  }

  if (errorMessage || !sale) {
    return (
      <div className="space-y-6">
        <Link
          href="/sales"
          className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sales History
        </Link>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {errorMessage || "Sale not found."}
        </div>
      </div>
    );
  }

  const customerName = sale.customer
    ? `${sale.customer.first_name} ${sale.customer.last_name ?? ""}`.trim()
    : "Walk-in Customer";

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <Link
              href="/sales"
              className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sales History
            </Link>

            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">
                  Sale Details
                </h1>

                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                  {sale.status}
                </span>
              </div>

              <p className="mt-2 font-mono text-sm text-slate-500">
                {sale.receipt_number}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setReceiptOpen(true)}
              className="inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="mr-2 h-4 w-4" />
              View Receipt
            </button>

            <button
              type="button"
              disabled
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white opacity-50"
            >
              <ReceiptText className="mr-2 h-4 w-4" />
              Return Items
            </button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold text-slate-900">Items Sold</h2>
              </div>

              <div className="divide-y">
                {sale.items.map((item) => (
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

                      <div className="text-left md:text-right">
                        <p className="text-lg font-bold text-slate-900">
                          £{item.line_total.toFixed(2)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          VAT: £{item.vat_amount.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {item.serials.length > 0 && (
                      <div className="mt-4 rounded-lg bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          IMEI / Serial Numbers
                        </p>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {item.serials.map((serial) => (
                            <div
                              key={serial.id}
                              className="rounded-lg border bg-white p-3"
                            >
                              <p className="font-mono text-sm text-slate-900">
                                {serial.imei ||
                                  serial.serial_number ||
                                  "No identifier"}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {serial.imei ? "IMEI" : "Serial"} ·{" "}
                                {serial.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold text-slate-900">
                  Payment Details
                </h2>
              </div>

              <div className="divide-y">
                {sale.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-4 p-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-slate-100 p-2">
                        {payment.payment_method === "CASH" ? (
                          <Banknote className="h-5 w-5 text-slate-700" />
                        ) : (
                          <CreditCard className="h-5 w-5 text-slate-700" />
                        )}
                      </div>

                      <div>
                        <p className="font-medium text-slate-900">
                          {payment.payment_method.replaceAll("_", " ")}
                        </p>

                        {payment.reference && (
                          <p className="mt-1 text-sm text-slate-500">
                            Ref: {payment.reference}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="font-semibold text-slate-900">
                      £{payment.amount.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Sale Summary</h2>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Net amount</span>
                  <span>£{sale.subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">VAT</span>
                  <span>£{sale.vat_amount.toFixed(2)}</span>
                </div>

                {sale.discount_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Discount</span>
                    <span>-£{sale.discount_amount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between border-t pt-3 text-lg font-bold text-slate-900">
                  <span>Total</span>
                  <span>£{sale.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Customer</h2>

              <div className="mt-4 flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2">
                  <UserRound className="h-5 w-5 text-slate-700" />
                </div>

                <div>
                  <p className="font-medium text-slate-900">{customerName}</p>

                  {sale.customer ? (
                    <div className="mt-2 space-y-2 text-sm text-slate-500">
                      <p>{sale.customer.customer_code}</p>

                      {sale.customer.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {sale.customer.phone}
                        </p>
                      )}

                      {sale.customer.email && (
                        <p className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {sale.customer.email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      This sale was completed as a walk-in transaction.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">
                Transaction Information
              </h2>

              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Completed</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {new Date(
                        sale.completed_at ?? sale.created_at
                      ).toLocaleString("en-GB")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Branch</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {sale.branch?.name ?? "Branch"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />

                  <div>
                    <p className="text-slate-500">Cashier</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {sale.cashier?.full_name ?? "Cashier"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {sale.notes && (
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">Notes</h2>

                <p className="mt-3 text-sm text-slate-600">{sale.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ReceiptDialog
        open={receiptOpen}
        saleId={sale.id}
        onClose={() => setReceiptOpen(false)}
      />
    </>
  );
}
