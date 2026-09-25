"use client";

import { useState } from "react";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { createBranch, updateBranch, type BranchRecord } from "@/lib/services/branches";

const fields = [
  ["name", "Branch name", 200], ["email", "Email", 320], ["phone", "Phone", 50],
  ["address_line_1", "Address line 1", 300], ["address_line_2", "Address line 2", 300],
  ["city", "City", 120], ["county", "County", 120], ["postcode", "Postcode", 40], ["country", "Country", 120],
] as const;

export function BranchDialog({ organizationId, branch, onClose, onSaved }: {
  organizationId: string; branch?: BranchRecord; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({ name: branch?.name ?? "", email: branch?.email ?? "", phone: branch?.phone ?? "",
    address_line_1: branch?.address_line_1 ?? "", address_line_2: branch?.address_line_2 ?? "", city: branch?.city ?? "",
    county: branch?.county ?? "", postcode: branch?.postcode ?? "", country: branch?.country ?? "United Kingdom" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      if (branch) await updateBranch(organizationId, branch.id, form);
      else await createBranch(organizationId, { ...form, code });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save branch."); setBusy(false); return; }
    onClose();
    await onSaved();
  }
  return <AppDialog open title={branch ? "Edit branch" : "Create branch"} onClose={onClose} closeDisabled={busy}
    description={branch ? `Code ${branch.code} is permanent. Head-office status cannot be changed.` : "You will receive access to this branch. Other staff assignments and your default branch stay as they are."}
    footer={<AppDialogFooter><AppDialogCancelButton onClick={onClose} disabled={busy} /><AppDialogActionButton onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : branch ? "Save changes" : "Create branch"}</AppDialogActionButton></AppDialogFooter>}>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      {!branch && <label className="text-sm font-medium">Branch code *<input value={code} onChange={event => setCode(event.target.value)} maxLength={64} required className="mt-1 w-full rounded-lg border px-3 py-2 uppercase" /><span className="mt-1 block text-xs text-slate-500">Unique within this organisation; cannot be changed later.</span></label>}
      {fields.map(([key, label, max]) => <label key={key} className="text-sm font-medium">{label}{key === "name" || key === "country" ? " *" : ""}<input
        value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}
        required={key === "name" || key === "country"} type={key === "email" ? "email" : "text"} maxLength={max}
        className="mt-1 w-full rounded-lg border px-3 py-2" /></label>)}
      <button type="submit" hidden disabled={busy}>Save</button>
    </fieldset></form>
  </AppDialog>;
}
