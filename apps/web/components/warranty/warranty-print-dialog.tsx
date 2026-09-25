"use client";
import { useRef, useState } from "react";
import { AppDialog, AppDialogActionButton, AppDialogFooter } from "@/components/ui/app-dialog";
import type { WarrantyClaim } from "@/lib/services/warranty";
import { warrantyLabel } from "@/lib/validations/warranty";
export function WarrantyPrintDialog({ claim, kind, onClose }: { claim: WarrantyClaim; kind: "intake" | "decision"; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null), [error, setError] = useState("");
  function print() {
    if (!ref.current) return;
    const popup = window.open("", "_blank", "width=850,height=900");
    if (!popup) { setError("Allow pop-ups to print this document."); return; }
    popup.opener = null; popup.document.title = claim.claim_number;
    const style = popup.document.createElement("style"); style.textContent = "@page{size:A4;margin:16mm}body{font:14px Arial;line-height:1.6}p{white-space:pre-wrap;overflow-wrap:anywhere}";
    popup.document.head.appendChild(style); popup.document.body.appendChild(ref.current.cloneNode(true)); popup.focus(); popup.print();
  }
  return <AppDialog open title={kind === "intake" ? "Warranty intake sheet" : "Warranty decision / resolution"} onClose={onClose} footer={<AppDialogFooter><AppDialogActionButton onClick={print}>Print A4</AppDialogActionButton></AppDialogFooter>}>
    {error && <p role="alert">{error}</p>}<div ref={ref} className="space-y-4 p-4 text-sm">
      <h1 className="text-xl font-bold">{claim.organization_name}</h1><p>{claim.branch_name}</p><h2>{claim.claim_number} · Warranty {kind}</h2>
      <p>Received: {new Date(claim.created_at).toLocaleDateString("en-GB")}</p><p>{claim.customer_name_snapshot}<br />{claim.customer_phone_snapshot}<br />{claim.customer_email_snapshot}</p>
      <p>{claim.device_description}<br />IMEI: {claim.imei_snapshot || "Not recorded"}<br />Serial: {claim.serial_number_snapshot || "Not recorded"}</p>
      <p>Reported issue: {claim.reported_fault}</p>
      {kind === "intake" ? <p>This records receipt of a warranty claim. It does not confirm eligibility or approval.</p> : <><p>Status: {warrantyLabel(claim.status)}</p><p>{claim.customer_summary || "No customer-facing summary recorded."}</p>{claim.resolution && <p>Remedy: {warrantyLabel(claim.resolution)}</p>}</>}
      {claim.receipt_number_snapshot && <p>Original receipt: {claim.receipt_number_snapshot}</p>}
    </div>
  </AppDialog>;
}
