import { supabase } from "@/lib/supabase/client";

export async function getStockMovements(
  organizationId: string,
  branchId: string
) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(`
      *,
      products:product_id (
        id,
        name,
        sku
      )
    `)
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data;
}