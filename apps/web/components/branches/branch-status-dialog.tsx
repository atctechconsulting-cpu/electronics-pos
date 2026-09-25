"use client";
import { useState } from "react";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { setBranchActiveStatus, type BranchRecord } from "@/lib/services/branches";

export function BranchStatusDialog({ organizationId, branch, onClose, onSaved }: {
  organizationId: string; branch: BranchRecord; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await setBranchActiveStatus(organizationId, branch.id, !branch.is_active); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change branch status."); setBusy(false); return; }
    onClose(); await onSaved();
  }
  return <AppDialog open title={`${branch.is_active ? "Deactivate" : "Activate"} ${branch.name}`} onClose={onClose} closeDisabled={busy} maxWidth="lg"
    footer={<AppDialogFooter><AppDialogCancelButton onClick={onClose} disabled={busy} /><AppDialogActionButton onClick={() => void save()} disabled={busy} variant={branch.is_active ? "danger" : "primary"}>{busy ? "Saving…" : branch.is_active ? "Deactivate branch" : "Activate branch"}</AppDialogActionButton></AppDialogFooter>}>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <p className="text-sm leading-6 text-slate-600">{branch.is_active
      ? "This branch will disappear from operational branch options. Stock, uncollected repairs and open purchase orders must be cleared first. Head office and the final active branch cannot be deactivated. Historical records and staff assignments are retained. New transactions, including returns, require reactivation."
      : "This branch will become operational again for its assigned staff. Existing memberships, roles and historical records will be retained."}</p>
  </AppDialog>;
}
