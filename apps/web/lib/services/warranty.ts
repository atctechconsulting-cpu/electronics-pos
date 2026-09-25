import { supabase } from "@/lib/supabase/client";
import { warrantyInputSchema, type WarrantyInput, type WarrantyStatus } from "@/lib/validations/warranty";

export type WarrantyScope = { organizationId: string; branchId: string };
export type WarrantyClaim = WarrantyInput & {
  id: string; organization_id: string; servicing_branch_id: string; claim_number: string;
  customer_name_snapshot: string; customer_phone_snapshot: string | null; customer_email_snapshot: string | null;
  receipt_number_snapshot: string | null; status: WarrantyStatus; eligibility_decision: string;
  eligibility_reason?: string | null; resolution: string | null; resolution_notes?: string | null;
  customer_summary: string | null; repair_job_id?: string | null; return_item_id?: string | null;
  version: number; created_at: string; assessed_at: string | null; closed_at: string | null;
  can_manage: boolean; source_evidence_access: boolean; branch_active: boolean; branch_name: string; organization_name: string;
};
export type WarrantySummary = Pick<WarrantyClaim, "id" | "claim_number" | "customer_name_snapshot" | "device_description" | "status" | "created_at">;
export type WarrantyDetail = { claim: WarrantyClaim; refund_evidence_access: boolean; events: { id: string; event_type: string; previous_status: string | null; new_status: string; created_at: string }[]; refund_options: { id: string; return_number: string }[] };
export type WarrantyEvidence = Pick<WarrantyInput, "source_sale_id" | "source_sale_item_id" | "product_id" | "source_product_serial_id" | "imei_snapshot" | "serial_number_snapshot" | "warranty_months_snapshot" | "purchase_date_snapshot" | "terms_source" | "evidence_class"> & {
  receipt_number: string; product_name: string; source_branch_name: string; customer_id: string | null;
  provenance: string; returned_quantity: number | null; return_evidence_access: boolean;
};
async function rpc<T>(name: string, scope: WarrantyScope, args: Record<string, unknown> = {}): Promise<T> {
  if (!scope.organizationId || !scope.branchId) throw new Error("Select an organisation and branch.");
  const { data, error } = await supabase.rpc(name, { p_org: scope.organizationId, p_branch: scope.branchId, ...args });
  if (error) throw new Error(error.message || "Unable to complete Warranty operation.");
  return data as T;
}
function input(value: WarrantyInput) {
  const result = warrantyInputSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues.map(i => `${i.path.join(" ")}: ${i.message}`).join(" "));
  return result.data;
}
export const lookupWarrantyEvidence = (s: WarrantyScope, kind: string, search: string) => rpc<{ matches: WarrantyEvidence[]; scope_notice: string }>("lookup_warranty_evidence", s, { p_kind: kind, p_search: search.trim() });
export const queryWarrantyClaims = (s: WarrantyScope, search: string, status: string, page: number) => rpc<{ claims: WarrantySummary[] }>("query_warranty_claims", s, { p_search: search, p_status: status || null, p_offset: page * 50 });
export const getWarrantyClaim = (s: WarrantyScope, id: string) => rpc<WarrantyDetail>("get_warranty_claim_detail", s, { p_claim: id });
export const createWarrantyClaim = (s: WarrantyScope, value: WarrantyInput, key: string) => rpc<string>("create_warranty_claim", s, { p_data: input(value), p_request_key: key });
export const updateWarrantyClaim = (s: WarrantyScope, c: WarrantyClaim, value: WarrantyInput) => rpc<void>("update_warranty_claim", s, { p_claim: c.id, p_version: c.version, p_data: input(value) });
export const transitionWarrantyClaim = (s: WarrantyScope, c: WarrantyClaim, status: WarrantyStatus, data: Record<string, unknown>) => rpc<void>("transition_warranty_claim", s, { p_claim: c.id, p_version: c.version, p_status: status, p_data: data });
export const linkWarrantyRepair = (s: WarrantyScope, c: WarrantyClaim, repair: string) => rpc<void>("link_warranty_repair", s, { p_claim: c.id, p_version: c.version, p_repair: repair });
export const createWarrantyRepair = (s: WarrantyScope, c: WarrantyClaim, deviceType: string) => rpc<string>("create_warranty_repair", s, { p_claim: c.id, p_version: c.version, p_device_type: deviceType });
