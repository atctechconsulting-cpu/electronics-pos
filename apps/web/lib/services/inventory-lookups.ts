import { supabase } from "@/lib/supabase/client";

export async function getInventoryProducts(organizationId: string) {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      supplier_id,
      is_serialized,
      requires_imei,
      suppliers:supplier_id (
        id,
        name
      )
    `)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;

  return data;
}