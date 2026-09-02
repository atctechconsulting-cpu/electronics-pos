"use client";

import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogFooter,
} from "@/components/ui/app-dialog";

import {
  createSupplierInvoice,
  type SupplierInvoiceRow,
} from "@/lib/services/supplier-invoices";

import type { PurchaseOrderDetails } from "@/lib/services/purchase-orders";

type CreateSupplierInvoiceDialogProps = {
  purchaseOrder: PurchaseOrderDetails;
  existingInvoice?: SupplierInvoiceRow | null;
  onSuccess?: () => void | Promise<void>;
};

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

export function CreateSupplierInvoiceDialog({
  purchaseOrder,
  existingInvoice,
  onSuccess,
}: CreateSupplierInvoiceDialogProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreateInvoice =
    purchaseOrder.status === "ORDERED" ||
    purchaseOrder.status === "PARTIALLY_RECEIVED" ||
    purchaseOrder.status === "RECEIVED";

  const invoiceTotal = useMemo(
    () => Number(purchaseOrder.total_amount),
    [purchaseOrder.total_amount]
  );

  function resetForm() {
    setInvoiceNumber("");
    setInvoiceDate(today());
    setDueDate("");
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
    const normalizedInvoiceNumber = invoiceNumber.trim();

    if (!normalizedInvoiceNumber) {
      setError("Supplier invoice number is required.");
      return;
    }

    if (!invoiceDate) {
      setError("Invoice date is required.");
      return;
    }

    if (dueDate && dueDate < invoiceDate) {
      setError("Due date cannot be before the invoice date.");
      return;
    }

    if (invoiceTotal <= 0) {
      setError("Purchase order total must be greater than zero.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const result = await createSupplierInvoice({
        supplierId: purchaseOrder.supplier_id,
        branchId: purchaseOrder.branch_id,
        purchaseOrderId: purchaseOrder.id,

        invoiceNumber: normalizedInvoiceNumber,
        invoiceDate,
        dueDate: dueDate || null,

        subtotal: Number(purchaseOrder.subtotal),
        taxAmount: Number(purchaseOrder.tax_amount),
        discountAmount: Number(purchaseOrder.discount_amount),
        totalAmount: Number(purchaseOrder.total_amount),

        notes,
      });

      setOpen(false);
      resetForm();

      if (onSuccess) {
        await onSuccess();
      }

      router.push(`/accounts-payable/${result.supplier_invoice_id}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create supplier invoice."
      );
    } finally {
      setSaving(false);
    }
  }

  if (existingInvoice) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/accounts-payable/${existingInvoice.id}`)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
      >
        <FilePlus2 className="h-4 w-4" />
        View Supplier Invoice
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!canCreateInvoice}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FilePlus2 className="h-4 w-4" />
        Create Supplier Invoice
      </button>

      <AppDialog
        open={open}
        title="Create Supplier Invoice"
        description={`Record the supplier invoice received for purchase order ${purchaseOrder.po_number}.`}
        onClose={handleClose}
        closeDisabled={saving}
        maxWidth="lg"
        footer={
          <AppDialogFooter>
            <AppDialogCancelButton onClick={handleClose} disabled={saving}>
              Cancel
            </AppDialogCancelButton>

            <AppDialogActionButton onClick={handleSubmit} disabled={saving}>
              {saving ? "Creating Invoice..." : "Create Invoice"}
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

          <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Supplier
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {purchaseOrder.supplier_name}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Purchase Order
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {purchaseOrder.po_number}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Branch
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {purchaseOrder.branch_name}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Invoice Total
              </p>

              <p className="mt-1 font-semibold text-slate-950">
                {formatCurrency(invoiceTotal)}
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="supplier-invoice-number"
              className="text-sm font-medium text-slate-700"
            >
              Supplier Invoice Number
            </label>

            <input
              id="supplier-invoice-number"
              type="text"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              disabled={saving}
              placeholder="e.g. INV-2026-1045"
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />

            <p className="mt-1.5 text-xs text-slate-500">
              Enter the invoice number shown on the supplier's invoice.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="supplier-invoice-date"
                className="text-sm font-medium text-slate-700"
              >
                Invoice Date
              </label>

              <input
                id="supplier-invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supplier-invoice-due-date"
                className="text-sm font-medium text-slate-700"
              >
                Due Date
              </label>

              <input
                id="supplier-invoice-due-date"
                type="date"
                value={dueDate}
                min={invoiceDate || undefined}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />

              <p className="mt-1.5 text-xs text-slate-500">
                Optional if the supplier has not specified payment terms.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="supplier-invoice-notes"
              className="text-sm font-medium text-slate-700"
            >
              Notes
            </label>

            <textarea
              id="supplier-invoice-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Optional invoice notes..."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Financial Summary
            </p>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Subtotal</span>

                <span className="font-medium text-slate-900">
                  {formatCurrency(Number(purchaseOrder.subtotal))}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Discount</span>

                <span className="font-medium text-slate-900">
                  -{formatCurrency(Number(purchaseOrder.discount_amount))}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Tax</span>

                <span className="font-medium text-slate-900">
                  {formatCurrency(Number(purchaseOrder.tax_amount))}
                </span>
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between gap-4">
                  <span className="font-semibold text-slate-950">
                    Total Due
                  </span>

                  <span className="text-lg font-semibold text-slate-950">
                    {formatCurrency(invoiceTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            Creating this invoice will add the full purchase order value to
            Accounts Payable. Payments can then be recorded separately until the
            invoice is fully settled.
          </div>
        </div>
      </AppDialog>
    </>
  );
}
