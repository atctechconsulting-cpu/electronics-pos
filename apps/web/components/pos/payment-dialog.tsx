"use client";

import { useAuth } from "@/components/auth-provider";
import { usePos } from "@/components/pos/pos-provider";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import {
  completeSale,
  type CompletedSale,
  type PaymentMethod,
} from "@/lib/services/sales";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  ReceiptText,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";

type PaymentDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function PaymentDialog({ open, onClose }: PaymentDialogProps) {
  const { organization, branch } = useAuth();
  const { basket, total, selectedCustomer, resetSale } = usePos();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(
    null
  );
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (!open && !receiptOpen) {
    return null;
  }

  async function handleCompleteSale() {
    if (!organization || !branch) {
      setErrorMessage("No organization or branch is currently selected.");
      return;
    }

    if (basket.length === 0) {
      setErrorMessage("The basket is empty.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const sale = await completeSale({
        organizationId: organization.id,
        branchId: branch.id,
        customerId: selectedCustomer?.id ?? null,
        basket,
        paymentMethod,
        paymentReference,
        total,
        notes,
      });

      setCompletedSale(sale);
      resetSale();
    } catch (error: unknown) {
      console.error("Sale completion failed:", error);

      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("The sale could not be completed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetDialogState() {
    setPaymentMethod("CASH");
    setPaymentReference("");
    setNotes("");
    setErrorMessage("");
    setCompletedSale(null);
    setReceiptOpen(false);
  }

  function handleClose() {
    resetDialogState();
    onClose();
  }

  function handleViewReceipt() {
    if (!completedSale) {
      return;
    }

    setReceiptOpen(true);
  }

  function handleReceiptClose() {
    setReceiptOpen(false);
  }

  if (receiptOpen && completedSale) {
    return (
      <ReceiptDialog
        open={receiptOpen}
        saleId={completedSale.sale_id}
        onClose={handleReceiptClose}
      />
    );
  }

  if (!open) {
    return null;
  }

  if (completedSale) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>

          <h2 className="mt-5 text-2xl font-bold text-slate-900">
            Sale Complete
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            The sale, payment and inventory updates were recorded.
          </p>

          <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left">
            <div className="flex justify-between gap-4">
              <span className="text-sm text-slate-500">Receipt number</span>

              <strong className="text-sm text-slate-900">
                {completedSale.receipt_number}
              </strong>
            </div>

            <div className="mt-3 flex justify-between gap-4">
              <span className="text-sm text-slate-500">Total paid</span>

              <strong className="text-lg text-slate-900">
                £{Number(completedSale.total_amount).toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleViewReceipt}
              className="inline-flex items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ReceiptText className="mr-2 h-4 w-4" />
              View Receipt
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              Start New Sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Take Payment
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Select how the customer is paying.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close payment dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 rounded-xl bg-slate-900 p-5 text-white">
          <p className="text-sm text-slate-300">Total due</p>
          <p className="mt-1 text-3xl font-bold">£{total.toFixed(2)}</p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-slate-700">Payment method</p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod("CASH")}
              className={`rounded-xl border p-4 text-left ${
                paymentMethod === "CASH"
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200"
              }`}
            >
              <Banknote className="h-5 w-5 text-slate-700" />
              <p className="mt-3 font-medium text-slate-900">Cash</p>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod("CARD")}
              className={`rounded-xl border p-4 text-left ${
                paymentMethod === "CARD"
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200"
              }`}
            >
              <CreditCard className="h-5 w-5 text-slate-700" />
              <p className="mt-3 font-medium text-slate-900">Card</p>
            </button>
          </div>
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">
            Payment reference
          </label>

          <input
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder={
              paymentMethod === "CARD"
                ? "Card terminal reference"
                : "Optional reference"
            }
          />
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">
            Sale notes
          </label>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            rows={3}
            placeholder="Optional notes"
          />
        </div>

        {errorMessage && (
          <div className="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-medium">Sale could not be completed</p>
              <p className="mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 rounded-lg border px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={submitting}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Completing Sale..." : "Complete Sale"}
          </button>
        </div>
      </div>
    </div>
  );
}
