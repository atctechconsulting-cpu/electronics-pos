import { z } from "zod";

export const warrantyStatuses = ["RECEIVED", "ASSESSING", "APPROVED", "IN_PROGRESS", "RESOLVED", "REJECTED", "CANCELLED"] as const;
export type WarrantyStatus = typeof warrantyStatuses[number];
export const warrantyTransitions: Record<WarrantyStatus, WarrantyStatus[]> = {
  RECEIVED: ["ASSESSING", "CANCELLED"], ASSESSING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: [], REJECTED: [], CANCELLED: [],
};
const id = z.string().uuid().nullable();
const text = (max: number) => z.string().trim().max(max).nullable();
export const warrantyInputSchema = z.object({
  customer_id: z.string().uuid(), product_id: id, source_product_serial_id: id,
  device_description: z.string().trim().min(1).max(200), reported_fault: z.string().trim().min(1).max(5000),
  serial_number_snapshot: text(120), imei_snapshot: text(120), intake_notes: text(5000),
  source_sale_id: id, source_sale_item_id: id, purchase_date_snapshot: z.string().date().nullable(),
  evidence_class: z.enum(["VERIFIED_INTERNAL", "PROBABLE_INTERNAL", "EXTERNAL_MANUAL"]),
  terms_source: z.enum(["SALE_SNAPSHOT", "MANUAL", "UNKNOWN"]),
  warranty_months_snapshot: z.number().int().min(0).max(1200).nullable(),
  warranty_expiry_date: z.string().date().nullable(), evidence_notes: text(5000),
}).superRefine((v, ctx) => {
  if (v.terms_source === "MANUAL") {
    if (!v.evidence_notes?.trim()) ctx.addIssue({ code: "custom", path: ["evidence_notes"], message: "Describe the evidence inspected." });
    if (v.warranty_months_snapshot !== null && !v.purchase_date_snapshot) ctx.addIssue({ code: "custom", path: ["purchase_date_snapshot"], message: "Purchase date is required for calendar-month terms." });
    if (v.warranty_months_snapshot === null && !v.warranty_expiry_date) ctx.addIssue({ code: "custom", path: ["warranty_expiry_date"], message: "Supply a duration and purchase date, or an explicit expiry date." });
  }
});
export type WarrantyInput = z.infer<typeof warrantyInputSchema>;
export function warrantyLabel(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()); }
export function warrantyTerms(months: number | null | undefined, source: string) {
  if (source === "UNKNOWN" || months === undefined) return "Warranty terms not snapshotted — assessment required";
  if (months === 0) return "No warranty (0 months)";
  return months === null ? "Manual expiry date" : `${months} calendar months`;
}
