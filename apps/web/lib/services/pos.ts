import { supabase } from "@/lib/supabase/client";
import type { PosIdentifier, PosProduct } from "@/lib/pos-basket";

export async function searchPosProducts(organizationId: string, branchId: string, query: string): Promise<PosProduct[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase.rpc("search_pos_products", {
    p_organization_id: organizationId, p_branch_id: branchId, p_query: query.trim(),
  });
  if (error) throw new Error("Unable to search products in this workspace.");
  return (data ?? []).map((row: PosProduct) => ({ ...row,
    retail_price: Number(row.retail_price), quantity_available: Number(row.quantity_available),
  }));
}

export async function getPosIdentifiers(organizationId: string, branchId: string, productId: string): Promise<PosIdentifier[]> {
  const { data, error } = await supabase.rpc("get_pos_identifiers", {
    p_organization_id: organizationId, p_branch_id: branchId, p_product_id: productId,
  });
  if (error) throw new Error("Unable to load available devices in this workspace. Refresh and try again.");
  return data ?? [];
}
