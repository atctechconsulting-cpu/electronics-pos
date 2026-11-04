import { withCosts } from "@/lib/services/financial-projections";
import { supabase } from "@/lib/supabase/client";

export async function getStockMovements(
  organizationId: string,
  branchId: string
) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      `
      id,organization_id,branch_id,product_id,movement_type,quantity,reference,notes,created_by,created_at,
      products:product_id (
        id,
        name,
        sku
      )
    `
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return withCosts(data ?? [], organizationId, branchId, "stock_movements", "unit_cost");
}
