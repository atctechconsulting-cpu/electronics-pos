"use client";

import {
  CheckCircle2,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  RefundMethodSelector,
  type RefundMethod,
} from "@/components/returns/refund-method-selector";
import {
  ReturnItemRow,
  type ReturnItemSelection,
} from "@/components/returns/return-item-row";
import { ReturnReceiptDialog } from "@/components/returns/return-receipt-dialog";
import { ReturnSummary } from "@/components/returns/return-summary";
import { Currency } from "@/components/ui/alpha-components";
import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogFooter,
} from "@/components/ui/app-dialog";
import {
  completeSaleReturn,
  type CompletedReturn,
} from "@/lib/services/returns";
import type { SaleDetails } from "@/lib/services/sale-details";

type ReturnItemsDialogProps = {
  open: boolean;
  sale: SaleDetails;
  onClose: () => void;
  onReturnCompleted: () => void | Promise<void>;
};

const returnReasons = [
  "Customer changed mind",
  "Faulty product",
  "Damaged product",
  "Incorrect item supplied",
  "Duplicate purchase",
  "Warranty return",
  "Other",
];

export function ReturnItemsDialog({
  open,
  sale,
  onClose,
  onReturnCompleted,
}: ReturnItemsDialogProps) {
  const [selections, setSelections] = useState<
    Record<string, ReturnItemSelection | null>
  >({});

  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");

  const [reason, setReason] = useState("");

  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [closing, setClosing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [completedReturn, setCompletedReturn] =
    useState<CompletedReturn | null>(null);

  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialSelections = sale.items.reduce<
      Record<string, ReturnItemSelection | null>
    >((result, item) => {
      result[item.id] = null;
      return result;
    }, {});

    setSelections(initialSelections);
    setRefundMethod("CASH");
    setReason("");
    setNotes("");
    setErrorMessage("");
    setCompletedReturn(null);
    setReceiptOpen(false);
    setSubmitting(false);
    setClosing(false);
  }, [open, sale]);

  const selectedItems = useMemo(
    () =>
      Object.values(selections).filter(
        (selection): selection is ReturnItemSelection => selection !== null
      ),
    [selections]
  );

  const totalRemainingReturnable = useMemo(
    () =>
      sale.items.reduce((total, item) => total + item.remaining_returnable, 0),
    [sale.items]
  );

  const nothingLeftToReturn = totalRemainingReturnable === 0;

  const refundTotal = useMemo(() => {
    if (refundMethod === "NO_REFUND") {
      return 0;
    }

    return selectedItems.reduce((total, selection) => {
      const saleItem = sale.items.find(
        (item) => item.id === selection.sale_item_id
      );

      if (!saleItem) {
        return total;
      }

      return total + saleItem.unit_price * selection.quantity;
    }, 0);
  }, [refundMethod, sale.items, selectedItems]);

  function updateSelection(
    saleItemId: string,
    selection: ReturnItemSelection | null
  ) {
    const item = sale.items.find((saleItem) => saleItem.id === saleItemId);

    if (selection && (!item || item.remaining_returnable <= 0)) {
      return;
    }

    setSelections((current) => ({
      ...current,
      [saleItemId]: selection,
    }));

    setErrorMessage("");
  }

  function validateReturn() {
    if (nothingLeftToReturn) {
      return "All items from this sale have already been returned.";
    }

    if (selectedItems.length === 0) {
      return "Select at least one item to return.";
    }

    for (const selection of selectedItems) {
      const item = sale.items.find(
        (saleItem) => saleItem.id === selection.sale_item_id
      );

      if (!item) {
        return "One of the selected sale items could not be found.";
      }

      if (
        selection.quantity < 1 ||
        selection.quantity > item.remaining_returnable
      ) {
        return `Only ${item.remaining_returnable} unit${
          item.remaining_returnable === 1 ? "" : "s"
        } of ${item.product_name} remain available for return.`;
      }

      if (
        item.serials.length > 0 &&
        selection.serial_ids.length !== selection.quantity
      ) {
        return `Select exactly ${selection.quantity} IMEI or serial number${
          selection.quantity === 1 ? "" : "s"
        } for ${item.product_name}.`;
      }
    }

    if (!reason.trim()) {
      return "Select a reason for the return.";
    }

    return null;
  }

  async function handleCompleteReturn() {
    const validationError = validateReturn();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const result = await completeSaleReturn({
        saleId: sale.id,
        selections: selectedItems,
        refundMethod,
        reason,
        notes,
      });

      setCompletedReturn(result);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The return could not be completed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose() {
    if (submitting || closing) {
      return;
    }

    if (completedReturn) {
      setClosing(true);

      try {
        await onReturnCompleted();
      } finally {
        setReceiptOpen(false);
        setClosing(false);
        onClose();
      }

      return;
    }

    setReceiptOpen(false);
    onClose();
  }

  if (receiptOpen && completedReturn) {
    return (
      <ReturnReceiptDialog
        open={receiptOpen}
        returnId={completedReturn.return_id}
        onClose={() => setReceiptOpen(false)}
      />
    );
  }

  if (completedReturn) {
    return (
      <AppDialog
        open={open}
        title="Return Complete"
        description="The return, refund and inventory updates were recorded successfully."
        onClose={() => void handleClose()}
        closeDisabled={closing}
        maxWidth="md"
        footer={
          <AppDialogFooter>
            <AppDialogCancelButton
              onClick={() => void handleClose()}
              disabled={closing}
            >
              {closing ? "Refreshing..." : "Done"}
            </AppDialogCancelButton>

            <AppDialogActionButton
              onClick={() => setReceiptOpen(true)}
              disabled={closing}
            >
              <ReceiptText className="mr-2 inline h-4 w-4" />
              View Return Receipt
            </AppDialogActionButton>
          </AppDialogFooter>
        }
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>

          <h3 className="mt-5 text-xl font-semibold text-slate-900">
            Customer return completed
          </h3>

          <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-slate-500">Return number</span>

              <strong className="font-mono text-slate-900">
                {completedReturn.return_number}
              </strong>
            </div>

            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="text-slate-500">Refund method</span>

              <strong className="text-slate-900">
                {completedReturn.refund_method.replaceAll("_", " ")}
              </strong>
            </div>

            <div className="mt-3 flex justify-between gap-4">
              <span className="text-sm text-slate-500">Refund amount</span>

              <Currency
                amount={completedReturn.refund_amount}
                className="text-lg font-bold text-slate-900"
              />
            </div>
          </div>
        </div>
      </AppDialog>
    );
  }

  return (
    <AppDialog
      open={open}
      title="Return Items"
      description={`Process a return against receipt ${sale.receipt_number}.`}
      onClose={() => void handleClose()}
      closeDisabled={submitting}
      maxWidth="3xl"
      footer={
        <AppDialogFooter>
          <AppDialogCancelButton
            onClick={() => void handleClose()}
            disabled={submitting}
          >
            Cancel
          </AppDialogCancelButton>

          <AppDialogActionButton
            onClick={handleCompleteReturn}
            disabled={
              submitting || selectedItems.length === 0 || nothingLeftToReturn
            }
            variant="danger"
          >
            {submitting
              ? "Completing Return..."
              : nothingLeftToReturn
                ? "Fully Returned"
                : "Complete Return"}
          </AppDialogActionButton>
        </AppDialogFooter>
      }
    >
      <div className="space-y-7">
        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white p-2">
              <RotateCcw className="h-5 w-5 text-slate-700" />
            </div>

            <div>
              <p className="font-medium text-slate-900">Original sale</p>

              <p className="mt-1 font-mono text-sm text-slate-600">
                {sale.receipt_number}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {new Date(sale.completed_at ?? sale.created_at).toLocaleString(
                  "en-GB"
                )}
              </p>
            </div>
          </div>
        </div>

        {nothingLeftToReturn && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />

              <div>
                <p className="font-medium text-green-800">
                  Sale fully returned
                </p>

                <p className="mt-1 text-sm text-green-700">
                  All items from this sale have already been returned. No
                  further return can be processed.
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 className="font-semibold text-slate-900">Select items</h3>

          <p className="mt-1 text-sm text-slate-500">
            Previously returned quantities are excluded automatically.
          </p>

          <div className="mt-4 space-y-4">
            {sale.items.map((item) => (
              <ReturnItemRow
                key={item.id}
                item={item}
                selection={selections[item.id] ?? null}
                disabled={submitting}
                onChange={(selection) => updateSelection(item.id, selection)}
              />
            ))}
          </div>
        </div>

        {!nothingLeftToReturn && (
          <>
            <RefundMethodSelector
              value={refundMethod}
              onChange={setRefundMethod}
              disabled={submitting}
            />

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Return reason
                </label>

                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={submitting}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 disabled:opacity-50"
                >
                  <option value="">Select a reason</option>

                  {returnReasons.map((returnReason) => (
                    <option key={returnReason} value={returnReason}>
                      {returnReason}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Return notes
                </label>

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={submitting}
                  rows={3}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 disabled:opacity-50"
                  placeholder="Optional additional information"
                />
              </div>
            </div>

            <ReturnSummary
              items={sale.items}
              selections={selections}
              refundMethod={refundMethod}
            />

            {selectedItems.length > 0 && (
              <div className="flex justify-between rounded-xl bg-slate-900 p-5 text-white">
                <span className="font-medium">Refund to customer</span>

                <Currency amount={refundTotal} className="text-xl font-bold" />
              </div>
            )}
          </>
        )}

        {errorMessage && (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-medium">Return could not be completed</p>

              <p className="mt-1">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  );
}
