import { supabase } from "@/lib/supabase/client";

export type BusinessReportSummary = {
  gross_sales: number;
  refunds: number;
  net_sales: number;

  gross_cogs: number;
  returned_cogs: number;
  net_cogs: number;

  gross_profit: number;
  gross_margin: number;

  transaction_count: number;
  units_sold: number;

  discount_amount: number;
  vat_amount: number;

  average_order_value: number;
};

export type BusinessPosition = {
  inventory_quantity: number;
  inventory_value: number;

  supplier_outstanding: number;
  supplier_overdue: number;
};

export type SalesTrendPoint = {
  date: string;

  gross_sales: number;
  refunds: number;
  net_sales: number;

  cogs: number;
  gross_profit: number;

  transactions: number;
};

export type TopProductReport = {
  product_id: string;
  product_name: string;
  sku: string | null;

  units_sold: number;

  revenue: number;
  cogs: number;

  gross_profit: number;
  gross_margin: number;
};

export type BranchPerformanceReport = {
  branch_id: string;
  branch_name: string;

  transactions: number;

  net_sales: number;
  cogs: number;

  gross_profit: number;
  gross_margin: number;
};

export type BusinessReport = {
  period: {
    start_date: string;
    end_date: string;
    branch_id: string | null;
  };

  summary: BusinessReportSummary;

  business_position: BusinessPosition;

  sales_trend: SalesTrendPoint[];

  top_products: TopProductReport[];

  branch_performance: BranchPerformanceReport[];
};

export type GetBusinessReportInput = {
  startDate: string;
  endDate: string;
  branchId?: string | null;
};

export async function getBusinessReport(
  input: GetBusinessReportInput
): Promise<BusinessReport> {
  const { data, error } = await supabase.rpc("get_business_report", {
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_branch_id: input.branchId ?? null,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Reporting service returned no data.");
  }

  return data as BusinessReport;
}
