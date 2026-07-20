import { supabase } from "@/lib/supabase/client";

export type ReceiptItem = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  vat_amount: number;
};

export type ReceiptPayment = {
  id: string;
  payment_method: string;
  amount: number;
  reference: string | null;
};

export type ReceiptData = {
  sale_id: string;
  receipt_number: string;
  status: string;
  created_at: string;
  completed_at: string | null;

  organization_name: string;
  branch_name: string;
  cashier_name: string;
  cashier_email: string | null;

  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;

  items: ReceiptItem[];
  payments: ReceiptPayment[];
};

export async function getReceipt(saleId: string): Promise<ReceiptData> {
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select(
      `
      id,
      receipt_number,
      status,
      subtotal,
      vat_amount,
      discount_amount,
      total_amount,
      notes,
      created_at,
      completed_at,

      organizations:organization_id (
        id,
        name
      ),

      branches:branch_id (
        id,
        name
      ),

      profiles:cashier_id (
        id,
        full_name
      )
    `
    )
    .eq("id", saleId)
    .single();

  if (saleError) {
    console.error("Failed to load receipt sale:", saleError);
    throw new Error(saleError.message || "Unable to load the receipt.");
  }

  const { data: saleItems, error: itemsError } = await supabase
    .from("sale_items")
    .select(
      `
      id,
      product_id,
      quantity,
      unit_price,
      vat_amount,
      line_total,

      products:product_id (
        id,
        name,
        sku
      )
    `
    )
    .eq("sale_id", saleId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("Failed to load receipt items:", itemsError);
    throw new Error(itemsError.message || "Unable to load receipt items.");
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select(
      `
      id,
      payment_method,
      amount,
      reference
    `
    )
    .eq("sale_id", saleId)
    .order("created_at", { ascending: true });

  if (paymentsError) {
    console.error("Failed to load receipt payments:", paymentsError);
    throw new Error(
      paymentsError.message || "Unable to load receipt payments."
    );
  }

  const organization = Array.isArray(sale.organizations)
    ? sale.organizations[0]
    : sale.organizations;

  const branch = Array.isArray(sale.branches)
    ? sale.branches[0]
    : sale.branches;

  const cashier = Array.isArray(sale.profiles)
    ? sale.profiles[0]
    : sale.profiles;

  const items: ReceiptItem[] = (saleItems ?? []).map((item) => {
    const product = Array.isArray(item.products)
      ? item.products[0]
      : item.products;

    return {
      id: item.id,
      product_id: item.product_id,
      product_name: product?.name ?? "Unknown product",
      sku: product?.sku ?? "-",
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
      vat_amount: Number(item.vat_amount),
    };
  });

  const receiptPayments: ReceiptPayment[] = (payments ?? []).map((payment) => ({
    id: payment.id,
    payment_method: payment.payment_method,
    amount: Number(payment.amount),
    reference: payment.reference,
  }));

  return {
    sale_id: sale.id,
    receipt_number: sale.receipt_number,
    status: sale.status,
    created_at: sale.created_at,
    completed_at: sale.completed_at,

    organization_name: organization?.name ?? "AlphaPOS Business",
    branch_name: branch?.name ?? "Branch",
    cashier_name: cashier?.full_name ?? "Cashier",
    cashier_email: null,

    subtotal: Number(sale.subtotal),
    vat_amount: Number(sale.vat_amount),
    discount_amount: Number(sale.discount_amount),
    total_amount: Number(sale.total_amount),
    notes: sale.notes,

    items,
    payments: receiptPayments,
  };
}
