import { supabase } from "@/lib/supabase/client";

export async function searchPosProducts(
  organizationId: string,
  branchId: string,
  query: string
) {
  const search = query.trim();

  if (!search) return [];

  const { data: matchingProducts, error: productError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      sku,
      barcode,
      retail_price,
      is_active
    `
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .or(
      `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`
    )
    .limit(20);

  if (productError) throw productError;

  const productIds = matchingProducts?.map((product) => product.id) ?? [];

  if (productIds.length === 0) return [];

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("inventory")
    .select(
      `
      quantity_available,
      product_id
    `
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gt("quantity_available", 0)
    .in("product_id", productIds);

  if (inventoryError) throw inventoryError;

  return inventoryRows.map((inventory) => ({
    quantity_available: inventory.quantity_available,
    products: matchingProducts.find(
      (product) => product.id === inventory.product_id
    ),
  }));
}
