"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { getPosIdentifiers } from "@/lib/services/pos";
import { identifierLabel, type PosIdentifier, type PosProduct } from "@/lib/pos-basket";
import { isValidImei } from "@/lib/validations/imei";

type Props = {
  product: PosProduct;
  excludedIds: string[];
  remainingQuantity: number;
  onConfirm: (rows: PosIdentifier[]) => void;
  onClose: () => void;
};

export function IdentifierSelector({ product, excludedIds, remainingQuantity, onConfirm, onClose }: Props) {
  const { organization, branch } = useAuth();
  const [rows, setRows] = useState<PosIdentifier[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setSelectedIds([]);
    setLoading(true);
    setError("");
    if (!organization || !branch) { setLoading(false); return; }
    void getPosIdentifiers(organization.id, branch.id, product.id).then(data => {
      if (!cancelled) setRows(data.filter(row => product.requires_imei
        ? isValidImei(row.imei ?? "") : Boolean(row.serial_number?.trim())));
    }).catch(() => {
      if (!cancelled) setError("Unable to load available devices. Refresh and try again.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organization?.id, branch?.id, product.id, product.requires_imei, revision]);

  const eligible = rows.filter(row => !excludedIds.includes(row.id));
  const visible = eligible.filter(row => identifierLabel(product, row).toLowerCase().includes(query.trim().toLowerCase()));
  function confirm() {
    const selected = selectedIds.map(id => eligible.find(row => row.id === id)).filter((row): row is PosIdentifier => Boolean(row));
    if (!selected.length || selected.length !== selectedIds.length || selected.length > remainingQuantity) {
      setError("Refresh and select the available devices again."); return;
    }
    try { onConfirm(selected); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to add the selected devices."); }
  }
  return (
    <AppDialog open title={`Select ${product.requires_imei ? "IMEI" : "serial number"}`} description={product.name}
      onClose={onClose} maxWidth="lg" footer={<AppDialogFooter>
        <AppDialogCancelButton onClick={onClose} />
        <AppDialogActionButton disabled={loading || !selectedIds.length || selectedIds.length > remainingQuantity} onClick={confirm}>
          Add {selectedIds.length || "selected"} device{selectedIds.length === 1 ? "" : "s"}
        </AppDialogActionButton>
      </AppDialogFooter>}>
      <p className="mb-3 text-sm text-slate-600">Choose the exact device for each unit. Availability is checked again at checkout.</p>
      <div className="mb-4 flex gap-2">
        <input aria-label="Find identifier" placeholder="Type or scan the identifier" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-lg border px-3 py-2" />
        <button type="button" onClick={() => setRevision(value => value + 1)} className="rounded-lg border px-3 py-2">Refresh</button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {loading ? <p>Loading devices...</p> : <div className="space-y-2">
        {!visible.length && <p className="text-sm text-slate-500">No eligible devices found.</p>}
        {visible.map(row => <label key={row.id} className="flex items-center gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={selectedIds.includes(row.id)}
            disabled={!selectedIds.includes(row.id) && selectedIds.length >= remainingQuantity}
            onChange={e => setSelectedIds(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} />
          <span className="break-all font-mono text-sm">{identifierLabel(product, row)}</span>
        </label>)}
      </div>}
      <p className="mt-4 text-sm text-slate-600">{selectedIds.length} selected · Up to {remainingQuantity} additional units</p>
    </AppDialog>
  );
}
