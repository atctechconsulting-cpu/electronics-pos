"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  FileText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Currency,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/ui/alpha-components";

import {
  getSupplierInvoices,
  type SupplierInvoiceRow,
  type SupplierInvoiceStatus,
} from "@/lib/services/supplier-invoices";

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getTodayDateString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateStringDaysFromToday(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isOutstanding(invoice: SupplierInvoiceRow) {
  return (
    invoice.status !== "PAID" &&
    invoice.status !== "CANCELLED" &&
    invoice.amount_due > 0
  );
}

function isOverdue(invoice: SupplierInvoiceRow) {
  if (!isOutstanding(invoice) || !invoice.due_date) {
    return false;
  }

  return invoice.due_date < getTodayDateString();
}

function isDueSoon(invoice: SupplierInvoiceRow) {
  if (!isOutstanding(invoice) || !invoice.due_date) {
    return false;
  }

  const today = getTodayDateString();
  const sevenDaysFromToday = getDateStringDaysFromToday(7);

  return invoice.due_date >= today && invoice.due_date <= sevenDaysFromToday;
}

function dueDateLabel(invoice: SupplierInvoiceRow) {
  if (!invoice.due_date) {
    return {
      text: "No due date",
      className: "text-slate-500",
    };
  }

  if (invoice.status === "PAID") {
    return {
      text: formatDate(invoice.due_date),
      className: "text-slate-600",
    };
  }

  if (invoice.status === "CANCELLED") {
    return {
      text: formatDate(invoice.due_date),
      className: "text-slate-400",
    };
  }

  if (isOverdue(invoice)) {
    return {
      text: `${formatDate(invoice.due_date)} · Overdue`,
      className: "font-medium text-red-700",
    };
  }

  if (isDueSoon(invoice)) {
    return {
      text: `${formatDate(invoice.due_date)} · Due soon`,
      className: "font-medium text-amber-700",
    };
  }

  return {
    text: formatDate(invoice.due_date),
    className: "text-slate-600",
  };
}

const statusOptions: Array<{
  value: "ALL" | SupplierInvoiceStatus;
  label: string;
}> = [
  {
    value: "ALL",
    label: "All statuses",
  },
  {
    value: "UNPAID",
    label: "Unpaid",
  },
  {
    value: "PARTIALLY_PAID",
    label: "Partially paid",
  },
  {
    value: "PAID",
    label: "Paid",
  },
  {
    value: "CANCELLED",
    label: "Cancelled",
  },
];

export default function AccountsPayablePage() {
  const [invoices, setInvoices] = useState<SupplierInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<
    "ALL" | SupplierInvoiceStatus
  >("ALL");

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getSupplierInvoices();

      setInvoices(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load supplier invoices."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const summary = useMemo(() => {
    return invoices.reduce(
      (totals, invoice) => {
        if (isOutstanding(invoice)) {
          totals.outstanding += invoice.amount_due;
        }

        if (isOverdue(invoice)) {
          totals.overdue += invoice.amount_due;
        }

        if (isDueSoon(invoice)) {
          totals.dueSoon += invoice.amount_due;
        }

        if (invoice.status === "PAID") {
          totals.paid += invoice.total_amount;
        }

        return totals;
      },
      {
        outstanding: 0,
        overdue: 0,
        dueSoon: 0,
        paid: 0,
      }
    );
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesStatus =
        statusFilter === "ALL" || invoice.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        invoice.invoice_number,
        invoice.supplier_name,
        invoice.branch_name,
        invoice.po_number ?? "",
        invoice.status,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [invoices, search, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Payable"
        description="Track supplier invoices, outstanding balances, due dates and payments."
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>

            <button
              type="button"
              onClick={loadInvoices}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding Payables"
          value={<Currency amount={summary.outstanding} />}
          icon={Banknote}
          description="Total currently owed to suppliers."
        />

        <StatCard
          label="Overdue"
          value={<Currency amount={summary.overdue} />}
          icon={AlertTriangle}
          description="Outstanding invoices past their due date."
        />

        <StatCard
          label="Due Soon"
          value={<Currency amount={summary.dueSoon} />}
          icon={Clock3}
          description="Outstanding invoices due within 7 days."
        />

        <StatCard
          label="Paid"
          value={<Currency amount={summary.paid} />}
          icon={CheckCircle2}
          description="Value of supplier invoices fully paid."
        />
      </div>

      <SectionCard
        title="Supplier Invoices"
        description="Review supplier liabilities and open individual invoices to record payments."
        contentClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search supplier, invoice or PO..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "ALL" | SupplierInvoiceStatus
              )
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center px-6 py-14 text-sm text-slate-500">
            Loading supplier invoices...
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No supplier invoices yet"
            description="Supplier invoices will appear here once they are created from your purchasing workflow."
          />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching invoices"
            description="Try changing your search term or invoice status filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Purchase Order</th>
                  <th className="px-5 py-3 font-medium">Invoice Date</th>
                  <th className="px-5 py-3 font-medium">Due Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Paid</th>
                  <th className="px-5 py-3 font-medium">Outstanding</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredInvoices.map((invoice) => {
                  const dueDate = dueDateLabel(invoice);

                  return (
                    <tr
                      key={invoice.id}
                      className="text-sm transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/accounts-payable/${invoice.id}`}
                          className="font-semibold text-slate-900 hover:underline"
                        >
                          {invoice.invoice_number}
                        </Link>

                        <p className="mt-1 text-xs text-slate-500">
                          {invoice.branch_name}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-medium text-slate-800">
                        {invoice.supplier_name}
                      </td>

                      <td className="px-5 py-4">
                        {invoice.purchase_order_id && invoice.po_number ? (
                          <Link
                            href={`/purchases/${invoice.purchase_order_id}`}
                            className="font-medium text-slate-700 hover:text-slate-950 hover:underline"
                          >
                            {invoice.po_number}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(invoice.invoice_date)}
                      </td>

                      <td className={`px-5 py-4 ${dueDate.className}`}>
                        {dueDate.text}
                      </td>

                      <td className="px-5 py-4 font-medium text-slate-900">
                        <Currency amount={invoice.total_amount} />
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        <Currency amount={invoice.amount_paid} />
                      </td>

                      <td className="px-5 py-4">
                        <Currency
                          amount={invoice.amount_due}
                          className={
                            invoice.amount_due > 0
                              ? "font-semibold text-slate-950"
                              : "font-medium text-emerald-700"
                          }
                        />
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={invoice.status} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/accounts-payable/${invoice.id}`}
                          className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                        >
                          View
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
    </div>
  );
}
