import { supabase } from "@/lib/supabase/client";

export type SalesHistoryRecord = {
  id: string;
  receipt_number: string;
  status: string;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total_amount: number;
  completed_at: string | null;
  created_at: string;

  customer: {
    id: string;
    customer_code: string;
    first_name: string;
    last_name: string | null;
    company_name: string | null;
    phone: string | null;
  } | null;

  branch: {
    id: string;
    name: string;
  } | null;

  cashier: {
    id: string;
    full_name: string | null;
  } | null;

  payments: {
    id: string;
    payment_method: string;
    amount: number;
    reference: string | null;
  }[];
};

export type SalesWorkspaceScope = {
  organizationId: string;
  branchId: string;
};

type GetSalesHistoryInput = SalesWorkspaceScope & {
  search?: string;
};

export async function getSalesHistory({
  organizationId,
  branchId,
  search = "",
}: GetSalesHistoryInput): Promise<SalesHistoryRecord[]> {
  if (!organizationId || !branchId) {
    return [];
  }

  let query = supabase
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
      completed_at,
      created_at,

      customers:customer_id (
        id,
        customer_code,
        first_name,
        last_name,
        company_name,
        phone
      ),

      branches:branch_id (
        id,
        name
      ),

      profiles:cashier_id (
        id,
        full_name
      ),

      payments (
        id,
        payment_method,
        amount,
        reference
      )
    `
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("status", "COMPLETED")
    .order("completed_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(100);

  const trimmedSearch = search.trim();

  if (trimmedSearch) {
    query = query.ilike("receipt_number", `%${trimmedSearch}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load sales history:", error);

    throw new Error(error.message || "Unable to load sales history.");
  }

  return (data ?? []).map((sale) => {
    const customer = Array.isArray(sale.customers)
      ? sale.customers[0]
      : sale.customers;

    const branch = Array.isArray(sale.branches)
      ? sale.branches[0]
      : sale.branches;

    const cashier = Array.isArray(sale.profiles)
      ? sale.profiles[0]
      : sale.profiles;

    return {
      id: sale.id,
      receipt_number: sale.receipt_number,
      status: sale.status,
      subtotal: Number(sale.subtotal),
      vat_amount: Number(sale.vat_amount),
      discount_amount: Number(sale.discount_amount),
      total_amount: Number(sale.total_amount),
      completed_at: sale.completed_at,
      created_at: sale.created_at,

      customer: customer
        ? {
            id: customer.id,
            customer_code: customer.customer_code,
            first_name: customer.first_name,
            last_name: customer.last_name,
            company_name: customer.company_name,
            phone: customer.phone,
          }
        : null,

      branch: branch
        ? {
            id: branch.id,
            name: branch.name,
          }
        : null,

      cashier: cashier
        ? {
            id: cashier.id,
            full_name: cashier.full_name,
          }
        : null,

      payments: (sale.payments ?? []).map((payment) => ({
        id: payment.id,
        payment_method: payment.payment_method,
        amount: Number(payment.amount),
        reference: payment.reference,
      })),
    };
  });
}
