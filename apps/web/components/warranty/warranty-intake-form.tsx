"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listCustomers, type Customer } from "@/lib/services/customers";
import type { WarrantyClaim, WarrantyScope } from "@/lib/services/warranty";
import type { WarrantyInput } from "@/lib/validations/warranty";
import { warrantyLabel, warrantyTerms } from "@/lib/validations/warranty";
import { WarrantyEvidenceLookup, warrantyButton, warrantyField } from "./warranty-evidence-lookup";

const blank: WarrantyInput = { customer_id: "", product_id: null, source_product_serial_id: null, device_description: "", reported_fault: "",
  serial_number_snapshot: null, imei_snapshot: null, intake_notes: null, source_sale_id: null, source_sale_item_id: null,
  purchase_date_snapshot: null, evidence_class: "EXTERNAL_MANUAL", terms_source: "UNKNOWN", warranty_months_snapshot: null,
  warranty_expiry_date: null, evidence_notes: null };
function initialInput(claim?: WarrantyClaim): WarrantyInput {
  if (!claim) return blank;
  return Object.fromEntries(Object.keys(blank).map(k => [k, claim[k as keyof WarrantyInput] ?? blank[k as keyof WarrantyInput]])) as WarrantyInput;
}
export function WarrantyIntakeForm({ scope, claim, onSave }: { scope: WarrantyScope; claim?: WarrantyClaim; onSave: (value: WarrantyInput) => Promise<void> }) {
  const [value, setValue] = useState<WarrantyInput>(() => initialInput(claim));
  const [customers, setCustomers] = useState<Customer[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; let current = true;
    listCustomers(scope.organizationId).then(rows => { if (current) setCustomers(rows); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; alive.current = false; };
  }, [scope.organizationId]);
  function field<K extends keyof WarrantyInput>(key: K, val: WarrantyInput[K]) { setValue(v => ({ ...v, [key]: val })); }
  return <form className="space-y-5" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await onSave(value); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Unable to save claim."); } finally { if (alive.current) setBusy(false); } }}>
    <WarrantyEvidenceLookup scope={scope} onSelect={r => setValue(v => ({ ...v, source_sale_id: r.source_sale_id, source_sale_item_id: r.source_sale_item_id,
      product_id: r.product_id, source_product_serial_id: r.source_product_serial_id, device_description: r.product_name,
      serial_number_snapshot: r.serial_number_snapshot, imei_snapshot: r.imei_snapshot, customer_id: r.customer_id || v.customer_id,
      evidence_class: r.evidence_class, terms_source: r.terms_source, warranty_months_snapshot: r.warranty_months_snapshot,
      purchase_date_snapshot: r.purchase_date_snapshot, warranty_expiry_date: null }))} />
    <p className="text-sm">{warrantyLabel(value.evidence_class)} · {warrantyTerms(value.warranty_months_snapshot, value.terms_source)}</p>
    {value.source_sale_id && <button type="button" className={warrantyButton} onClick={() => setValue(v => ({ ...blank, customer_id: v.customer_id, device_description: v.device_description, reported_fault: v.reported_fault }))}>Clear source evidence / use manual intake</button>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Customer<select required className={warrantyField} value={value.customer_id} onChange={e => field("customer_id", e.target.value)}><option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.phone || c.customer_code}</option>)}</select><Link className="underline" href="/customers" target="_blank">Manage customers</Link></label>
      <label className="text-sm">Device / model<input required maxLength={200} className={warrantyField} value={value.device_description} onChange={e => field("device_description", e.target.value)} /></label>
      {(["serial_number_snapshot", "imei_snapshot"] as const).map(k => <label key={k} className="text-sm">{k === "imei_snapshot" ? "IMEI" : "Serial number"}<input maxLength={120} disabled={!!value.source_product_serial_id} className={warrantyField} value={value[k] || ""} onChange={e => field(k, e.target.value || null)} /></label>)}
      <label className="text-sm">Terms source<select className={warrantyField} value={value.terms_source} onChange={e => field("terms_source", e.target.value as WarrantyInput["terms_source"])}><option value="UNKNOWN">Unknown — assessment required</option><option value="MANUAL">Manual evidence</option>{value.source_sale_id && <option value="SALE_SNAPSHOT">Sale-time snapshot</option>}</select></label>
      {value.terms_source === "MANUAL" && <>
        <label className="text-sm">Purchase date<input type="date" className={warrantyField} value={value.purchase_date_snapshot || ""} onChange={e => field("purchase_date_snapshot", e.target.value || null)} /></label>
        <label className="text-sm">Warranty months (0 = no warranty)<input type="number" min={0} max={1200} className={warrantyField} value={value.warranty_months_snapshot ?? ""} onChange={e => field("warranty_months_snapshot", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className="text-sm">Explicit expiry (when duration is unknown)<input type="date" disabled={value.warranty_months_snapshot !== null} className={warrantyField} value={value.warranty_expiry_date || ""} onChange={e => field("warranty_expiry_date", e.target.value || null)} /></label>
      </>}
    </div>
    {(["reported_fault", "intake_notes", "evidence_notes"] as const).map(k => <label className="block text-sm" key={k}>{warrantyLabel(k)}<textarea required={k === "reported_fault" || (k === "evidence_notes" && value.terms_source === "MANUAL")} maxLength={5000} className={warrantyField} value={value[k] || ""} onChange={e => field(k, e.target.value || (k === "reported_fault" ? "" : null))} /></label>)}
    {claim && <p className="text-sm text-amber-800">Saving evidence returns this claim to assessment and clears the previous eligibility decision.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className={warrantyButton + " bg-slate-900 text-white"}>{busy ? "Saving…" : claim ? "Save and reassess" : "Create claim"}</button>
  </form>;
}
