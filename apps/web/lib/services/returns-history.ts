import { supabase } from "@/lib/supabase/client";

export type ReturnHistoryRow = {
  id: string;
  return_number: string;
  refund_amount: number;
  refund_method: string;
  status: string;
  created_at: string;

  original_receipt: string;
  customer_name: string;
  processed_by: string;
};

export type ReturnsWorkspaceScope = {
  organizationId: string;
  branchId: string;
};

export async function getReturnsHistory({
  organizationId,
  branchId,
}: ReturnsWorkspaceScope): Promise<ReturnHistoryRow[]> {
  if (!organizationId || !branchId) {
    return [];
  }

  const { data, error } = await supabase
    .from("returns")
    .select(
      `
      id,
      return_number,
      refund_amount,
      refund_method,
      status,
      created_at,

      sales:sale_id (
        receipt_number
      ),

      customers:customer_id (
        first_name,
        last_name,
        company_name
      ),

      profiles:processed_by (
        full_name
      )
    `
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Failed to load returns history:", error);

    throw new Error(error.message || "Unable to load returns history.");
  }

  return (data ?? []).map((row) => {
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;

    const customer = Array.isArray(row.customers)
      ? row.customers[0]
      : row.customers;

    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;

    let customerName = "Walk-in Customer";

    if (customer) {
      customerName =
        customer.company_name ||
        `${customer.first_name} ${customer.last_name ?? ""}`.trim();
    }

    return {
      id: row.id,
      return_number: row.return_number,
      refund_amount: Number(row.refund_amount),
      refund_method: row.refund_method,
      status: row.status,
      created_at: row.created_at,
      original_receipt: sale?.receipt_number ?? "-",
      customer_name: customerName,
      processed_by: profile?.full_name ?? "Unknown",
    };
  });
}
