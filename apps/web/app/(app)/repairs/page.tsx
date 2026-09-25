"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader, SectionCard, StatusBadge, Currency, EmptyState } from "@/components/ui/alpha-components";
import { queryRepairs, getRepairAssignees, type RepairJob, type Assignee } from "@/lib/services/repairs";
import { repairStatuses, repairPriorities, repairLabel } from "@/lib/validations/repair";
import { RepairField, RepairError, inputClass, buttonClass, secondaryClass, displayDate } from "@/components/repairs/repair-fields";

export default function RepairsPage() {
  const { organization, branch, branches, switchBranch, hasPermission } = useAuth();
  const [filters, setFilters] = useState({ search: "", status: "", priority: "", assignee: "", page: 0 });
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const orgId = organization?.id;
  const branchId = branch?.id;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!orgId || !branchId) return;
      setLoading(true); setError(""); setJobs([]);
      try {
        const result = await queryRepairs({ organizationId: orgId, branchId }, filters);
        if (!cancelled) { setJobs(result.jobs); setTotal(result.total); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load repairs."); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, branchId, filters, refresh]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId || !branchId) return;
      try { const result = await getRepairAssignees({ organizationId: orgId, branchId }); if (!cancelled) setAssignees(result); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load staff filter."); }
    }
    void load(); return () => { cancelled = true; };
  }, [orgId, branchId]);
  function filter(key: "search" | "status" | "priority" | "assignee", value: string) {
    setFilters(current => ({ ...current, [key]: value, page: 0 }));
  }
  if (!organization || !branch) return <p>Select an organisation and branch.</p>;
  return <div className="space-y-6">
    <PageHeader title="Repairs" description={`Device intake, work and collection · ${branch.name}`} actions={<>
      <button type="button" className={secondaryClass} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
      {hasPermission("repairs.manage") && <Link className={buttonClass} href="/repairs/new">New repair</Link>}
    </>} />
    <RepairError message={error} />
    <SectionCard contentClassName="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
      <RepairField label="Search"><input className={inputClass} placeholder="Job, customer, IMEI or model" maxLength={200} value={filters.search} onChange={e => filter("search", e.target.value)} /></RepairField>
      <RepairField label="Status"><select className={inputClass} value={filters.status} onChange={e => filter("status", e.target.value)}><option value="">All statuses</option>{repairStatuses.map(s => <option key={s} value={s}>{repairLabel(s)}</option>)}</select></RepairField>
      <RepairField label="Priority"><select className={inputClass} value={filters.priority} onChange={e => filter("priority", e.target.value)}><option value="">All priorities</option>{repairPriorities.map(s => <option key={s} value={s}>{repairLabel(s)}</option>)}</select></RepairField>
      <RepairField label="Assigned staff"><select className={inputClass} value={filters.assignee} onChange={e => filter("assignee", e.target.value)}><option value="">All staff</option>{assignees.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || "Staff member"}</option>)}</select></RepairField>
      <RepairField label="Branch workspace"><select className={inputClass} value={branch.id} onChange={e => { setJobs([]); void switchBranch(e.target.value).catch(() => setError("Unable to switch branch.")); }}>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></RepairField>
    </SectionCard>
    <SectionCard title={`${total} repair${total === 1 ? "" : "s"}`}>
      {loading ? <p className="p-8 text-slate-500">Loading repairs…</p> : jobs.length === 0 ? <EmptyState icon={Wrench} title="No repairs found" description="Create a repair or adjust the filters." /> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Job / received", "Customer / device", "Identifiers", "Status / priority", "Assigned", "Charge / balance", "Expected"].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
        <tbody>{jobs.map(job => <tr key={job.id} className="border-b last:border-0 hover:bg-slate-50">
          <td className="px-4 py-4"><Link className="font-semibold underline" href={`/repairs/${job.id}`}>{job.job_number}</Link><p className="mt-1 text-xs text-slate-500">{displayDate(job.received_at)}</p></td>
          <td className="px-4 py-4"><p className="font-medium">{job.customer_name}</p><p className="text-slate-500">{job.brand_name} {job.model}</p></td>
          <td className="px-4 py-4 text-xs">{job.imei || "—"}<br />{job.serial_number || "—"}</td>
          <td className="space-y-2 px-4 py-4"><StatusBadge status={job.status} /><p className="text-xs">{repairLabel(job.priority)}</p></td>
          <td className="px-4 py-4">{job.assigned_name || "Unassigned"}</td>
          <td className="px-4 py-4"><p>{job.final_amount !== null ? <>Final <Currency amount={job.final_amount} /></> : job.estimated_amount !== null ? <>Estimate <Currency amount={job.estimated_amount} /></> : "Not estimated"}</p><p className="text-xs text-slate-500">{job.outstanding_balance !== null ? <>Due <Currency amount={job.outstanding_balance} /></> : "Final charge pending"}</p><StatusBadge status={job.payment_status} /></td>
          <td className="px-4 py-4 text-xs">{displayDate(job.estimated_completion_at)}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="flex items-center justify-between border-t p-4"><span className="text-sm text-slate-500">Page {filters.page + 1}</span><div className="flex gap-2"><button className={secondaryClass} disabled={loading || filters.page === 0} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Previous</button><button className={secondaryClass} disabled={loading || (filters.page + 1) * 50 >= total} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next</button></div></div>
    </SectionCard>
  </div>;
}
