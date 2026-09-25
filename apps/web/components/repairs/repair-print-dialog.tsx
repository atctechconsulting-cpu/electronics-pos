"use client";
import { useRef, useState } from "react";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { Currency } from "@/components/ui/alpha-components";
import type { RepairDetail } from "@/lib/services/repairs";
import { repairLabel } from "@/lib/validations/repair";
import { displayDate, RepairError } from "./repair-fields";

export function RepairPrintDialog({ detail, kind, onClose }: { detail: RepairDetail; kind: "intake" | "collection"; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const { job, payments } = detail;
  function print() {
    if (!ref.current) return;
    const popup = window.open("", "_blank", "width=850,height=900");
    if (!popup) { setError("Allow pop-ups to print this document."); return; }
    popup.opener = null;
    popup.document.title = `${job.job_number} ${kind}`;
    const style = popup.document.createElement("style");
    style.textContent = "@page{size:A4;margin:16mm}body{font:13px Arial,sans-serif;color:#111;line-height:1.5}h1{font-size:23px}h2{font-size:16px;border-bottom:1px solid #ddd;margin-top:22px}p{white-space:pre-wrap;overflow-wrap:anywhere}.print-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.print-ack{margin-top:48px;border-top:1px solid #555;padding-top:8px}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #ddd;padding:6px}section{break-inside:avoid}";
    popup.document.head.appendChild(style);
    // Clone text rendered by React; no user-controlled HTML/template interpolation.
    popup.document.body.appendChild(ref.current.cloneNode(true));
    popup.focus(); popup.print();
  }
  return <AppDialog open title={kind === "intake" ? "Repair intake / job sheet" : "Repair collection receipt"} onClose={onClose} maxWidth="3xl"
    footer={<AppDialogFooter><AppDialogCancelButton onClick={onClose}>Close</AppDialogCancelButton><AppDialogActionButton onClick={print}>Print A4</AppDialogActionButton></AppDialogFooter>}>
    <RepairError message={error} />
    <div ref={ref} className="space-y-5 bg-white p-4 text-sm text-slate-900">
      <h1 className="text-xl font-bold">{job.organization_name}</h1><p>{job.branch_name}</p>
      <h2 className="font-semibold">{kind === "intake" ? "Repair Intake / Job Sheet" : "Repair Collection Receipt"} · {job.job_number}</h2>
      <div className="print-grid grid gap-4 sm:grid-cols-2"><section><h2>Customer</h2><p>{job.customer_name}</p><p>{job.customer_phone}</p><p>{job.customer_email}</p></section><section><h2>Device</h2><p>{job.device_type} · {job.brand_name} {job.model}</p><p>IMEI: {job.imei || "—"}<br />Serial: {job.serial_number || "—"}</p></section></div>
      {kind === "intake" ? <>
        <p>Received: {displayDate(job.received_at)}<br />Expected completion: {displayDate(job.estimated_completion_at)}</p>
        <section><h2>Reported fault</h2><p className="whitespace-pre-wrap">{job.fault_description}</p></section>
        <section><h2>Condition & accessories</h2><p className="whitespace-pre-wrap">{job.physical_condition || "Not recorded"}</p><p className="whitespace-pre-wrap">Accessories: {job.accessories_received || "None recorded"}</p></section>
        <p>Estimate: {job.estimated_amount === null ? "To be agreed" : <Currency amount={job.estimated_amount} />}</p>
        <p className="print-ack mt-12 border-t pt-4">Customer acknowledgement: ____________________ Date: ______________</p>
      </> : <>
        <p>Collected: {displayDate(job.collected_at)}</p><section><h2>Work / outcome</h2><p>{job.repair_outcome ? repairLabel(job.repair_outcome) : "Repair cancelled"}</p><p className="whitespace-pre-wrap">{job.customer_notes || "No additional customer notes."}</p></section>
        <h2>Payments</h2><table className="w-full text-left"><thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td>{displayDate(p.received_at)}</td><td>{p.reverses_payment_id ? "Reversal · " : ""}{repairLabel(p.payment_method.toLowerCase())}</td><td><Currency amount={p.reverses_payment_id ? -p.amount : p.amount} /></td></tr>)}</tbody></table>
        <p>Final charge: {job.final_amount === null ? "Not agreed" : <Currency amount={job.final_amount} />}<br />Net payments: <Currency amount={job.paid_amount} /><br />Balance: {job.outstanding_balance === null ? "Not agreed" : <Currency amount={job.outstanding_balance} />}</p>
      </>}
    </div>
  </AppDialog>;
}
