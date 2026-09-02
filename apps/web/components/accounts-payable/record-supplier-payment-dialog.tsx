"use client";

import { Banknote } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogFooter,
} from "@/components/ui/app-dialog";

import {
  recordSupplierPayment,
  type SupplierInvoiceDetails,
  type SupplierPaymentMethod,
} from "@/lib/services/supplier-invoices";

type RecordSupplierPaymentDialogProps = {
  invoice: SupplierInvoiceDetails;
  onSuccess: () => void | Promise<void>;
};

const paymentMethods: Array<{
  value: SupplierPaymentMethod;
  label: string;
}> = [
  {
    value: "BANK_TRANSFER",
    label: "Bank Transfer",
  },
  {
    value: "CASH",
    label: "Cash",
  },
  {
    value: "CARD",
    label: "Card",
  },
  {
    value: "CHEQUE",
    label: "Cheque",
  },
  {
    value: "OTHER",
    label: "Other",
  },
];

function today() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

export function RecordSupplierPaymentDialog({
  invoice,
  onSuccess,
}: RecordSupplierPaymentDialogProps) {
  const [open, setOpen] = useState(false);

  const [amount, setAmount] = useState(
    invoice.amount_due > 0 ? invoice.amount_due.toFixed(2) : ""
  );

  const [paymentMethod, setPaymentMethod] =
    useState<SupplierPaymentMethod>("BANK_TRANSFER");

  const [paymentDate, setPaymentDate] = useState(today());

  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericAmount = Number(amount);

  const remainingAfterPayment = useMemo(() => {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return invoice.amount_due;
    }

    return Math.max(invoice.amount_due - numericAmount, 0);
  }, [invoice.amount_due, numericAmount]);

  function resetForm() {
    setAmount(invoice.amount_due > 0 ? invoice.amount_due.toFixed(2) : "");
    setPaymentMethod("BANK_TRANSFER");
    setPaymentDate(today());
    setReference("");
    setNotes("");
    setError(null);
  }

  function handleOpen() {
    resetForm();
    setOpen(true);
  }

  function handleClose() {
    if (saving) return;

    setOpen(false);
    resetForm();
  }

  async function handleSubmit() {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }

    if (numericAmount > invoice.amount_due) {
      setError(
        `Payment cannot exceed the outstanding balance of ${formatCurrency(
          invoice.amount_due
        )}.`
      );
      return;
    }

    if (!paymentDate) {
      setError("Payment date is required.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await recordSupplierPayment({
        supplierInvoiceId: invoice.id,
        amount: numericAmount,
        paymentMethod,
        paymentDate,
        reference,
        notes,
      });

      setOpen(false);
      resetForm();

      await onSuccess();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to record supplier payment."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={
          invoice.status === "PAID" ||
          invoice.status === "CANCELLED" ||
          invoice.amount_due <= 0
        }
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Banknote className="h-4 w-4" />
        Record Payment
      </button>

      <AppDialog
        open={open}
        title="Record Supplier Payment"
        description={`Record a payment against invoice ${invoice.invoice_number} from ${invoice.supplier_name}.`}
        onClose={handleClose}
        closeDisabled={saving}
        maxWidth="lg"
        footer={
          <AppDialogFooter>
            <AppDialogCancelButton onClick={handleClose} disabled={saving}>
              Cancel
            </AppDialogCancelButton>

            <AppDialogActionButton onClick={handleSubmit} disabled={saving}>
              {saving ? "Recording Payment..." : "Record Payment"}
            </AppDialogActionButton>
          </AppDialogFooter>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Invoice Total
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(invoice.total_amount)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Already Paid
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(invoice.amount_paid)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Outstanding
              </p>

              <p className="mt-1 font-semibold text-slate-950">
                {formatCurrency(invoice.amount_due)}
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="supplier-payment-amount"
              className="text-sm font-medium text-slate-700"
            >
              Payment Amount
            </label>

            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                £
              </span>

              <input
                id="supplier-payment-amount"
                type="number"
                min="0.01"
                max={invoice.amount_due}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-4 text-xs">
              <span className="text-slate-500">
                Maximum {formatCurrency(invoice.amount_due)}
              </span>

              <button
                type="button"
                onClick={() => setAmount(invoice.amount_due.toFixed(2))}
                disabled={saving}
                className="font-medium text-slate-700 hover:text-slate-950"
              >
                Pay full balance
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="supplier-payment-method"
                className="text-sm font-medium text-slate-700"
              >
                Payment Method
              </label>

              <select
                id="supplier-payment-method"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as SupplierPaymentMethod)
                }
                disabled={saving}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="supplier-payment-date"
                className="text-sm font-medium text-slate-700"
              >
                Payment Date
              </label>

              <input
                id="supplier-payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="supplier-payment-reference"
              className="text-sm font-medium text-slate-700"
            >
              Payment Reference
            </label>

            <input
              id="supplier-payment-reference"
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={saving}
              placeholder="e.g. bank transaction reference"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label
              htmlFor="supplier-payment-notes"
              className="text-sm font-medium text-slate-700"
            >
              Notes
            </label>

            <textarea
              id="supplier-payment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Optional payment notes..."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">
                Balance after payment
              </span>

              <span
                className={`text-lg font-semibold ${
                  remainingAfterPayment === 0
                    ? "text-emerald-700"
                    : "text-slate-950"
                }`}
              >
                {formatCurrency(remainingAfterPayment)}
              </span>
            </div>

            {numericAmount > 0 && numericAmount <= invoice.amount_due && (
              <p className="mt-2 text-xs text-slate-500">
                {remainingAfterPayment === 0
                  ? "This payment will fully settle the supplier invoice."
                  : "The invoice will remain partially paid after this transaction."}
              </p>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}
