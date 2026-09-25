import { supabase } from "@/lib/supabase/client";
import { parseRepairInput, repairCreateSchema, repairUpdateSchema, type RepairCreateInput, type RepairUpdateInput, type RepairStatus, type RepairOutcome } from "@/lib/validations/repair";

export type RepairScope = { organizationId: string; branchId: string };
export type Assignee = { user_id: string; full_name: string | null };
export type RepairJob = RepairCreateInput & {
  id: string; organization_id: string; branch_id: string; job_number: string;
  organization_name: string; branch_name: string; customer_name: string;
  customer_phone: string | null; customer_email: string | null;
  product_name: string | null; assigned_name: string | null;
  status: RepairStatus; repair_outcome: RepairOutcome | null;
  parts_notes: string | null; labour_notes: string | null; internal_notes: string | null; customer_notes: string | null;
  final_amount: number | null; currency_code: string;
  received_at: string; completed_at: string | null; collected_at: string | null; cancelled_at: string | null;
  created_at: string; updated_at: string; version: number;
  paid_amount: number; outstanding_balance: number | null; deposit_remaining: number;
  payment_status: "unpaid" | "part_paid" | "paid"; can_manage: boolean;
};
export type RepairPayment = {
  id: string; amount: number; currency_code: string; payment_method: string; reference: string | null;
  received_by_name: string | null; received_at: string; reverses_payment_id: string | null; reversal_reason: string | null;
};
export type RepairEvent = {
  id: string; actor_name: string | null; event_type: string; previous_status: string | null;
  new_status: string | null; note: string | null; changed_values: Record<string, unknown>; created_at: string;
};
export type RepairDetail = { job: RepairJob; events: RepairEvent[]; payments: RepairPayment[] };
export type CatalogueProduct = { id: string; name: string; sku: string; category_id: string | null; brand_id: string | null };
export type CatalogueSerial = { id: string; product_id: string; imei: string | null; serial_number: string | null };
function scopeArgs(scope: RepairScope) {
  if (!scope.organizationId || !scope.branchId) throw new Error("Select an organisation and branch.");
  return { p_org: scope.organizationId, p_branch: scope.branchId };
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Unable to complete the repair operation.");
  return data as T;
}
export function queryRepairs(scope: RepairScope, filters: { search: string; status: string; priority: string; assignee: string; page: number }) {
  return rpc<{ jobs: RepairJob[]; total: number }>("query_repairs", { ...scopeArgs(scope), p_search: filters.search.trim(),
    p_status: filters.status || null, p_priority: filters.priority || null, p_assignee: filters.assignee || null, p_offset: filters.page * 50, p_limit: 50 });
}
export function getRepairDetail(scope: RepairScope, id: string) {
  return rpc<RepairDetail>("get_repair_detail", { ...scopeArgs(scope), p_job: id });
}
export function getRepairAssignees(scope: RepairScope) {
  return rpc<Assignee[]>("get_repair_assignees", scopeArgs(scope));
}
export function createRepair(scope: RepairScope, input: RepairCreateInput) {
  return rpc<string>("create_repair", { ...scopeArgs(scope), p_data: parseRepairInput(repairCreateSchema, input) });
}
export function updateRepair(scope: RepairScope, job: RepairJob, input: RepairUpdateInput) {
  return rpc<void>("update_repair", { ...scopeArgs(scope), p_job: job.id, p_version: job.version, p_data: parseRepairInput(repairUpdateSchema, input) });
}
export function assignRepairStaff(scope: RepairScope, job: RepairJob, assignee: string | null) {
  return rpc<void>("assign_repair_staff", { ...scopeArgs(scope), p_job: job.id, p_version: job.version, p_assignee: assignee });
}
export function changeRepairStatus(scope: RepairScope, job: RepairJob, status: RepairStatus, outcome: string | null, reason: string | null) {
  return rpc<void>("change_repair_status", { ...scopeArgs(scope), p_job: job.id, p_version: job.version, p_status: status, p_outcome: outcome, p_reason: reason });
}
export function recordRepairPayment(scope: RepairScope, jobId: string, amount: number, method: string, reference: string | null, requestKey: string) {
  return rpc<string>("record_repair_payment", { ...scopeArgs(scope), p_job: jobId, p_amount: amount, p_method: method, p_reference: reference, p_request_key: requestKey });
}
export function reverseRepairPayment(scope: RepairScope, jobId: string, paymentId: string, reason: string, requestKey: string) {
  return rpc<string>("reverse_repair_payment", { ...scopeArgs(scope), p_job: jobId, p_payment: paymentId, p_reason: reason, p_request_key: requestKey });
}
export async function searchRepairProducts(organizationId: string, search: string): Promise<CatalogueProduct[]> {
  let query = supabase.from("products").select("id,name,sku,category_id,brand_id").eq("organization_id", organizationId).eq("is_active", true);
  if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query.order("name").limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function getRepairSerials(scope: RepairScope, productId: string, search = "", field: "imei" | "serial_number" = "serial_number"): Promise<CatalogueSerial[]> {
  let query = supabase.from("product_serials").select("id,product_id,imei,serial_number")
    .eq("organization_id", scope.organizationId).eq("branch_id", scope.branchId).eq("product_id", productId);
  if (search.trim()) query = query.ilike(field, `%${search.trim()}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}
