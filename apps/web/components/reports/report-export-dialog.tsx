"use client";

import { useLayoutEffect, useState } from "react";
import { Download } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AppDialog, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/components/ui/app-dialog";
import { buildReport, exportAccess, type ExportRequest } from "@/lib/exports/report-adapters";
import { createExportSession } from "@/lib/exports/export-session";
import { MAX_EXPORT_ROWS, REPORT_TITLES, todayInLondon, type ReportKind } from "@/lib/exports/report-model";

export function ReportExportDialog({ kind, historyBranch, search = "" }: {
  kind: ReportKind;
  historyBranch?: { id: string; name: string } | null;
  search?: string;
}) {
  const auth = useAuth();
  const branch = kind === "sales" ? historyBranch : auth.branch;
  const allowed = kind === "sales"
    ? Boolean(branch && auth.historicalReadPermissions[branch.id]?.includes("sales.view"))
    : auth.hasPermission("inventory.view");
  const busyContext = auth.loading || auth.switchingContext || auth.accessLoading;
  const workspaceKey = JSON.stringify([auth.user?.id, auth.organization?.id, auth.branch?.id, branch?.id,
    auth.permissions, auth.historicalReadPermissions, auth.isSuperAdmin, busyContext, allowed, search]);
  if (!allowed || !branch || !auth.organization) return null;

  return <WorkspaceExportDialog key={workspaceKey} kind={kind} branch={branch}
    organization={auth.organization} search={search} busyContext={busyContext} />;
}

function WorkspaceExportDialog({ kind, branch, organization, search, busyContext }: {
  kind: ReportKind;
  branch: { id: string; name: string };
  organization: { id: string; name: string };
  search: string;
  busyContext: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(todayInLondon);
  const [endDate, setEndDate] = useState(todayInLondon);
  const [session] = useState(createExportSession);

  useLayoutEffect(() => () => session.invalidate(), [session]);

  function close() {
    session.invalidate();
    setOpen(false);
    setBusy(false);
  }

  async function download(format: "xlsx" | "pdf") {
    if (busyContext || busy) return;
    const assertCurrent = session.start();
    const input: ExportRequest = { kind, organizationId: organization.id, organizationName: organization.name,
      branchId: branch.id, branchName: branch.name, startDate, endDate, search };
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const report = await buildReport(input, assertCurrent);
      const financeIncluded = report.columns.some(column => column.title === "Average cost" || column.title === "Unit cost");
      const blob = format === "xlsx"
        ? await (await import("@/lib/exports/excel")).renderExcel(report)
        : (await import("@/lib/exports/pdf")).renderPdf(report);
      assertCurrent();
      if (await exportAccess(input) !== financeIncluded) throw new Error("Access changed during export. Please retry.");
      assertCurrent();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AlphaPOS-${kind}-${branch.id.slice(0, 8)}-${todayInLondon()}.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Download ready — ${report.rows.length.toLocaleString("en-GB")} records.`);
    } catch (cause) {
      try { assertCurrent(); } catch { return; }
      setError(cause instanceof Error && /^(Choose valid|End date must|The dataset changed|The export could not|Export exceeds|You do not have permission|Unable to verify export|Financial access changed|Access changed|This report contains characters)/.test(cause.message)
        ? cause.message : "Unable to create this export. Please retry or refresh your workspace access.");
    } finally {
      try { assertCurrent(); setBusy(false); } catch { /* A newer workspace owns the UI. */ }
    }
  }

  return <>
    <button type="button" disabled={busyContext} onClick={() => { setOpen(true); setMessage(""); setError(""); }}
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">
      <Download className="h-4 w-4" /> Export report
    </button>
    <AppDialog open={open} title={REPORT_TITLES[kind]} maxWidth="lg" onClose={close}
      description={`${organization.name} · ${branch.name}`}
      footer={<AppDialogFooter>
        <AppDialogCancelButton onClick={close}>{busy ? "Cancel export" : "Close"}</AppDialogCancelButton>
        <AppDialogActionButton disabled={busy || busyContext} onClick={() => void download("xlsx")}>Download Excel</AppDialogActionButton>
        <AppDialogActionButton disabled={busy || busyContext} onClick={() => void download("pdf")}>Download PDF</AppDialogActionButton>
      </AppDialogFooter>}>
      <div className="space-y-4">
        {kind !== "inventory" ? <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Start date<input type="date" value={startDate} disabled={busy} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm font-medium">End date<input type="date" value={endDate} disabled={busy} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
        </div> : <p className="text-sm">Current inventory position with an “As at” timestamp.</p>}
        <p className="text-sm text-slate-600">UK dates and GBP. Up to {MAX_EXPORT_ROWS.toLocaleString("en-GB")} records per export.</p>
        {search.trim() && <p className="text-sm">Search filter: {search.trim()}</p>}
        {busy && <p role="status">Preparing your report…</p>}
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </AppDialog>
  </>;
}
