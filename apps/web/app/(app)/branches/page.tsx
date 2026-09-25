"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui/alpha-components";
import { BranchDialog } from "@/components/branches/branch-dialog";
import { BranchStatusDialog } from "@/components/branches/branch-status-dialog";
import { getOrganizationBranches, type BranchDirectory, type BranchRecord } from "@/lib/services/branches";

export default function BranchesPage() {
  const { organization, refreshAuthContext } = useAuth();
  const [directory, setDirectory] = useState<BranchDirectory | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<BranchRecord | "new" | null>(null);
  const [status, setStatus] = useState<BranchRecord | null>(null);
  const orgId = organization?.id;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDirectory(null); setError(""); setEdit(null); setStatus(null);
      if (!orgId) return;
      try { const data = await getOrganizationBranches(orgId); if (!cancelled) setDirectory(data); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load branches."); }
    }
    void load(); return () => { cancelled = true; };
  }, [orgId, refresh]);
  async function saved() { await refreshAuthContext(); }
  if (!organization) return <p>Select an organisation.</p>;
  const rows = directory?.branches.filter(item => filter === "all" || item.is_active === (filter === "active")) ?? [];
  return <div className="space-y-6">
    <PageHeader title="Branches" description={`Manage locations for ${organization.name}. Branch codes and head-office designation are permanent in V1.`}
      actions={<><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setRefresh(value => value + 1)}>Refresh</button>{directory?.can_manage && <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => setEdit("new")}>Create branch</button>}</>} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <SectionCard title="Organisation branches" contentClassName="p-5">
      <label className="mb-5 block text-sm font-medium">Status <select className="ml-2 rounded-lg border px-3 py-2" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All branches</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      {!directory && !error ? <p className="text-sm text-slate-500">Loading branches…</p> : rows.length === 0 ? <p className="text-sm text-slate-500">No branches match this view.</p> : <div className="grid gap-4 lg:grid-cols-2">{rows.map(item => <article key={item.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.name}</h2><span className="rounded bg-slate-100 px-2 py-1 text-xs">{item.code}</span><StatusBadge status={item.is_active ? "active" : "inactive"} />{item.is_head_office && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">Head office</span>}</div>
        <p className="mt-3 break-words text-sm text-slate-600">{[item.email, item.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
        <p className="mt-2 text-sm text-slate-600">{[item.address_line_1,item.address_line_2,item.city,item.county,item.postcode,item.country].filter(Boolean).join(", ")}</p>
        {directory?.can_manage && <div className="mt-4 flex flex-wrap gap-3"><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setEdit(item)}>Edit</button><button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={item.is_head_office && item.is_active} onClick={() => setStatus(item)}>{item.is_active ? "Deactivate" : "Activate"}</button></div>}
      </article>)}</div>}
    </SectionCard>
    {edit && <BranchDialog organizationId={organization.id} branch={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSaved={saved} />}
    {status && <BranchStatusDialog organizationId={organization.id} branch={status} onClose={() => setStatus(null)} onSaved={saved} />}
  </div>;
}
