"use client";

import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Link2,
  Printer,
  ReceiptText,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RecordSupplierPaymentDialog } from "@/components/accounts-payable/record-supplier-payment-dialog";

import {
  Currency,
  SectionCard,
  StatusBadge,
} from "@/components/ui/alpha-components";

import {
  getSupplierInvoiceDetails,
  type SupplierInvoiceDetails,
  type SupplierPaymentMethod,
} from "@/lib/services/supplier-invoices";

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function paymentMethodLabel(method: SupplierPaymentMethod) {
  const labels: Record<SupplierPaymentMethod, string> = {
    CASH: "Cash",
    BANK_TRANSFER: "Bank Transfer",
    CARD: "Card",
    CHEQUE: "Cheque",
    OTHER: "Other",
  };

  return labels[method];
}

function getTodayDateString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function SupplierInvoiceDetailsPage() {
  const params = useParams<{
    supplierInvoiceId: string;
  }>();

  const supplierInvoiceId = params.supplierInvoiceId;

  const [invoice, setInvoice] = useState<SupplierInvoiceDetails | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvoice = useCallback(async () => {
    if (!supplierInvoiceId) return;

    try {
      setError(null);

      const data = await getSupplierInvoiceDetails(supplierInvoiceId);

      setInvoice(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load supplier invoice."
      );
    } finally {
      setLoading(false);
    }
  }, [supplierInvoiceId]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const paymentPercentage = useMemo(() => {
    if (!invoice || invoice.total_amount <= 0) {
      return 0;
    }

    return Math.min(
      Math.round((invoice.amount_paid / invoice.total_amount) * 100),
      100
    );
  }, [invoice]);

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">
        Loading supplier invoice...
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>

        <Link
          href="/accounts-payable"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts Payable
        </Link>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const overdue =
    invoice.status !== "PAID" &&
    invoice.status !== "CANCELLED" &&
    invoice.amount_due > 0 &&
    Boolean(invoice.due_date) &&
    invoice.due_date! < getTodayDateString();

  const canRecordPayment =
    invoice.status !== "PAID" &&
    invoice.status !== "CANCELLED" &&
    invoice.amount_due > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/accounts-payable"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Accounts Payable
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {invoice.invoice_number}
            </h1>

            <StatusBadge status={invoice.status} />

            {overdue && (
              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                OVERDUE
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Supplier invoice from {invoice.supplier_name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>

          {canRecordPayment && (
            <RecordSupplierPaymentDialog
              invoice={invoice}
              onSuccess={loadInvoice}
            />
          )}

          {invoice.status === "PAID" && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Fully Paid
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Invoice Total
              </p>

              <div className="mt-3 text-2xl font-bold text-slate-900">
                <Currency amount={invoice.total_amount} />
              </div>
            </div>

            <div className="rounded-lg bg-slate-100 p-2.5">
              <FileText className="h-5 w-5 text-slate-700" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Amount Paid</p>

              <div className="mt-3 text-2xl font-bold text-emerald-700">
                <Currency amount={invoice.amount_paid} />
              </div>
            </div>

            <div className="rounded-lg bg-slate-100 p-2.5">
              <Banknote className="h-5 w-5 text-slate-700" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Outstanding</p>

              <div
                className={`mt-3 text-2xl font-bold ${
                  invoice.amount_due > 0 ? "text-slate-950" : "text-emerald-700"
                }`}
              >
                <Currency amount={invoice.amount_due} />
              </div>
            </div>

            <div className="rounded-lg bg-slate-100 p-2.5">
              <ReceiptText className="h-5 w-5 text-slate-700" />
            </div>
          </div>
        </div>
      </div>

      <SectionCard
        title="Payment Progress"
        description={`${paymentPercentage}% of this supplier invoice has been paid.`}
        contentClassName="p-5"
      >
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              paymentPercentage === 100 ? "bg-emerald-600" : "bg-slate-900"
            }`}
            style={{
              width: `${paymentPercentage}%`,
            }}
          />
        </div>

        <div className="mt-3 flex justify-between gap-4 text-xs text-slate-500">
          <span>
            Paid{" "}
            <Currency
              amount={invoice.amount_paid}
              className="font-medium text-slate-700"
            />
          </span>

          <span>
            Outstanding{" "}
            <Currency
              amount={invoice.amount_due}
              className="font-medium text-slate-700"
            />
          </span>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Invoice Information" contentClassName="p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Truck className="h-4 w-4" />
                Supplier
              </div>

              <p className="mt-2 text-sm font-medium text-slate-900">
                {invoice.supplier_name}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Building2 className="h-4 w-4" />
                Branch
              </div>

              <p className="mt-2 text-sm font-medium text-slate-900">
                {invoice.branch_name}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <CalendarDays className="h-4 w-4" />
                Invoice Date
              </div>

              <p className="mt-2 text-sm text-slate-800">
                {formatDate(invoice.invoice_date)}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <CalendarDays className="h-4 w-4" />
                Due Date
              </div>

              <p
                className={`mt-2 text-sm ${
                  overdue ? "font-semibold text-red-700" : "text-slate-800"
                }`}
              >
                {formatDate(invoice.due_date)}
                {overdue ? " · Overdue" : ""}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <User className="h-4 w-4" />
                Created By
              </div>

              <p className="mt-2 text-sm text-slate-800">
                {invoice.created_by_name}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Link2 className="h-4 w-4" />
                Purchase Order
              </div>

              {invoice.purchase_order_id && invoice.po_number ? (
                <Link
                  href={`/purchases/${invoice.purchase_order_id}`}
                  className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline"
                >
                  {invoice.po_number}
                </Link>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Not linked to a purchase order
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 border-t pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {invoice.notes || "No notes were added to this supplier invoice."}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Invoice Summary" contentClassName="p-5">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Subtotal</span>

              <Currency
                amount={invoice.subtotal}
                className="font-medium text-slate-900"
              />
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Discount</span>

              <span className="font-medium text-slate-900">
                -
                <Currency amount={invoice.discount_amount} />
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Tax</span>

              <Currency
                amount={invoice.tax_amount}
                className="font-medium text-slate-900"
              />
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-950">
                  Invoice Total
                </span>

                <Currency
                  amount={invoice.total_amount}
                  className="text-lg font-semibold text-slate-950"
                />
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Amount Paid</span>

                <Currency
                  amount={invoice.amount_paid}
                  className="font-medium text-emerald-700"
                />
              </div>
            </div>

            <div className="flex justify-between gap-4">
              <span className="font-semibold text-slate-950">Outstanding</span>

              <Currency
                amount={invoice.amount_due}
                className="text-lg font-semibold text-slate-950"
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Payment History"
        description="Individual payments recorded against this supplier invoice."
        contentClassName="p-0"
      >
        {invoice.payments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
              <Banknote className="h-6 w-6 text-slate-400" />
            </div>

            <h3 className="mt-4 font-semibold text-slate-900">
              No payments recorded
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Payments made to this supplier will appear here and form the
              invoice payment audit trail.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Payment Date</th>

                  <th className="px-5 py-3 font-medium">Method</th>

                  <th className="px-5 py-3 font-medium">Reference</th>

                  <th className="px-5 py-3 font-medium">Recorded By</th>

                  <th className="px-5 py-3 font-medium">Recorded</th>

                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {invoice.payments.map((payment) => (
                  <tr key={payment.id} className="text-sm">
                    <td className="px-5 py-4 text-slate-700">
                      {formatDate(payment.payment_date)}
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-800">
                      {paymentMethodLabel(payment.payment_method)}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {payment.reference || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {payment.created_by_name}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {formatDateTime(payment.created_at)}
                    </td>

                    <td className="px-5 py-4 text-right font-semibold text-slate-950">
                      <Currency amount={payment.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="hidden text-xs text-slate-400 print:block">
        Generated from AlphaPOS · {formatDateTime(new Date().toISOString())}
      </div>
    </div>
  );
}
