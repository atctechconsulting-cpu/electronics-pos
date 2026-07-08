import { supabase } from "@/lib/supabase/client";

export async function getInventory(organizationId: string, branchId: string) {
  const { data, error } = await supabase
    .from("inventory")
    .select(`
      *,
      products:product_id (
        id,
        name,
        sku,
        barcode,
        retail_price,
        is_serialized,
        requires_imei,
        categories:category_id (id, name),
        brands:brand_id (id, name)
      )
    `)
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data;
}