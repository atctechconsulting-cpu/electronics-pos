"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader, SectionCard, StatusBadge, Currency } from "@/components/ui/alpha-components";
import { getRepairDetail, getRepairAssignees, updateRepair, assignRepairStaff, type RepairDetail, type RepairJob, type RepairScope, type RepairPayment, type Assignee } from "@/lib/services/repairs";
import { repairPriorities, repairLabel, type RepairUpdateInput } from "@/lib/validations/repair";
import { RepairField, RepairError, inputClass, buttonClass, secondaryClass, displayDate, localDateTime } from "./repair-fields";
import { RepairStatusDialog } from "./repair-status-dialog";
import { RepairPaymentDialog } from "./repair-payment-dialog";
import { RepairPrintDialog } from "./repair-print-dialog";

function WorkEditor({ job, scope, assignees, onSaved }: { job: RepairJob; scope: RepairScope; assignees: Assignee[]; onSaved: () => void }) {
  const [form, setForm] = useState({ priority: job.priority, estimated_amount: job.estimated_amount?.toString() ?? "", final_amount: job.final_amount?.toString() ?? "", estimated_completion_at: localDateTime(job.estimated_completion_at), parts_notes: job.parts_notes ?? "", labour_notes: job.labour_notes ?? "", internal_notes: job.internal_notes ?? "", customer_notes: job.customer_notes ?? "" });
  const [assignee, setAssignee] = useState(job.assigned_to ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await updateRepair(scope, job, { ...form, priority: form.priority as RepairUpdateInput["priority"],
        estimated_amount: form.estimated_amount === "" ? null : Number(form.estimated_amount), final_amount: form.final_amount === "" ? null : Number(form.final_amount),
        estimated_completion_at: form.estimated_completion_at ? new Date(form.estimated_completion_at).toISOString() : null });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save repair."); setBusy(false); }
  }
  async function assign() {
    setBusy(true); setError("");
    try { await assignRepairStaff(scope, job, assignee || null); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to assign staff."); setBusy(false); }
  }
  return <SectionCard title="Work, assignment & charges" contentClassName="space-y-5 p-5">
    <RepairError message={error} />
    <div className="flex flex-col items-end gap-3 sm:flex-row"><div className="w-full"><RepairField label="Assigned staff"><select disabled={busy} className={inputClass} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{job.assigned_to && !assignees.some(a => a.user_id === job.assigned_to) && <option value={job.assigned_to}>{job.assigned_name} (no longer eligible)</option>}{assignees.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || "Staff member"}</option>)}</select></RepairField></div><button type="button" className={`${secondaryClass} shrink-0`} disabled={busy || assignee === (job.assigned_to ?? "")} onClick={() => void assign()}>Save assignment</button></div>
    <form onSubmit={save}><fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
      <RepairField label="Priority"><select className={inputClass} value={form.priority} onChange={e => change("priority", e.target.value)}>{repairPriorities.map(p => <option key={p} value={p}>{repairLabel(p)}</option>)}</select></RepairField>
      <RepairField label="Expected completion"><input type="datetime-local" className={inputClass} value={form.estimated_completion_at} onChange={e => change("estimated_completion_at", e.target.value)} /></RepairField>
      <RepairField label="Estimate (£)"><input type="number" min="0" step="0.01" className={inputClass} value={form.estimated_amount} onChange={e => change("estimated_amount", e.target.value)} /></RepairField>
      <RepairField label="Agreed final charge (£)"><input type="number" min="0" step="0.01" disabled={job.status === "collected"} className={inputClass} placeholder="Leave blank until agreed" value={form.final_amount} onChange={e => change("final_amount", e.target.value)} />{job.status === "collected" && <p className="text-xs text-slate-500">Final charge is fixed after collection.</p>}</RepairField>
      {([['parts_notes', 'Parts notes (internal; no stock changes)'], ['labour_notes', 'Labour / diagnosis notes (internal)'], ['internal_notes', 'Internal notes'], ['customer_notes', 'Customer-facing work summary / notes (printed)']] as const).map(([key, label]) => <RepairField key={key} label={label}><textarea rows={4} maxLength={5000} className={inputClass} value={form[key]} onChange={e => change(key, e.target.value)} /></RepairField>)}
    </div><div className="text-right"><button type="submit" className={buttonClass}>{busy ? "Saving…" : "Save work & charges"}</button></div></fieldset></form>
  </SectionCard>;
}

export function RepairDetailPage({ repairId }: { repairId: string }) {
  const { organization, branch } = useAuth();
  const [detail, setDetail] = useState<RepairDetail | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState<"status" | "payment" | "intake" | "collection" | null>(null);
  const [reversal, setReversal] = useState<RepairPayment | undefined>();
  const orgId = organization?.id; const branchId = branch?.id;
  const reload = useCallback(() => { setRefresh(value => value + 1); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId || !branchId) return;
      setLoading(true); setError(""); setDetail(null);
      try {
        const result = await getRepairDetail({ organizationId: orgId, branchId }, repairId);
        if (cancelled) return;
        setDetail(result);
        if (result.job.can_manage) { const staff = await getRepairAssignees({ organizationId: orgId, branchId }); if (!cancelled) setAssignees(staff); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load repair."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [orgId, branchId, repairId, refresh]);
  if (!organization || !branch) return <p>Select an organisation and branch.</p>;
  const scope = { organizationId: organization.id, branchId: branch.id };
  if (loading) return <p className="p-8 text-slate-500">Loading repair…</p>;
  if (!detail) return <div className="space-y-4"><RepairError message={error || "Repair not found in this workspace."} /><button className={secondaryClass} onClick={reload}>Retry</button><Link className="ml-4 underline" href="/repairs">Back to repairs</Link></div>;
  const { job, payments, events } = detail;
  return <div className="space-y-6">
    <PageHeader title={job.job_number} description={`${job.branch_name} · Received ${displayDate(job.received_at)}`} actions={<>
      <Link className={secondaryClass} href="/repairs">Repairs queue</Link><button className={secondaryClass} onClick={reload}>Refresh</button>
      <button className={secondaryClass} onClick={() => setDialog("intake")}>Print intake</button>
      <button className={secondaryClass} disabled={!job.collected_at} onClick={() => setDialog("collection")}>Collection receipt</button>
      {job.can_manage && <button className={buttonClass} onClick={() => setDialog("status")}>Status / collection</button>}
    </>} />
    <RepairError message={error} />
    <div className="flex flex-wrap items-center gap-3"><StatusBadge status={job.status} /><StatusBadge status={job.priority} /><StatusBadge status={job.payment_status} />{job.repair_outcome && <span className="text-sm">Outcome: {repairLabel(job.repair_outcome)}</span>}</div>
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Customer & device" contentClassName="space-y-3 p-5 text-sm"><p className="font-semibold">{job.customer_name}</p><p>{job.customer_phone || "No phone recorded"} · {job.customer_email || "No email recorded"}</p><hr /><p>{job.device_type} · {job.brand_name} {job.model}</p>{job.product_name && <p>Catalogue: {job.product_name}</p>}<p>IMEI: {job.imei || "—"}<br />Serial: {job.serial_number || "—"}</p><p>Assigned: {job.assigned_name || "Unassigned"}</p></SectionCard>
      <SectionCard title="Intake & dates" contentClassName="space-y-3 p-5 text-sm"><p className="whitespace-pre-wrap"><strong>Fault:</strong> {job.fault_description}</p><p className="whitespace-pre-wrap"><strong>Condition:</strong> {job.physical_condition || "Not recorded"}</p><p className="whitespace-pre-wrap"><strong>Accessories:</strong> {job.accessories_received || "None recorded"}</p><p className="whitespace-pre-wrap"><strong>Internal intake notes:</strong> {job.intake_notes || "None"}</p><p>Expected: {displayDate(job.estimated_completion_at)}<br />Work completed: {displayDate(job.completed_at)}<br />Cancelled: {displayDate(job.cancelled_at)}<br />Collected: {displayDate(job.collected_at)}</p></SectionCard>
    </div>
    {job.can_manage ? <WorkEditor key={job.version} job={job} scope={scope} assignees={assignees} onSaved={reload} /> : <SectionCard title="Work & notes" contentClassName="grid gap-4 p-5 sm:grid-cols-2">{[["Parts",job.parts_notes],["Labour / diagnosis",job.labour_notes],["Internal notes",job.internal_notes],["Customer notes",job.customer_notes]].map(([label,text]) => <div key={label}><h3 className="text-sm font-semibold">{label}</h3><p className="whitespace-pre-wrap text-sm">{text || "—"}</p></div>)}</SectionCard>}
    <SectionCard title="Charges & payments" description="Amounts charged to the customer. Blank final charge means not yet agreed." actions={job.can_manage ? <button className={buttonClass} disabled={job.deposit_remaining <= 0} onClick={() => { setReversal(undefined); setDialog("payment"); }}>Record payment</button> : undefined} contentClassName="p-5">
      <div className="mb-5 grid gap-4 sm:grid-cols-4">{[["Estimate",job.estimated_amount],["Final charge",job.final_amount],["Net paid",job.paid_amount],["Outstanding",job.outstanding_balance]].map(([label,amount]) => <div key={String(label)}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{amount === null ? "Not agreed" : <Currency amount={Number(amount)} />}</p></div>)}</div>
      {payments.length === 0 ? <p className="text-sm text-slate-500">No payments recorded. Set an estimate or final charge to accept payment.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b"><th className="py-2">Date / staff</th><th>Method / reference</th><th>Amount</th><th>Entry</th><th /></tr></thead><tbody>{payments.map(payment => {
        const reversed = payments.some(p => p.reverses_payment_id === payment.id);
        return <tr key={payment.id} className="border-b"><td className="py-3">{displayDate(payment.received_at)}<p className="text-xs text-slate-500">{payment.received_by_name}</p></td><td>{repairLabel(payment.payment_method.toLowerCase())}<p className="text-xs">{payment.reference}</p></td><td><Currency amount={payment.reverses_payment_id ? -payment.amount : payment.amount} /></td><td>{payment.reverses_payment_id ? "Reversal" : reversed ? "Reversed payment" : "Payment"}<p className="max-w-xs whitespace-pre-wrap text-xs">{payment.reversal_reason}</p></td><td>{job.can_manage && !payment.reverses_payment_id && !reversed && <button className={secondaryClass} onClick={() => { setReversal(payment); setDialog("payment"); }}>Reverse</button>}</td></tr>;
      })}</tbody></table></div>}
    </SectionCard>
    <SectionCard title="History" contentClassName="p-5"><ol className="space-y-5">{events.map(event => <li key={event.id} className="border-l-2 border-slate-200 pl-4"><p className="text-sm font-semibold">{repairLabel(event.event_type)}{event.new_status ? ` · ${event.previous_status ? repairLabel(event.previous_status) + " → " : ""}${repairLabel(event.new_status)}` : ""}</p><p className="text-xs text-slate-500">{displayDate(event.created_at)} · {event.actor_name || "Staff member"}</p>{event.note && <p className="mt-1 whitespace-pre-wrap text-sm">{event.note}</p>}{event.event_type === "updated" && <p className="mt-1 text-xs text-slate-600">Changed: {Object.keys(event.changed_values).map(repairLabel).join(", ") || "No field changes"}</p>}{(event.event_type === "payment" || event.event_type === "reversal") && <p className="text-sm"><Currency amount={Number(event.changed_values.amount)} /></p>}</li>)}</ol></SectionCard>
    {dialog === "status" && <RepairStatusDialog job={job} scope={scope} onClose={() => setDialog(null)} onSaved={reload} />}
    {dialog === "payment" && <RepairPaymentDialog job={job} scope={scope} reversal={reversal} onClose={() => setDialog(null)} onSaved={reload} />}
    {(dialog === "intake" || dialog === "collection") && <RepairPrintDialog detail={detail} kind={dialog} onClose={() => setDialog(null)} />}
  </div>;
}
