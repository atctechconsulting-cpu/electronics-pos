"use client";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  PackageCheck,
  Printer,
  ShoppingCart,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CreateSupplierInvoiceDialog } from "@/components/accounts-payable/create-supplier-invoice-dialog";
import { ReceivePurchaseOrderDialog } from "@/components/purchases/receive-purchase-order-dialog";

import {
  getPurchaseOrderDetails,
  orderPurchaseOrder,
  type PurchaseOrderDetails,
} from "@/lib/services/purchase-orders";

import {
  getSupplierInvoiceForPurchaseOrder,
  type SupplierInvoiceRow,
} from "@/lib/services/supplier-invoices";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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

function statusClasses(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700";

    case "ORDERED":
      return "bg-blue-50 text-blue-700";

    case "PARTIALLY_RECEIVED":
      return "bg-amber-50 text-amber-700";

    case "RECEIVED":
      return "bg-emerald-50 text-emerald-700";

    case "CANCELLED":
      return "bg-red-50 text-red-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
}

function invoiceStatusClasses(status: string) {
  switch (status) {
    case "UNPAID":
      return "bg-red-50 text-red-700";

    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-700";

    case "PAID":
      return "bg-emerald-50 text-emerald-700";

    case "CANCELLED":
      return "bg-slate-100 text-slate-600";

    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function PurchaseOrderDetailsPage() {
  const params = useParams<{ purchaseOrderId: string }>();

  const purchaseOrderId = params.purchaseOrderId;

  const [purchaseOrder, setPurchaseOrder] =
    useState<PurchaseOrderDetails | null>(null);

  const [supplierInvoice, setSupplierInvoice] =
    useState<SupplierInvoiceRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const loadPurchaseOrder = useCallback(async () => {
    if (!purchaseOrderId) return;

    try {
      setError(null);

      const data = await getPurchaseOrderDetails(purchaseOrderId);

      setPurchaseOrder(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load purchase order."
      );
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId]);

  const loadSupplierInvoice = useCallback(async () => {
    if (!purchaseOrderId) return;

    try {
      setInvoiceLoading(true);
      setInvoiceError(null);

      const data = await getSupplierInvoiceForPurchaseOrder(purchaseOrderId);

      setSupplierInvoice(data);
    } catch (loadError) {
      setInvoiceError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the supplier invoice for this purchase order."
      );
    } finally {
      setInvoiceLoading(false);
    }
  }, [purchaseOrderId]);

  const refreshPage = useCallback(async () => {
    await Promise.all([loadPurchaseOrder(), loadSupplierInvoice()]);
  }, [loadPurchaseOrder, loadSupplierInvoice]);

  useEffect(() => {
    void refreshPage();
  }, [refreshPage]);

  async function handlePlaceOrder() {
    if (!purchaseOrder) return;

    const confirmed = window.confirm(
      `Place purchase order ${purchaseOrder.po_number}? Once ordered, its products can be received into inventory.`
    );

    if (!confirmed) return;

    try {
      setOrdering(true);
      setError(null);

      await orderPurchaseOrder(purchaseOrder.id);

      await refreshPage();
    } catch (orderError) {
      setError(
        orderError instanceof Error
          ? orderError.message
          : "Unable to place purchase order."
      );
    } finally {
      setOrdering(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">
        Loading purchase order...
      </div>
    );
  }

  if (error && !purchaseOrder) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>

        <Link
          href="/purchases"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Purchase Orders
        </Link>
      </div>
    );
  }

  if (!purchaseOrder) {
    return null;
  }

  const orderedQuantity = purchaseOrder.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const receivedQuantity = purchaseOrder.items.reduce(
    (sum, item) => sum + item.received_quantity,
    0
  );

  const receivingPercentage =
    orderedQuantity > 0
      ? Math.round((receivedQuantity / orderedQuantity) * 100)
      : 0;

  const canReceive =
    purchaseOrder.status === "ORDERED" ||
    purchaseOrder.status === "PARTIALLY_RECEIVED";

  const canCreateSupplierInvoice =
    purchaseOrder.status === "ORDERED" ||
    purchaseOrder.status === "PARTIALLY_RECEIVED" ||
    purchaseOrder.status === "RECEIVED";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/purchases"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Purchase Orders
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {purchaseOrder.po_number}
            </h1>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(
                purchaseOrder.status
              )}`}
            >
              {purchaseOrder.status.replace("_", " ")}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Purchase order for {purchaseOrder.supplier_name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>

          {purchaseOrder.status === "DRAFT" && (
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={ordering}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />

              {ordering ? "Placing Order..." : "Place Order"}
            </button>
          )}

          {canReceive && (
            <ReceivePurchaseOrderDialog
              purchaseOrder={purchaseOrder}
              onSuccess={refreshPage}
            />
          )}

          {canCreateSupplierInvoice && !invoiceLoading && (
            <CreateSupplierInvoiceDialog
              purchaseOrder={purchaseOrder}
              existingInvoice={supplierInvoice}
              onSuccess={loadSupplierInvoice}
            />
          )}

          {purchaseOrder.status === "RECEIVED" && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
              <PackageCheck className="h-4 w-4" />
              Fully Received
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {invoiceError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {invoiceError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-slate-500" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Supplier
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {purchaseOrder.supplier_name}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-slate-500" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Delivery Branch
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {purchaseOrder.branch_name}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-slate-500" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Expected Delivery
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {formatDate(purchaseOrder.expected_delivery_date)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-slate-500" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created By
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {purchaseOrder.created_by_name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {supplierInvoice && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2.5">
                <FileText className="h-5 w-5 text-slate-700" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-950">
                    Supplier Invoice {supplierInvoice.invoice_number}
                  </h2>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${invoiceStatusClasses(
                      supplierInvoice.status
                    )}`}
                  >
                    {supplierInvoice.status.replaceAll("_", " ")}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  This purchase order has been recorded in Accounts Payable.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Invoice Total
                </p>

                <p className="mt-1 font-semibold text-slate-900">
                  {formatCurrency(supplierInvoice.total_amount)}
                </p>
              </div>

              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Outstanding
                </p>

                <p
                  className={`mt-1 font-semibold ${
                    supplierInvoice.amount_due > 0
                      ? "text-slate-950"
                      : "text-emerald-700"
                  }`}
                >
                  {formatCurrency(supplierInvoice.amount_due)}
                </p>
              </div>

              <Link
                href={`/accounts-payable/${supplierInvoice.id}`}
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                View Invoice
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Ordered Products</h2>

              <p className="mt-1 text-sm text-slate-500">
                Products included in this purchase order.
              </p>
            </div>

            <div className="text-sm text-slate-600">
              {receivedQuantity} of {orderedQuantity} units received
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{
                width: `${receivingPercentage}%`,
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Ordered</th>
                <th className="px-5 py-3 font-medium">Received</th>
                <th className="px-5 py-3 font-medium">Remaining</th>
                <th className="px-5 py-3 font-medium">Cost</th>
                <th className="px-5 py-3 font-medium">Line Total</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {purchaseOrder.items.map((item) => {
                const remaining = item.quantity - item.received_quantity;

                return (
                  <tr key={item.id} className="text-sm">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {item.product_name}
                      </p>

                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>SKU: {item.sku}</span>

                        {item.requires_imei && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            IMEI
                          </span>
                        )}

                        {!item.requires_imei && item.is_serialized && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            Serial
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {item.quantity}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {item.received_quantity}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          remaining === 0
                            ? "font-medium text-emerald-700"
                            : "font-medium text-amber-700"
                        }
                      >
                        {remaining}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {formatCurrency(item.cost_price)}
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-900">
                      {formatCurrency(item.line_total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold text-slate-950">Order Information</h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </p>

              <p className="mt-1 text-sm text-slate-800">
                {formatDateTime(purchaseOrder.created_at)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Ordered
              </p>

              <p className="mt-1 text-sm text-slate-800">
                {formatDateTime(purchaseOrder.ordered_at)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Fully Received
              </p>

              <p className="mt-1 text-sm text-slate-800">
                {formatDateTime(purchaseOrder.received_at)}
              </p>
            </div>
          </div>

          <div className="mt-6 border-t pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {purchaseOrder.notes ||
                "No notes were added to this purchase order."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold text-slate-950">Order Summary</h2>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Subtotal</span>

              <span className="font-medium text-slate-900">
                {formatCurrency(purchaseOrder.subtotal)}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Discount</span>

              <span className="font-medium text-slate-900">
                -{formatCurrency(purchaseOrder.discount_amount)}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Tax</span>

              <span className="font-medium text-slate-900">
                {formatCurrency(purchaseOrder.tax_amount)}
              </span>
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-950">Total</span>

                <span className="text-lg font-semibold text-slate-950">
                  {formatCurrency(purchaseOrder.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
