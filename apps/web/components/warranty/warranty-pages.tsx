"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui/alpha-components";
import { AppDialog, AppDialogActionButton, AppDialogFooter } from "@/components/ui/app-dialog";
import { createWarrantyClaim, createWarrantyRepair, getWarrantyClaim, linkWarrantyRepair, queryWarrantyClaims, transitionWarrantyClaim, updateWarrantyClaim, type WarrantyDetail, type WarrantyScope, type WarrantySummary } from "@/lib/services/warranty";
import { queryRepairs, type RepairJob } from "@/lib/services/repairs";
import { warrantyLabel, warrantyStatuses, warrantyTerms, warrantyTransitions, type WarrantyStatus } from "@/lib/validations/warranty";
import { WarrantyIntakeForm } from "./warranty-intake-form";
import { warrantyButton, warrantyField } from "./warranty-evidence-lookup";
import { WarrantyPrintDialog } from "./warranty-print-dialog";

// Remount every workspace, including while switching: old async responses cannot render in the new scope.
export function WarrantyPage({ mode, claimId, archiveBranch }: { mode: "queue" | "new" | "detail"; claimId?: string; archiveBranch?: string }) {
  const auth = useAuth();
  if (auth.loading || auth.accessLoading || auth.switchingContext) return <p>Loading workspace…</p>;
  if (!auth.organization) return <p>Select an organisation.</p>;
  return <WarrantyWorkspace key={`${auth.organization.id}:${auth.branch?.id ?? "none"}:${mode}:${claimId ?? ""}`} mode={mode} claimId={claimId} archiveBranch={archiveBranch} />;
}
function WarrantyWorkspace({ mode, claimId, archiveBranch }: { mode: "queue" | "new" | "detail"; claimId?: string; archiveBranch?: string }) {
  const { organization, branch, historicalBranches, historicalReadPermissions, hasPermission } = useAuth();
  const [archive, setArchive] = useState(archiveBranch || "");
  const archiveOptions = historicalBranches.filter(b => !b.is_active && historicalReadPermissions[b.id]?.includes("warranty.view"));
  const selected = archiveOptions.find(b => b.id === archive);
  const branchId = selected?.id || branch?.id;
  if (!organization) return null;
  const scope = { organizationId: organization.id, branchId: branchId || "" };
  const canManage = !selected && !!branch?.is_active && hasPermission("warranty.manage");
  return <div className="space-y-5">
    {mode !== "new" && archiveOptions.length > 0 && <label className="block max-w-sm text-sm">Historical branch (read only)<select className={warrantyField} value={archive} onChange={e => setArchive(e.target.value)}><option value="">Current workspace</option>{archiveOptions.map(b => <option key={b.id} value={b.id}>{b.name} — inactive</option>)}</select></label>}
    {!branchId ? <p>Select an available historical branch.</p> : mode === "new" ? canManage ? <NewClaim key={branchId} scope={scope} /> : <p>Warranty management permission and an active branch are required.</p>
      : mode === "detail" && claimId ? <ClaimDetail key={branchId} scope={scope} id={claimId} canManage={canManage} /> : <ClaimQueue key={branchId} scope={scope} canManage={canManage} />}
  </div>;
}
function NewClaim({ scope }: { scope: WarrantyScope }) {
  const router = useRouter(), [key] = useState(() => crypto.randomUUID()), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return <><PageHeader title="New warranty claim" description="Record one device and assess the available evidence." /><SectionCard contentClassName="p-5"><WarrantyIntakeForm scope={scope} onSave={async input => { const id = await createWarrantyClaim(scope, input, key); if (alive.current) router.push(`/warranty/${id}`); }} /></SectionCard></>;
}
function ClaimQueue({ scope, canManage }: { scope: WarrantyScope; canManage: boolean }) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(0);
  const [state, setState] = useState<{ key: string; rows: WarrantySummary[]; error: string } | null>(null);
  const key = `${search}:${status}:${page}`;
  const { organizationId, branchId } = scope;
  useEffect(() => { let current = true;
    queryWarrantyClaims({ organizationId, branchId }, search, status, page).then(data => { if (current) setState({ key, rows: data.claims, error: "" }); }).catch(e => { if (current) setState({ key, rows: [], error: e.message }); });
    return () => { current = false; };
  }, [organizationId, branchId, search, status, page, key]); // Scope values, not object identity.
  const current = state?.key === key ? state : null;
  return <><PageHeader title="Warranty" description="Entitlement, assessment and remedies for this branch." actions={canManage && <Link className={warrantyButton} href="/warranty/new">New claim</Link>} />
    <div className="flex flex-wrap gap-3"><input className={warrantyField + " max-w-sm"} placeholder="Claim number or customer" aria-label="Search claims" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><select aria-label="Claim status" className={warrantyField + " max-w-xs"} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">All statuses</option>{warrantyStatuses.map(s => <option key={s} value={s}>{warrantyLabel(s)}</option>)}</select></div>
    {current?.error && <p role="alert" className="text-red-700">{current.error}</p>}<SectionCard contentClassName="divide-y">{!current ? <p className="p-5">Loading claims…</p> : !current.rows.length ? <p className="p-5">No claims found in this branch.</p> : current.rows.map(c => <Link className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-slate-50" key={c.id} href={`/warranty/${c.id}?archiveBranch=${scope.branchId}`}><span><strong>{c.claim_number}</strong> · {c.customer_name_snapshot}<span className="block text-sm text-slate-500">{c.device_description}</span></span><StatusBadge status={c.status} /></Link>)}</SectionCard>
    <div className="flex gap-3"><button className={warrantyButton} disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><button className={warrantyButton} disabled={!current || current.rows.length < 50} onClick={() => setPage(p => p + 1)}>Next</button></div></>;
}
function ClaimDetail({ scope, id, canManage }: { scope: WarrantyScope; id: string; canManage: boolean }) {
  const { hasPermission } = useAuth();
  const { organizationId, branchId } = scope;
  const [detail, setDetail] = useState<WarrantyDetail | null>(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<WarrantyStatus | null>(null), [edit, setEdit] = useState(false), [print, setPrint] = useState<"intake" | "decision" | null>(null);
  const [reason, setReason] = useState(""), [summary, setSummary] = useState(""), [resolution, setResolution] = useState("OTHER"), [returnItem, setReturnItem] = useState("");
  const [repairs, setRepairs] = useState<RepairJob[]>([]), [repairId, setRepairId] = useState(""), [deviceType, setDeviceType] = useState("");
  const [repairSearch, setRepairSearch] = useState("");
  const [busy, setBusy] = useState(false); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { let current = true;
    getWarrantyClaim({ organizationId, branchId }, id).then(d => { if (current) { setDetail(d); setError(""); } }).catch(e => { if (current) { setDetail(null); setError(e.message); } });
    return () => { current = false; };
  }, [organizationId, branchId, id, refresh]);
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(""); try { await fn(); if (alive.current) { setAction(null); setEdit(false); setRefresh(r => r + 1); } } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Operation failed."); } finally { if (alive.current) setBusy(false); } }
  if (!detail) return <><Link href="/warranty">Back to Warranty</Link><p role="status">{error || "Loading claim…"}</p></>;
  const c = detail.claim, terminal = warrantyTransitions[c.status].length === 0;
  const manage = canManage && c.can_manage && c.branch_active && !terminal;
  const repairAccess = hasPermission("repairs.view") && hasPermission("repairs.manage");
  return <div className="space-y-5"><PageHeader title={c.claim_number} description={`${c.customer_name_snapshot} · ${c.branch_name}`} actions={<><Link href="/warranty" className={warrantyButton}>All claims</Link><button className={warrantyButton} onClick={() => setPrint("intake")}>Print intake</button><button className={warrantyButton} onClick={() => setPrint("decision")}>Print decision</button></>} />
    {error && <p role="alert" className="text-red-700">{error}</p>}<StatusBadge status={c.status} />
    <SectionCard title="Device and evidence" contentClassName="space-y-2 p-5 text-sm"><p className="font-medium">{c.device_description}</p><p>{c.reported_fault}</p><p>IMEI: {c.imei_snapshot || "Unavailable / not recorded"} · Serial: {c.serial_number_snapshot || "Unavailable / not recorded"}</p>
      <p>{warrantyLabel(c.evidence_class)} · {warrantyLabel(c.terms_source)}</p>{c.source_evidence_access ? <><p>{c.receipt_number_snapshot || "No verified internal receipt"}</p><p>{warrantyTerms(c.warranty_months_snapshot, c.terms_source)}</p><p>Purchase: {c.purchase_date_snapshot || "Unknown"} · Inclusive expiry: {c.warranty_expiry_date || "Unknown"}</p></> : <p>Source-sale evidence unavailable with your permissions. This does not mean there is no evidence.</p>}
      <p>Eligibility: {warrantyLabel(c.eligibility_decision)}</p>{c.eligibility_reason && <p>Private assessment: {c.eligibility_reason}</p>}{c.evidence_notes && <p>Private evidence notes: {c.evidence_notes}</p>}{c.customer_summary && <p>Customer summary: {c.customer_summary}</p>}
      {manage && c.source_evidence_access && !c.repair_job_id && <button className={warrantyButton} disabled={busy} onClick={() => setEdit(true)}>Edit evidence / reassess</button>}
    </SectionCard>
    {manage && <div className="flex flex-wrap gap-2">{warrantyTransitions[c.status].map(s => <button key={s} className={warrantyButton} disabled={busy} onClick={() => { setReason(""); setSummary(c.customer_summary || ""); setAction(s); }}>{warrantyLabel(s)}</button>)}</div>}
    <SectionCard title="Repair" contentClassName="space-y-3 p-5 text-sm">{c.repair_job_id ? <Link className="underline" href={`/repairs/${c.repair_job_id}`}>Open linked repair</Link> : <p>No repair linked.</p>}
      {manage && repairAccess && !c.repair_job_id && ["APPROVED", "IN_PROGRESS"].includes(c.status) && <>
        <div className="flex flex-wrap gap-2"><input className={warrantyField + " max-w-xs"} placeholder="Device type, e.g. phone" aria-label="Repair device type" value={deviceType} onChange={e => setDeviceType(e.target.value)} /><button className={warrantyButton} disabled={busy || !deviceType.trim()} onClick={() => run(() => createWarrantyRepair(scope, c, deviceType))}>Create and link repair</button></div>
        <input aria-label="Find existing repair" placeholder="Repair number or device" className={warrantyField} value={repairSearch} onChange={e => setRepairSearch(e.target.value)} /><button className={warrantyButton} disabled={busy} onClick={() => run(async () => { const result = await queryRepairs(scope, { search: repairSearch, status: "", priority: "", assignee: "", page: 0 }); if (alive.current) setRepairs(result.jobs.filter(r => r.customer_id === c.customer_id)); })}>Find existing repairs for customer</button>
        {repairs.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="Existing repair" className={warrantyField + " max-w-sm"} value={repairId} onChange={e => setRepairId(e.target.value)}><option value="">Select matching repair</option>{repairs.map(r => <option key={r.id} value={r.id}>{r.job_number} · {r.model} · {r.status}</option>)}</select><button className={warrantyButton} disabled={busy || !repairId} onClick={() => run(() => linkWarrantyRepair(scope, c, repairId))}>Link repair</button></div>}
        <p>Charges and payments stay in Repairs. Linking does not change prices.</p>
      </>}
    </SectionCard>
    <SectionCard title="History" contentClassName="divide-y">{detail.events.map(e => <div className="p-4 text-sm" key={e.id}>{warrantyLabel(e.event_type)} · {e.previous_status && `${warrantyLabel(e.previous_status)} → `}{warrantyLabel(e.new_status)}<span className="block text-slate-500">{new Date(e.created_at).toLocaleString("en-GB")}</span></div>)}</SectionCard>
    {action && <AppDialog open title={warrantyLabel(action)} onClose={() => setAction(null)} closeDisabled={busy} footer={<AppDialogFooter><AppDialogActionButton disabled={busy} onClick={() => run(() => transitionWarrantyClaim(scope, c, action, { eligibility_decision: action === "APPROVED" ? "ELIGIBLE" : action === "REJECTED" ? "INELIGIBLE" : undefined, eligibility_reason: reason, customer_summary: summary, resolution, resolution_notes: reason, return_item_id: returnItem || null }))}>Confirm</AppDialogActionButton></AppDialogFooter>}>
      <div className="space-y-4">{action === "RESOLVED" && <><label>Resolution<select className={warrantyField} value={resolution} onChange={e => setResolution(e.target.value)}>{["REPAIRED", "REFUNDED", "OTHER"].map(r => <option key={r}>{r}</option>)}</select></label>{resolution === "REFUNDED" && <label>Completed refund<select className={warrantyField} value={returnItem} onChange={e => setReturnItem(e.target.value)}><option value="">Select existing refund evidence</option>{detail.refund_options.map(r => <option key={r.id} value={r.id}>{r.return_number}</option>)}</select><p className="text-sm">{detail.refund_evidence_access ? "Process refunds separately through the original sale. This action moves no money." : "Refund evidence is unavailable: source sale viewing and refund permissions are required. This does not establish whether a refund exists."}</p></label>}</>}
        <label className="block">Private assessment / resolution reason<textarea maxLength={5000} className={warrantyField} value={reason} onChange={e => setReason(e.target.value)} /></label><label className="block">Customer-facing summary<textarea maxLength={5000} className={warrantyField} value={summary} onChange={e => setSummary(e.target.value)} /></label>{error && <p role="alert" className="text-red-700">{error}</p>}
      </div></AppDialog>}
    {edit && <AppDialog open title="Edit claim evidence" onClose={() => setEdit(false)} maxWidth="3xl"><WarrantyIntakeForm scope={scope} claim={c} onSave={async v => { await updateWarrantyClaim(scope, c, v); if (alive.current) { setEdit(false); setRefresh(r => r + 1); } }} /></AppDialog>}
    {print && <WarrantyPrintDialog claim={c} kind={print} onClose={() => setPrint(null)} />}
  </div>;
}
