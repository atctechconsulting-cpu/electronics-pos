import { supabase } from "@/lib/supabase/client";

// The database decides which costs are visible. Missing values stay null.
export async function withCosts<T extends { id: string }, C extends "cost_price" | "average_cost" | "unit_cost">(
  rows: T[], organizationId: string, branchId: string | null,
  kind: "products" | "purchase_products" | "inventory" | "stock_movements",
  column: C,
): Promise<Array<T & Record<C, number | null>>> {
  if (!rows.length) return [];
  const { data, error } = await supabase.rpc("get_cost_projection", {
    p_organization_id: organizationId, p_branch_id: branchId,
    p_kind: kind, p_ids: rows.map(row => row.id),
  });
  if (error) throw new Error("Unable to load financial access for this workspace.");
  const costs = new Map<string, number>((data ?? []).map((row: { id: string; cost: number }) => [row.id, Number(row.cost)]));
  return rows.map(row => ({ ...row, [column]: costs.get(row.id) ?? null }) as T & Record<C, number | null>);
}
