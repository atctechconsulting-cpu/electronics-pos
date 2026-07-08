import { supabase } from "@/lib/supabase/client";

type ReceiveStockInput = {
  organization_id: string;
  branch_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  reference: string;
  notes?: string | null;
  serial_numbers?: string[];
requires_imei?: boolean;
is_serialized?: boolean;
};

export async function receiveStock(input: ReceiveStockInput) {
  // 1. Get existing inventory
  const { data: existing } = await supabase
    .from("inventory")
    .select("*")
    .eq("branch_id", input.branch_id)
    .eq("product_id", input.product_id)
    .maybeSingle();

  if (existing) {
    const totalQty =
      existing.quantity_on_hand + input.quantity;

    const totalValue =
      existing.average_cost * existing.quantity_on_hand +
      input.unit_cost * input.quantity;

    const averageCost = totalValue / totalQty;

    const { error } = await supabase
      .from("inventory")
      .update({
        quantity_on_hand: totalQty,
        average_cost: averageCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("inventory")
      .insert({
        organization_id: input.organization_id,
        branch_id: input.branch_id,
        product_id: input.product_id,
        quantity_on_hand: input.quantity,
        average_cost: input.unit_cost,
      });

    if (error) throw error;
  }

  const { data: movement, error: movementError } = await supabase
  .from("stock_movements")
  .insert({
      organization_id: input.organization_id,
      branch_id: input.branch_id,
      product_id: input.product_id,
      movement_type: "RECEIPT",
      quantity: input.quantity,
      unit_cost: input.unit_cost,
      reference: input.reference,
      notes: input.notes ?? null,
    })
  .select("id")
  .single();

  if (movementError) throw movementError;

  if (input.serial_numbers?.length) {
  const serialRows = input.serial_numbers.map((value) => ({
    organization_id: input.organization_id,
    branch_id: input.branch_id,
    product_id: input.product_id,
    stock_movement_id: movement.id,
    status: "IN_STOCK",
    imei: input.requires_imei ? value : null,
    serial_number: input.is_serialized && !input.requires_imei ? value : null,
  }));

  const { error: serialError } = await supabase
    .from("product_serials")
    .insert(serialRows);

  if (serialError) throw serialError;
}
}