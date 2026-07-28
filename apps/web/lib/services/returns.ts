import type { RefundMethod } from "@/components/returns/refund-method-selector";
import type { ReturnItemSelection } from "@/components/returns/return-item-row";
import { supabase } from "@/lib/supabase/client";

export type CompletedReturn = {
  return_id: string;
  return_number: string;
  sale_id: string;
  refund_amount: number;
  refund_method: RefundMethod;
  status: string;
};

type CompleteSaleReturnInput = {
  saleId: string;
  selections: ReturnItemSelection[];
  refundMethod: RefundMethod;
  reason?: string;
  notes?: string;
};

export async function completeSaleReturn({
  saleId,
  selections,
  refundMethod,
  reason,
  notes,
}: CompleteSaleReturnInput): Promise<CompletedReturn> {
  if (selections.length === 0) {
    throw new Error("Select at least one item to return.");
  }

  const items = selections.map((selection) => ({
    sale_item_id: selection.sale_item_id,
    quantity: selection.quantity,
    restock: selection.restock,
    serial_ids: selection.serial_ids,
  }));

  const { data, error } = await supabase.rpc("complete_sale_return", {
    p_sale_id: saleId,
    p_items: items,
    p_refund_method: refundMethod,
    p_reason: reason?.trim() || null,
    p_notes: notes?.trim() || null,
  });

  if (error) {
    console.error("Return RPC failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw new Error(
      error.message ||
        error.details ||
        error.hint ||
        "The return could not be completed."
    );
  }

  if (!data) {
    throw new Error(
      "The return completed without returning transaction details."
    );
  }

  return {
    return_id: data.return_id,
    return_number: data.return_number,
    sale_id: data.sale_id,
    refund_amount: Number(data.refund_amount),
    refund_method: data.refund_method,
    status: data.status,
  };
}
