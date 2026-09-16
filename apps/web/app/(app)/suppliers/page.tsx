"use client";

import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Clock3,
  FileText,
  Plus,
  Search,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  Currency,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/ui/alpha-components";
import {
  createSupplier,
  getSupplierBalances,
  getSuppliers,
  type Supplier,
  type SupplierBalance,
} from "@/lib/services/suppliers";

type SupplierListItem = Supplier | SupplierBalance;

function hasFinancialData(
  supplier: SupplierListItem
): supplier is SupplierBalance {
  return "outstanding" in supplier;
}

export default function SuppliersPage() {
  const { organization, hasPermission, switchingContext, accessLoading } =
    useAuth();

  const canViewFinance = hasPermission("finance.view");
  const canManageSuppliers = hasPermission("suppliers.manage");

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    supplier_code: "",
    contact_name: "",
    email: "",
    phone: "",
    website: "",
    city: "",
    postcode: "",
    notes: "",
  });

  async function loadSuppliers() {
    if (!organization?.id) {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuppliers([]);

      const data = canViewFinance
        ? await getSupplierBalances(organization.id)
        : await getSuppliers(organization.id);

      setSuppliers(data ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load suppliers."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (switchingContext || accessLoading) {
      setSuppliers([]);
      return;
    }

    void loadSuppliers();
  }, [organization?.id, canViewFinance, switchingContext, accessLoading]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (!organization?.id || !canManageSuppliers) return;

    try {
      setSaving(true);
      setError(null);

      await createSupplier({
        organization_id: organization.id,
        name: form.name.trim(),
        supplier_code: form.supplier_code.trim(),
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        city: form.city.trim() || null,
        postcode: form.postcode.trim() || null,
        notes: form.notes.trim() || null,
      });

      setForm({
        name: "",
        supplier_code: "",
        contact_name: "",
        email: "",
        phone: "",
        website: "",
        city: "",
        postcode: "",
        notes: "",
      });

      await loadSuppliers();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create supplier."
      );
    } finally {
      setSaving(false);
    }
  }

  const financialSummary = useMemo(() => {
    if (!canViewFinance) {
      return {
        outstanding: 0,
        overdue: 0,
        openInvoices: 0,
      };
    }

    return suppliers.reduce(
      (totals, supplier) => {
        if (!hasFinancialData(supplier)) {
          return totals;
        }

        totals.outstanding += supplier.outstanding;
        totals.overdue += supplier.overdue;
        totals.openInvoices += supplier.open_invoices;

        return totals;
      },
      {
        outstanding: 0,
        overdue: 0,
        openInvoices: 0,
      }
    );
  }, [suppliers, canViewFinance]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return suppliers;

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.supplier_code,
        supplier.contact_name,
        supplier.email,
        supplier.phone,
        supplier.city,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query)
      )
    );
  }, [search, suppliers]);

  function formatDate(value?: string | null) {
    if (!value) return "No payments";

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  const pageLoading = loading || switchingContext || accessLoading;

  if (!organization && !pageLoading) {
    return (
      <EmptyState
        icon={Building2}
        title="No organisation selected"
        description="Select an organisation to view its suppliers."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage supplier relationships and purchasing contacts."
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div
        className={`grid gap-4 ${
          canViewFinance ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"
        }`}
      >
        <StatCard
          label="Total Suppliers"
          value={suppliers.length}
          icon={Building2}
          description="Supplier records in this organisation"
        />

        {canViewFinance && (
          <>
            <StatCard
              label="Outstanding"
              value={<Currency amount={financialSummary.outstanding} />}
              icon={WalletCards}
              description="Total supplier balance due"
            />

            <StatCard
              label="Overdue"
              value={<Currency amount={financialSummary.overdue} />}
              icon={Clock3}
              description="Supplier invoices past due"
            />

            <StatCard
              label="Open Invoices"
              value={financialSummary.openInvoices}
              icon={FileText}
              description="Unpaid or partially paid"
            />
          </>
        )}
      </div>

      <div
        className={`grid gap-6 ${
          canManageSuppliers ? "xl:grid-cols-[1fr_360px]" : "grid-cols-1"
        }`}
      >
        <SectionCard
          title={canViewFinance ? "Supplier Balances" : "Supplier Directory"}
          description={
            canViewFinance
              ? "Supplier relationships and consolidated financial position."
              : "Supplier contacts and purchasing information."
          }
          actions={
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="search"
                placeholder="Search suppliers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>
          }
        >
          {pageLoading ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-slate-500">
              Loading suppliers...
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={
                suppliers.length === 0
                  ? "No suppliers yet"
                  : "No suppliers found"
              }
              description={
                suppliers.length === 0
                  ? "Add your first supplier to begin managing purchasing."
                  : "Try changing your search term."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table
                className={`w-full text-left ${
                  canViewFinance ? "min-w-[1050px]" : "min-w-[700px]"
                }`}
              >
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Supplier</th>

                    <th className="px-5 py-3 font-medium">Contact</th>

                    <th className="px-5 py-3 font-medium">Location</th>

                    {canViewFinance && (
                      <>
                        <th className="px-5 py-3 text-right font-medium">
                          Invoiced
                        </th>

                        <th className="px-5 py-3 text-right font-medium">
                          Paid
                        </th>

                        <th className="px-5 py-3 text-right font-medium">
                          Outstanding
                        </th>

                        <th className="px-5 py-3 text-right font-medium">
                          Overdue
                        </th>

                        <th className="px-5 py-3 text-center font-medium">
                          Open
                        </th>

                        <th className="px-5 py-3 font-medium">Last Payment</th>
                      </>
                    )}

                    <th className="px-5 py-3" />
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filteredSuppliers.map((supplier) => {
                    const financial = hasFinancialData(supplier)
                      ? supplier
                      : null;

                    return (
                      <tr
                        key={supplier.id}
                        className="text-sm transition hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/suppliers/${supplier.id}`}
                            className="font-semibold text-slate-900 hover:underline"
                          >
                            {supplier.name}
                          </Link>

                          <div className="mt-1 text-xs text-slate-500">
                            {supplier.supplier_code}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-slate-700">
                            {supplier.contact_name || "—"}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {supplier.email ||
                              supplier.phone ||
                              "No contact details"}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {[supplier.city, supplier.postcode]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>

                        {canViewFinance && financial && (
                          <>
                            <td className="px-5 py-4 text-right font-medium text-slate-700">
                              <Currency amount={financial.total_invoiced} />
                            </td>

                            <td className="px-5 py-4 text-right font-medium text-emerald-700">
                              <Currency amount={financial.total_paid} />
                            </td>

                            <td className="px-5 py-4 text-right font-semibold text-slate-950">
                              <Currency amount={financial.outstanding} />
                            </td>

                            <td className="px-5 py-4 text-right">
                              <span
                                className={
                                  financial.overdue > 0
                                    ? "font-semibold text-red-700"
                                    : "text-slate-500"
                                }
                              >
                                <Currency amount={financial.overdue} />
                              </span>
                            </td>

                            <td className="px-5 py-4 text-center">
                              <span className="inline-flex min-w-8 justify-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {financial.open_invoices}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-slate-600">
                              {formatDate(financial.last_payment_date)}
                            </td>
                          </>
                        )}

                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/suppliers/${supplier.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                          >
                            View
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {canManageSuppliers && (
          <form
            onSubmit={handleCreate}
            className="h-fit rounded-xl border bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-slate-600" />

              <div>
                <h2 className="font-semibold text-slate-900">Add Supplier</h2>

                <p className="mt-1 text-xs text-slate-500">
                  Create a new purchasing supplier.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Supplier Name
                </label>

                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="e.g. Apple Distribution UK"
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Supplier Code
                </label>

                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="e.g. APPLE-UK"
                  value={form.supplier_code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      supplier_code: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Contact Name
                </label>

                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="Optional"
                  value={form.contact_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contact_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Phone
                </label>

                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="Optional"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      phone: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Email
                </label>

                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="Optional"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      email: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Notes
                </label>

                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="Optional notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes: e.target.value,
                    })
                  }
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="mr-2 h-4 w-4" />

                {saving ? "Saving..." : "Add Supplier"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
