import { supabase } from "@/lib/supabase/client";
import { assertValidImei } from "@/lib/validations/imei";
import { receivingError } from "@/lib/services/receiving-errors";

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

  if (!input.reference?.trim()) throw new Error("A stock reference is required.");
  if (isTracked && identifiers.length !== input.quantity) {
    throw new Error(input.requires_imei
      ? "An IMEI is required for each IMEI-tracked unit."
      : "A serial number is required for each serialized-only unit.");
  }
  if (new Set(identifierValues).size !== identifierValues.length) {
    throw new Error("Duplicate identifiers were entered. Each unit must have a unique identifier.");
  }

  const { data, error } = await Promise.resolve(supabase.rpc("receive_stock", {
    p_organization_id: input.organization_id,
    p_branch_id: input.branch_id,
    p_product_id: input.product_id,
    p_quantity: input.quantity,
    p_unit_cost: input.unit_cost,
    p_reference: input.reference,
    p_notes: input.notes ?? null,
    p_identifiers: identifiers,
  })).catch(error => { throw receivingError(error); });

  if (error) {
    throw receivingError(error);
  }

  return data;
}
