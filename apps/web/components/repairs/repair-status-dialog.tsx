"use client";
import { useState } from "react";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { changeRepairStatus, type RepairJob, type RepairScope } from "@/lib/services/repairs";
import { availableRepairStatuses, repairLabel, repairOutcomes, type RepairStatus } from "@/lib/validations/repair";
import { RepairField, RepairError, inputClass } from "./repair-fields";

export function RepairStatusDialog({ job, scope, onClose, onSaved }: { job: RepairJob; scope: RepairScope; onClose: () => void; onSaved: () => void }) {
  const choices = availableRepairStatuses(job.status);
  const [status, setStatus] = useState<RepairStatus>(choices[0]);
  const [outcome, setOutcome] = useState(job.repair_outcome ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await changeRepairStatus(scope, job, status, status === "ready_for_collection" ? outcome || null : null, reason.trim() || null); onClose(); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change status."); setBusy(false); }
  }
  return <AppDialog open title="Change repair status" description={`Current: ${repairLabel(job.status)}. Backwards changes, reopening and cancellation require a reason.`} onClose={onClose} closeDisabled={busy}
    footer={<AppDialogFooter><AppDialogCancelButton onClick={onClose} disabled={busy} /><AppDialogActionButton onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : status === "collected" ? "Confirm collection" : "Update status"}</AppDialogActionButton></AppDialogFooter>}>
    <div className="space-y-4"><RepairError message={error} />
      <RepairField label="New status"><select disabled={busy} className={inputClass} value={status} onChange={e => setStatus(e.target.value as RepairStatus)}>{choices.map(s => <option key={s} value={s}>{repairLabel(s)}</option>)}</select></RepairField>
      {status === "ready_for_collection" && <RepairField label="Repair outcome"><select disabled={busy} className={inputClass} value={outcome} onChange={e => setOutcome(e.target.value as typeof outcome)}><option value="">Not yet determined</option>{repairOutcomes.map(o => <option key={o} value={o}>{repairLabel(o)}</option>)}</select></RepairField>}
      <RepairField label="Reason / note"><textarea disabled={busy} className={inputClass} rows={3} maxLength={5000} value={reason} onChange={e => setReason(e.target.value)} /></RepairField>
      {status === "collected" && <p className="text-sm text-slate-600">Confirm the physical device has been handed back. The final charge must be agreed and fully settled.</p>}
      {status === "cancelled" && <p className="text-sm text-slate-600">Cancellation does not mark the device collected or reverse payments.</p>}
    </div>
  </AppDialog>;
}
