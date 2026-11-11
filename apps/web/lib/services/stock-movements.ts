import type { ExportPage } from "@/lib/services/export-pagination";
import { withCosts } from "@/lib/services/financial-projections";
import { supabase } from "@/lib/supabase/client";

export async function getStockMovements(
  organizationId: string,
  branchId: string,
  exportPage?: ExportPage
) {
  if (!organizationId || !branchId) throw new Error("Organisation and branch are required.");
  let query = supabase
    .from("stock_movements")
    .select(
      `
      id,organization_id,branch_id,product_id,movement_type,quantity,reference,notes,created_by,created_at,
      products:product_id (
        id,
        name,
        sku
      )
    `,
      exportPage ? { count: "exact" } : {}
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: Boolean(exportPage) });

  if (exportPage) {
    query = query.order("id", { ascending: true }).range(exportPage.offset, exportPage.offset + exportPage.size - 1);
    if (exportPage.start) query = query.gte("created_at", exportPage.start);
    if (exportPage.end) query = query.lt("created_at", exportPage.end);
  }
  const { data, error, count } = await query;
  exportPage?.reportCount(count);

  if (error) throw error;

  return withCosts(data ?? [], organizationId, branchId, "stock_movements", "unit_cost");
}
