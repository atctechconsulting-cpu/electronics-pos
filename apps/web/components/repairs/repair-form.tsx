"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { PageHeader, SectionCard } from "@/components/ui/alpha-components";
import { searchCustomers, type Customer } from "@/lib/services/customers";
import { createRepair, getRepairAssignees, getRepairSerials, searchRepairProducts, type Assignee, type CatalogueProduct, type CatalogueSerial } from "@/lib/services/repairs";
import { repairPriorities, repairLabel, type RepairCreateInput } from "@/lib/validations/repair";
import { RepairField, RepairError, inputClass, buttonClass, secondaryClass } from "./repair-fields";

export function RepairForm() {
  const { organization, branch, hasPermission } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ customer_id: "", product_id: "", product_serial_id: "", device_type: "", brand_name: "", model: "", imei: "", serial_number: "", accessories_received: "", fault_description: "", physical_condition: "", intake_notes: "", priority: "normal", assigned_to: "", estimated_amount: "", estimated_completion_at: "" });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [serials, setSerials] = useState<CatalogueSerial[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [serialSearch, setSerialSearch] = useState("");
  const [serialSearchField, setSerialSearchField] = useState<"imei" | "serial_number">("serial_number");
  const [refreshCustomers, setRefreshCustomers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const orgId = organization?.id;
  const branchId = branch?.id;
  const canCustomers = hasPermission("customers.view");
  const canProducts = hasPermission("products.view");
  const canSerials = hasPermission("inventory.view");
  function field(name: keyof typeof form, value: string) { setForm(current => ({ ...current, [name]: value })); }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!orgId || !canCustomers) return;
      try { const result = await searchCustomers(orgId, customerSearch); if (!cancelled) setCustomers(current => [...result, ...current.filter(c => c.id === form.customer_id && !result.some(found => found.id === c.id))]); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load customers."); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, customerSearch, refreshCustomers, canCustomers, form.customer_id]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId || !branchId) return;
      try { const result = await getRepairAssignees({ organizationId: orgId, branchId }); if (!cancelled) setAssignees(result); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load assignees."); }
    }
    void load(); return () => { cancelled = true; };
  }, [orgId, branchId]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!orgId || !canProducts) return;
      try { const result = await searchRepairProducts(orgId, productSearch); if (!cancelled) setProducts(current => [...result, ...current.filter(p => p.id === form.product_id && !result.some(found => found.id === p.id))]); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load catalogue."); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, productSearch, canProducts, form.product_id]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId || !branchId || !form.product_id || !canSerials) return;
      try { const result = await getRepairSerials({ organizationId: orgId, branchId }, form.product_id, serialSearch, serialSearchField); if (!cancelled) setSerials(current => [...result, ...current.filter(s => s.id === form.product_serial_id && !result.some(found => found.id === s.id))]); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load serials."); }
    }
    const timer = setTimeout(() => void load(), 250); return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, branchId, form.product_id, form.product_serial_id, canSerials, serialSearch, serialSearchField]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!organization || !branch) return;
    setBusy(true); setError("");
    try {
      const selected = products.find(product => product.id === form.product_id);
      const input: RepairCreateInput = {
        ...form, priority: form.priority as RepairCreateInput["priority"],
        product_id: form.product_id || null, product_serial_id: form.product_serial_id || null,
        category_id: selected?.category_id ?? null, brand_id: selected?.brand_id ?? null,
        assigned_to: form.assigned_to || null, imei: form.imei.trim() || null, serial_number: form.serial_number.trim() || null,
        estimated_amount: form.estimated_amount === "" ? null : Number(form.estimated_amount),
        estimated_completion_at: form.estimated_completion_at ? new Date(form.estimated_completion_at).toISOString() : null,
      };
      const id = await createRepair({ organizationId: organization.id, branchId: branch.id }, input);
      router.push(`/repairs/${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create repair."); setBusy(false); }
  }
  if (!organization || !branch) return <p>Select an organisation and branch.</p>;
  if (!hasPermission("repairs.manage")) return <RepairError message="You do not have permission to create repairs in this branch." />;
  if (!canCustomers) return <RepairError message="Customer viewing permission is required to associate a repair with a customer." />;
  return <div className="space-y-6">
    <PageHeader title="New repair" description={`Receive one device at ${branch.name}. Customer-owned devices do not change stock.`}
      actions={hasPermission("customers.manage") ? <CustomerDialog onCustomerCreated={() => setRefreshCustomers(value => value + 1)} /> : undefined} />
    <RepairError message={error} />
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={busy} className="space-y-6">
        <SectionCard title="Customer" contentClassName="grid gap-4 p-5 sm:grid-cols-2">
          <RepairField label="Find customer"><input className={inputClass} value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Name, phone or email" /></RepairField>
          <RepairField label="Customer *"><select required className={inputClass} value={form.customer_id} onChange={e => field("customer_id", e.target.value)}><option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.phone || c.email || c.customer_code}</option>)}</select></RepairField>
        </SectionCard>
        <SectionCard title="Device" description="Link an existing catalogue device, or enter an external device manually." contentClassName="grid gap-4 p-5 sm:grid-cols-2">
          {canProducts && <>
            <RepairField label="Find catalogue product"><input className={inputClass} value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search product name" /></RepairField>
            <RepairField label="Catalogue link (optional)"><select className={inputClass} value={form.product_id} onChange={e => { const product = products.find(p => p.id === e.target.value); setSerials([]); setForm(current => ({ ...current, product_id: e.target.value, product_serial_id: "", model: product?.name ?? current.model, imei: "", serial_number: "" })); }}><option value="">External / manually entered device</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></RepairField>
          </>}
          {form.product_id && canSerials && <>
            <RepairField label="Find identifier in this branch"><div className="flex gap-2"><select aria-label="Identifier type" className={inputClass} value={serialSearchField} onChange={e => setSerialSearchField(e.target.value as typeof serialSearchField)}><option value="serial_number">Serial</option><option value="imei">IMEI</option></select><input aria-label="Identifier search" className={inputClass} value={serialSearch} maxLength={120} onChange={e => setSerialSearch(e.target.value)} placeholder="Search identifiers" /></div></RepairField>
            <RepairField label="Existing serial / IMEI (optional)"><select className={inputClass} value={form.product_serial_id} onChange={e => { const serial = serials.find(s => s.id === e.target.value); setForm(current => ({ ...current, product_serial_id: e.target.value, imei: serial?.imei ?? "", serial_number: serial?.serial_number ?? "" })); }}><option value="">No serial link</option>{serials.map(s => <option key={s.id} value={s.id}>{s.imei || s.serial_number || s.id}</option>)}</select></RepairField>
          </>}
          {([['device_type', 'Device type *'], ['brand_name', 'Brand'], ['model', 'Model *'], ['imei', 'IMEI (15 digits)'], ['serial_number', 'Serial number']] as const).map(([name, label]) => <RepairField key={name} label={label}><input className={inputClass} value={form[name]} required={name === "device_type" || name === "model"} maxLength={200} disabled={Boolean(form.product_serial_id) && (name === "imei" || name === "serial_number")} onChange={e => field(name, e.target.value)} /></RepairField>)}
        </SectionCard>
        <SectionCard title="Intake" contentClassName="grid gap-4 p-5 sm:grid-cols-2">
          {([['fault_description', 'Reported fault *'], ['physical_condition', 'Physical condition'], ['accessories_received', 'Accessories received'], ['intake_notes', 'Internal intake notes']] as const).map(([name, label]) => <RepairField key={name} label={label}><textarea className={inputClass} rows={3} maxLength={5000} required={name === "fault_description"} value={form[name]} onChange={e => field(name, e.target.value)} /></RepairField>)}
        </SectionCard>
        <SectionCard title="Planning & estimate" contentClassName="grid gap-4 p-5 sm:grid-cols-2">
          <RepairField label="Priority"><select className={inputClass} value={form.priority} onChange={e => field("priority", e.target.value)}>{repairPriorities.map(p => <option key={p} value={p}>{repairLabel(p)}</option>)}</select></RepairField>
          <RepairField label="Assigned staff"><select className={inputClass} value={form.assigned_to} onChange={e => field("assigned_to", e.target.value)}><option value="">Unassigned</option>{assignees.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || "Staff member"}</option>)}</select></RepairField>
          <RepairField label="Customer estimate (£)"><input type="number" min="0" step="0.01" className={inputClass} value={form.estimated_amount} onChange={e => field("estimated_amount", e.target.value)} /></RepairField>
          <RepairField label="Expected completion"><input type="datetime-local" className={inputClass} value={form.estimated_completion_at} onChange={e => field("estimated_completion_at", e.target.value)} /></RepairField>
        </SectionCard>
        <div className="flex justify-end gap-3"><button type="button" className={secondaryClass} onClick={() => router.push("/repairs")}>Cancel</button><button className={buttonClass} type="submit">{busy ? "Creating…" : "Create repair"}</button></div>
      </fieldset>
    </form>
  </div>;
}
