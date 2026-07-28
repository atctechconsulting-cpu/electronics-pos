"use client";

import type { ReturnItemSelection } from "@/components/returns/return-item-row";
import { Currency } from "@/components/ui/alpha-components";
import type { SaleDetailItem } from "@/lib/services/sale-details";

type ReturnSummaryProps = {
  items: SaleDetailItem[];
  selections: Record<string, ReturnItemSelection | null>;
  refundMethod: string;
};

export function ReturnSummary({
  items,
  selections,
  refundMethod,
}: ReturnSummaryProps) {
  const selectedRows = items
    .map((item) => ({
      item,
      selection: selections[item.id],
    }))
    .filter(
      (
        entry
      ): entry is {
        item: SaleDetailItem;
        selection: ReturnItemSelection;
      } => Boolean(entry.selection)
    );

  const selectedItemCount = selectedRows.reduce(
    (sum, entry) => sum + entry.selection.quantity,
    0
  );

  const refundTotal =
    refundMethod === "NO_REFUND"
      ? 0
      : selectedRows.reduce(
          (sum, entry) =>
            sum + entry.item.unit_price * entry.selection.quantity,
          0
        );

  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Return Summary</h3>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Selected products</span>

          <span className="font-medium text-slate-900">
            {selectedRows.length}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Units being returned</span>

          <span className="font-medium text-slate-900">
            {selectedItemCount}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Refund method</span>

          <span className="text-right font-medium text-slate-900">
            {refundMethod.replaceAll("_", " ")}
          </span>
        </div>

        <div className="flex justify-between border-t pt-3 text-lg font-bold text-slate-900">
          <span>Refund total</span>

          <Currency amount={refundTotal} />
        </div>
      </div>

      {selectedRows.length === 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Select at least one sale item to continue.
        </p>
      )}

      {refundMethod === "NO_REFUND" && selectedRows.length > 0 && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          This return will be recorded without issuing a monetary refund.
        </p>
      )}
    </div>
  );
}
