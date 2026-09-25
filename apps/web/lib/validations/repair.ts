import { z } from "zod";

export const repairStatuses = ["received", "diagnosing", "awaiting_approval", "awaiting_parts", "in_repair", "ready_for_collection", "collected", "cancelled"] as const;
export const repairOutcomes = ["repaired", "no_fault_found", "unrepaired", "beyond_economic_repair", "customer_declined", "other"] as const;
export const repairPriorities = ["low", "normal", "high", "urgent"] as const;
export const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER"] as const;
export type RepairStatus = typeof repairStatuses[number];
export type RepairOutcome = typeof repairOutcomes[number];
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const money = z.number().finite().min(0).max(9999999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Use at most two decimal places.").nullable();
export const repairCreateSchema = z.object({
  customer_id: z.string().uuid(),
  product_id: z.string().uuid().nullable(),
  product_serial_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  brand_id: z.string().uuid().nullable(),
  device_type: z.string().trim().min(1, "Enter the device type.").max(120),
  brand_name: optionalText(120),
  model: z.string().trim().min(1, "Enter the device model.").max(200),
  imei: z.string().regex(/^[0-9]{15}$/, "IMEI must contain exactly 15 digits.").nullable(),
  serial_number: optionalText(120),
  accessories_received: optionalText(5000),
  fault_description: z.string().trim().min(1, "Describe the reported fault.").max(5000),
  physical_condition: optionalText(5000),
  intake_notes: optionalText(5000),
  priority: z.enum(repairPriorities),
  assigned_to: z.string().uuid().nullable(),
  estimated_amount: money,
  estimated_completion_at: z.string().datetime().nullable(),
});
export type RepairCreateInput = z.infer<typeof repairCreateSchema>;
export const repairUpdateSchema = z.object({
  priority: z.enum(repairPriorities),
  estimated_amount: money,
  final_amount: money,
  estimated_completion_at: z.string().datetime().nullable(),
  parts_notes: optionalText(5000), labour_notes: optionalText(5000),
  internal_notes: optionalText(5000), customer_notes: optionalText(5000),
});
export type RepairUpdateInput = z.infer<typeof repairUpdateSchema>;
// Convert Zod issues at the service boundary rather than displaying its JSON message.
export function parseRepairInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = String(issue.path[0] ?? "Repair details");
  const message = field === "imei" ? "IMEI must contain exactly 15 digits."
    : `${repairLabel(field)}: ${issue.message}`;
  throw new Error(message);
}
export function repairLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase());
}
// Guidance only; the database is the authoritative transition boundary.
export function availableRepairStatuses(status: RepairStatus): RepairStatus[] {
  if (status === "collected") return ["diagnosing"];
  if (status === "cancelled") return ["diagnosing", "collected"];
  if (status === "received") return ["diagnosing", "cancelled"];
  return repairStatuses.filter(next => next !== status && next !== "received" && (next !== "collected" || status === "ready_for_collection"));
}
