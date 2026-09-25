import { supabase } from "@/lib/supabase/client";
import { assertValidImei } from "@/lib/validations/imei";

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
  const isTracked =
    Boolean(input.requires_imei) || Boolean(input.is_serialized);

  const identifierValues = isTracked
    ? (input.serial_numbers ?? []).map((value) => value.trim()).filter(Boolean)
    : [];

  const identifiers = identifierValues.map((value) => ({
    serial_number: input.is_serialized && !input.requires_imei ? value : null,

    imei: input.requires_imei ? value : null,
  }));

  identifiers.forEach(identifier => assertValidImei(identifier.imei));

  const { data, error } = await supabase.rpc("receive_stock", {
    p_organization_id: input.organization_id,
    p_branch_id: input.branch_id,
    p_product_id: input.product_id,
    p_quantity: input.quantity,
    p_unit_cost: input.unit_cost,
    p_reference: input.reference,
    p_notes: input.notes ?? null,
    p_identifiers: identifiers,
  });

  if (error) {
    throw error;
  }

  return data;
}
