"use client";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  Mail,
  Phone,
  Printer,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  getSupplierStatement,
  type SupplierStatement,
} from "@/lib/services/suppliers";

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPaymentMethod(value: string) {
  return value.replaceAll("_", " ");
}

function isInvoiceOverdue(
  dueDate: string | null,
  amountDue: number,
  status: string
) {
  if (!dueDate || amountDue <= 0) return false;

  if (status === "PAID" || status === "CANCELLED") {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueDate}T00:00:00`);

  return due < today;
}

export default function SupplierStatementPage() {
  const params = useParams<{ supplierId: string }>();

  const supplierId = params.supplierId;

  const [statement, setStatement] = useState<SupplierStatement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatement = useCallback(async () => {
    if (!supplierId) return;

    try {
      setLoading(true);
      setError(null);

      const data = await getSupplierStatement(supplierId);

      setStatement(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load supplier statement."
      );
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement]);

  const lastPayment = useMemo(() => {
    if (!statement?.payments.length) return null;

    return statement.payments[0];
  }, [statement]);

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">
        Loading supplier statement...
      </div>
    );
  }

  if (error && !statement) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>

        <Link
          href="/suppliers"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Suppliers
        </Link>
      </div>
    );
  }

  if (!statement) {
    return null;
  }

  const { supplier } = statement;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Suppliers
        </Link>
      </div>

      <PageHeader
        title={supplier.name}
        description={`Supplier statement · ${supplier.supplier_code}`}
        actions={
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 print:hidden"
          >
            <Printer className="h-4 w-4" />
            Print Statement
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Invoiced"
          value={<Currency amount={statement.total_invoiced} />}
          icon={ReceiptText}
          description={`${statement.invoices.length} supplier invoice${
            statement.invoices.length === 1 ? "" : "s"
          }`}
        />

        <StatCard
          label="Total Paid"
          value={<Currency amount={statement.total_paid} />}
          icon={CreditCard}
          description={
            lastPayment
              ? `Last payment ${formatDate(lastPayment.payment_date)}`
              : "No supplier payments yet"
          }
        />

        <StatCard
          label="Outstanding"
          value={<Currency amount={statement.outstanding} />}
          icon={WalletCards}
          description={`${statement.open_invoices} open invoice${
            statement.open_invoices === 1 ? "" : "s"
          }`}
        />

        <StatCard
          label="Overdue"
          value={<Currency amount={statement.overdue} />}
          icon={CalendarDays}
          description={`${statement.overdue_invoices} overdue invoice${
            statement.overdue_invoices === 1 ? "" : "s"
          }`}
        />
      </div>

      <SectionCard
        title="Supplier Information"
        description="Contact and account information for this supplier."
      >
        <div className="grid gap-6 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Supplier
              </p>

              <p className="mt-1 font-medium text-slate-900">{supplier.name}</p>

              <p className="mt-1 text-xs text-slate-500">
                {supplier.supplier_code}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Contact
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {supplier.contact_name || "No contact name"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {supplier.phone || "No phone number"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </p>

              <p className="mt-1 break-all font-medium text-slate-900">
                {supplier.email || "No email address"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Location
            </p>

            <p className="mt-1 font-medium text-slate-900">
              {[supplier.city, supplier.postcode].filter(Boolean).join(", ") ||
                "No location recorded"}
            </p>
          </div>
        </div>

        {supplier.notes && (
          <div className="border-t px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {supplier.notes}
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Invoice Statement"
        description="Supplier invoices and their current settlement position."
      >
        {statement.invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No supplier invoices"
            description="This supplier does not have any supplier invoices recorded yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Purchase Order</th>
                  <th className="px-5 py-3 font-medium">Branch</th>
                  <th className="px-5 py-3 font-medium">Invoice Date</th>
                  <th className="px-5 py-3 font-medium">Due Date</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Paid</th>
                  <th className="px-5 py-3 text-right font-medium">
                    Outstanding
                  </th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>

              <tbody className="divide-y">
                {statement.invoices.map((invoice) => {
                  const overdue = isInvoiceOverdue(
                    invoice.due_date,
                    invoice.amount_due,
                    invoice.status
                  );

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

                        {overdue && (
                          <p className="mt-1 text-xs font-medium text-red-600">
                            Overdue
                          </p>
                        )}
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
                        {invoice.branch_name}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(invoice.invoice_date)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            overdue
                              ? "font-medium text-red-700"
                              : "text-slate-600"
                          }
                        >
                          {formatDate(invoice.due_date)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-slate-900">
                        <Currency amount={invoice.total_amount} />
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-emerald-700">
                        <Currency amount={invoice.amount_paid} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <span
                          className={
                            invoice.amount_due > 0
                              ? "font-semibold text-slate-950"
                              : "font-medium text-emerald-700"
                          }
                        >
                          <Currency amount={invoice.amount_due} />
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={invoice.status} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/accounts-payable/${invoice.id}`}
                          className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 print:hidden"
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

      <SectionCard
        title="Payment History"
        description="Payments recorded against this supplier's invoices."
      >
        {statement.payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments recorded"
            description="Payments made to this supplier will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Payment Date</th>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Method</th>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Recorded</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {statement.payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="text-sm transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {formatDate(payment.payment_date)}
                    </td>

                    <td className="px-5 py-4">
                      <Link
                        href={`/accounts-payable/${payment.supplier_invoice_id}`}
                        className="font-medium text-slate-700 hover:text-slate-950 hover:underline"
                      >
                        {payment.invoice_number}
                      </Link>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {formatPaymentMethod(payment.payment_method)}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {payment.reference || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {formatDateTime(payment.created_at)}
                    </td>

                    <td className="px-5 py-4 text-right font-semibold text-slate-950">
                      <Currency amount={payment.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
