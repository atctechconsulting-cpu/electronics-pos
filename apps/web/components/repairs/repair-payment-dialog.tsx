"use client";
import { useRef, useState } from "react";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { Currency } from "@/components/ui/alpha-components";
import { recordRepairPayment, reverseRepairPayment, type RepairJob, type RepairPayment, type RepairScope } from "@/lib/services/repairs";
import { paymentMethods, repairLabel } from "@/lib/validations/repair";
import { RepairField, RepairError, inputClass } from "./repair-fields";

export function RepairPaymentDialog({ job, scope, reversal, onClose, onSaved }: { job: RepairJob; scope: RepairScope; reversal?: RepairPayment; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  async function save() {
    setError("");
    if (reversal ? !reason.trim() : !Number.isFinite(Number(amount)) || Number(amount) <= 0) { setError(reversal ? "Enter a reversal reason." : "Enter a positive amount."); return; }
    const fingerprint = JSON.stringify([job.id, reversal?.id, amount, method, reference.trim(), reason.trim()]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    try {
      if (reversal) await reverseRepairPayment(scope, job.id, reversal.id, reason.trim(), request.current.key);
      else await recordRepairPayment(scope, job.id, Number(amount), method, reference.trim() || null, request.current.key);
      onClose(); onSaved();
    } catch (e) { setError((e instanceof Error ? e.message : "Payment could not be confirmed.") + " If the connection failed, retry here with the same details or refresh the job before starting another payment."); setBusy(false); }
  }
  return <AppDialog open title={reversal ? "Reverse repair payment" : "Record repair payment"} description="Record money already received or returned through your normal cash/card process. This does not charge or refund a card automatically." onClose={onClose} closeDisabled={busy}
    footer={<AppDialogFooter><AppDialogCancelButton disabled={busy} onClick={onClose} /><AppDialogActionButton variant={reversal ? "danger" : "primary"} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : reversal ? "Record reversal" : "Record payment"}</AppDialogActionButton></AppDialogFooter>}>
    <div className="space-y-4"><RepairError message={error} />
      {reversal ? <><p>Reverse the full payment of <Currency amount={reversal.amount} />. The original entry remains in the ledger.</p><RepairField label="Reason *"><textarea className={inputClass} disabled={busy} rows={3} maxLength={5000} value={reason} onChange={e => setReason(e.target.value)} /></RepairField></> : <>
        <p className="text-sm text-slate-600">{job.final_amount === null ? "Estimate remaining for deposits" : "Outstanding balance"}: <Currency amount={job.deposit_remaining} /></p>
        <RepairField label="Amount (£)"><input type="number" min="0.01" step="0.01" max={job.deposit_remaining} disabled={busy} className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} /></RepairField>
        <RepairField label="Method"><select className={inputClass} disabled={busy} value={method} onChange={e => setMethod(e.target.value)}>{paymentMethods.map(m => <option key={m} value={m}>{repairLabel(m.toLowerCase())}</option>)}</select></RepairField>
        <RepairField label="Reference"><input className={inputClass} disabled={busy} maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></RepairField>
      </>}
    </div>
  </AppDialog>;
}
