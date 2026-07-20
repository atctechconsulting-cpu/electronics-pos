import type { PosBasketItem } from "@/components/pos/pos-provider";
import { supabase } from "@/lib/supabase/client";

export type PaymentMethod =
  "CASH" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT" | "GIFT_CARD";

type CompleteSaleInput = {
  organizationId: string;
  branchId: string;
  basket: PosBasketItem[];
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  total: number;
  notes?: string;
};

export type CompletedSale = {
  sale_id: string;
  receipt_number: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: string;
};

export async function completeSale({
  organizationId,
  branchId,
  basket,
  paymentMethod,
  paymentReference,
  total,
  notes,
}: CompleteSaleInput): Promise<CompletedSale> {
  const items = basket.map((item) => ({
    product_id: item.id,
    quantity: item.quantity,
  }));

  const payments = [
    {
      payment_method: paymentMethod,
      amount: Number(total.toFixed(2)),
      reference: paymentReference?.trim() || null,
    },
  ];

  const { data, error } = await supabase.rpc("complete_pos_sale", {
    p_organization_id: organizationId,
    p_branch_id: branchId,
    p_items: items,
    p_payments: payments,
    p_notes: notes?.trim() || null,
  });

  if (error) {
    console.error("Checkout RPC failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw new Error(
      error.message ||
        error.details ||
        error.hint ||
        "The sale could not be completed."
    );
  }

  if (!data) {
    throw new Error("The checkout completed without returning sale details.");
  }

  return data as CompletedSale;
}
