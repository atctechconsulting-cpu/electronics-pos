"use client";
import { useEffect, useRef, useState } from "react";
import { lookupWarrantyEvidence, type WarrantyEvidence, type WarrantyScope } from "@/lib/services/warranty";
import { warrantyLabel, warrantyTerms } from "@/lib/validations/warranty";

export const warrantyField = "w-full rounded-lg border p-2 text-sm";
export const warrantyButton = "rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50";
export function WarrantyEvidenceLookup({ scope, onSelect }: { scope: WarrantyScope; onSelect: (e: WarrantyEvidence) => void }) {
  const [kind, setKind] = useState("receipt"), [search, setSearch] = useState("");
  const [rows, setRows] = useState<WarrantyEvidence[]>([]), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  async function lookup() {
    const token = ++request.current; setRows([]); setBusy(true); setNotice("");
    try { const data = await lookupWarrantyEvidence(scope, kind, search); if (token === request.current) { setRows(data.matches); setNotice(data.scope_notice); } }
    catch (e) { if (token === request.current) setNotice(e instanceof Error ? e.message : "Lookup failed."); }
    finally { if (token === request.current) setBusy(false); }
  }
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">
    <select aria-label="Evidence search type" className={warrantyField + " max-w-40"} value={kind} onChange={e => setKind(e.target.value)}>{["receipt", "imei", "serial", "customer", "product"].map(k => <option key={k} value={k}>{warrantyLabel(k)}</option>)}</select>
    <input aria-label="Evidence search" className={warrantyField + " max-w-sm"} value={search} onChange={e => setSearch(e.target.value)} placeholder="Receipt, exact identifier, customer or product" />
    <button type="button" className={warrantyButton} disabled={busy || search.trim().length < 2} onClick={lookup}>{busy ? "Searching…" : "Search evidence"}</button>
  </div><p role="status" className="text-sm text-slate-600">{notice}</p>
    {rows.map((r, i) => <div key={`${r.source_sale_item_id}-${r.source_product_serial_id}-${i}`} className="rounded-lg border p-3 text-sm">
      <p className="font-medium">{r.receipt_number} · {r.product_name} · {r.source_branch_name}</p><p>{r.imei_snapshot || r.serial_number_snapshot || "Exact unit attribution requires review"}</p>
      <p>{warrantyLabel(r.evidence_class)} · {warrantyTerms(r.warranty_months_snapshot, r.terms_source)}</p><p>{r.provenance}</p>
      <p>{r.return_evidence_access ? `Recorded returned quantity: ${r.returned_quantity}` : "Return evidence unavailable with your permissions — review required"}</p>
      <button type="button" className={warrantyButton + " mt-2"} onClick={() => onSelect(r)}>Use this evidence</button>
    </div>)}
  </div>;
}
