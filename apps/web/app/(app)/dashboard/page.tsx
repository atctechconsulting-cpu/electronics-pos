"use client";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Building2,
  Package,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  Currency,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/ui/alpha-components";
import { BusinessReport, getBusinessReport } from "@/lib/services/reports";
import { supabase } from "@/lib/supabase/client";

type InventoryAlert = {
  id: string;
  quantity_on_hand: number;
  quantity_available: number;
  average_cost: number;
  product: {
    id: string;
    name: string;
    sku: string | null;
  } | null;
};

function today() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(Number(value || 0));
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function getJoinedRecord<T>(value: unknown): T | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }

  return value as T;
}

export default function DashboardPage() {
  const router = useRouter();
  const { organization, branch, loading: authLoading } = useAuth();

  const [report, setReport] = useState<BusinessReport | null>(null);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reportDate = useMemo(() => today(), []);

  useEffect(() => {
    if (!authLoading && !organization) {
      router.push("/onboarding");
    }
  }, [authLoading, organization, router]);

  async function loadDashboard() {
    if (!organization?.id) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const reportPromise = getBusinessReport({
        startDate: reportDate,
        endDate: reportDate,
        branchId: branch?.id ?? null,
      });

      let inventoryQuery = supabase
        .from("inventory")
        .select(
          `
            id,
            quantity_on_hand,
            quantity_available,
            average_cost,
            products (
              id,
              name,
              sku
            )
          `
        )
        .eq("organization_id", organization.id)
        .lte("quantity_available", 5)
        .order("quantity_available", { ascending: true })
        .limit(6);

      if (branch?.id) {
        inventoryQuery = inventoryQuery.eq("branch_id", branch.id);
      }

      const [reportResult, inventoryResult] = await Promise.all([
        reportPromise,
        inventoryQuery,
      ]);

      setReport(reportResult);

      if (inventoryResult.error) {
        console.error(inventoryResult.error);
        setInventoryAlerts([]);
      } else {
        const mappedAlerts: InventoryAlert[] = (inventoryResult.data ?? []).map(
          (row) => {
            const product = getJoinedRecord<{
              id: string;
              name: string;
              sku: string | null;
            }>(row.products);

            return {
              id: row.id,
              quantity_on_hand: Number(row.quantity_on_hand ?? 0),
              quantity_available: Number(row.quantity_available ?? 0),
              average_cost: Number(row.average_cost ?? 0),
              product,
            };
          }
        );

        setInventoryAlerts(mappedAlerts);
      }
    } catch (dashboardError) {
      console.error(dashboardError);

      setError(
        dashboardError instanceof Error
          ? dashboardError.message
          : "Unable to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [organization?.id, branch?.id]);

  const maxTrendValue = useMemo(() => {
    if (!report?.sales_trend.length) {
      return 0;
    }

    return Math.max(
      ...report.sales_trend.map((point) =>
        Math.max(Number(point.net_sales), Number(point.gross_profit), 0)
      )
    );
  }, [report]);

  const lowStockCount = inventoryAlerts.length;

  const hasActivity =
    Number(report?.summary.transaction_count ?? 0) > 0 ||
    Number(report?.summary.refunds ?? 0) > 0;

  if (authLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          branch?.name
            ? `Live business overview for ${branch.name}.`
            : "Live overview of sales, profitability, inventory and business activity."
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <Link
              href="/pos"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Open POS
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <p className="font-semibold">Dashboard unavailable</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      {loading && !report ? (
        <SectionCard contentClassName="p-12">
          <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading live business data...
          </div>
        </SectionCard>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today's Net Sales"
              value={<Currency amount={report.summary.net_sales} />}
              icon={Banknote}
              description={`${formatNumber(
                report.summary.transaction_count
              )} transactions today`}
            />

            <StatCard
              label="Today's Gross Profit"
              value={<Currency amount={report.summary.gross_profit} />}
              icon={TrendingUp}
              description={`${formatPercent(
                report.summary.gross_margin
              )} gross margin`}
            />

            <StatCard
              label="Inventory Value"
              value={
                <Currency amount={report.business_position.inventory_value} />
              }
              icon={Boxes}
              description={`${formatNumber(
                report.business_position.inventory_quantity
              )} units currently on hand`}
            />

            <StatCard
              label="Supplier Payables"
              value={
                <Currency
                  amount={report.business_position.supplier_outstanding}
                />
              }
              icon={WalletCards}
              description={
                report.business_position.supplier_overdue > 0
                  ? `${new Intl.NumberFormat("en-GB", {
                      style: "currency",
                      currency: "GBP",
                    }).format(
                      report.business_position.supplier_overdue
                    )} overdue`
                  : "No overdue supplier balance"
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Gross Sales"
              value={<Currency amount={report.summary.gross_sales} />}
              icon={ShoppingCart}
              description="Sales before today's returns"
            />

            <StatCard
              label="Refunds"
              value={<Currency amount={report.summary.refunds} />}
              icon={RotateCcw}
              description="Customer refunds today"
            />

            <StatCard
              label="Net COGS"
              value={<Currency amount={report.summary.net_cogs} />}
              icon={Package}
              description="Cost of goods after returns"
            />

            <StatCard
              label="Low Stock"
              value={formatNumber(lowStockCount)}
              icon={AlertTriangle}
              description="Products with 5 or fewer available"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              title="Today's Performance"
              description="Sales and profitability for the current trading day."
              actions={
                <Link
                  href="/reports"
                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Full reports
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
              className="xl:col-span-2"
            >
              {!hasActivity ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No trading activity today"
                  description="Sales, returns and profitability will appear here as transactions are completed."
                  action={
                    <Link
                      href="/pos"
                      className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Open POS
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Net Sales
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">
                        <Currency amount={report.summary.net_sales} />
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Gross Profit
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">
                        <Currency amount={report.summary.gross_profit} />
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Transactions
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">
                        {formatNumber(report.summary.transaction_count)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Average Order
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">
                        <Currency amount={report.summary.average_order_value} />
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">
                            Profitability
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Today's net trading result
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            report.summary.gross_margin > 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {formatPercent(report.summary.gross_margin)}
                        </span>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Gross sales</span>
                          <span className="font-medium text-slate-900">
                            <Currency amount={report.summary.gross_sales} />
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Refunds</span>
                          <span className="font-medium text-red-600">
                            -<Currency amount={report.summary.refunds} />
                          </span>
                        </div>

                        <div className="flex items-center justify-between border-t pt-3 text-sm">
                          <span className="font-medium text-slate-700">
                            Net sales
                          </span>
                          <span className="font-semibold text-slate-900">
                            <Currency amount={report.summary.net_sales} />
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Net COGS</span>
                          <span className="font-medium text-slate-900">
                            <Currency amount={report.summary.net_cogs} />
                          </span>
                        </div>

                        <div className="flex items-center justify-between border-t pt-3">
                          <span className="font-semibold text-slate-900">
                            Gross profit
                          </span>
                          <span className="font-semibold text-slate-900">
                            <Currency amount={report.summary.gross_profit} />
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div>
                        <p className="font-medium text-slate-900">
                          Trading Activity
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Current day operational activity
                        </p>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Transactions</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatNumber(report.summary.transaction_count)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Units sold</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatNumber(report.summary.units_sold)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            Average order
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            <Currency
                              amount={report.summary.average_order_value}
                            />
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">VAT</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            <Currency amount={report.summary.vat_amount} />
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Inventory Alerts"
              description="Products that may require stock attention."
              actions={
                <Link
                  href="/inventory"
                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Inventory
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
            >
              {inventoryAlerts.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Stock levels healthy"
                  description="No products currently have 5 or fewer available units."
                />
              ) : (
                <div className="divide-y">
                  {inventoryAlerts.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {item.product?.name ?? "Unknown product"}
                        </p>

                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {item.product?.sku ?? "No SKU"}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-semibold ${
                            item.quantity_available <= 0
                              ? "text-red-600"
                              : item.quantity_available <= 2
                                ? "text-amber-700"
                                : "text-slate-700"
                          }`}
                        >
                          {formatNumber(item.quantity_available)} available
                        </p>

                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatNumber(item.quantity_on_hand)} on hand
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {inventoryAlerts.length > 0 ? (
                <Link
                  href="/inventory"
                  className="mt-5 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Review inventory
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              title="Top Products"
              description="Today's strongest products by net revenue."
              actions={
                <Link
                  href="/reports"
                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Reports
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
              className="xl:col-span-2"
            >
              {report.top_products.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No product sales today"
                  description="Product performance will appear after sales are completed."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 text-right font-medium">Units</th>
                        <th className="pb-3 text-right font-medium">Sales</th>
                        <th className="pb-3 text-right font-medium">Profit</th>
                        <th className="pb-3 text-right font-medium">Margin</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {report.top_products.slice(0, 5).map((product) => (
                        <tr key={product.product_id}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-900">
                              {product.product_name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {product.sku || "No SKU"}
                            </p>
                          </td>

                          <td className="py-3 text-right text-slate-600">
                            {formatNumber(product.units_sold)}
                          </td>

                          <td className="py-3 text-right font-medium text-slate-900">
                            <Currency amount={product.revenue} />
                          </td>

                          <td className="py-3 text-right font-medium text-slate-900">
                            <Currency amount={product.gross_profit} />
                          </td>

                          <td className="py-3 text-right font-medium text-slate-700">
                            {formatPercent(product.gross_margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Business Position"
              description="Current operational and liability position."
            >
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Inventory
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">
                        <Currency
                          amount={report.business_position.inventory_value}
                        />
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(
                          report.business_position.inventory_quantity
                        )}{" "}
                        units on hand
                      </p>
                    </div>

                    <Boxes className="h-5 w-5 text-slate-400" />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Supplier Payables
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">
                        <Currency
                          amount={report.business_position.supplier_outstanding}
                        />
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          report.business_position.supplier_overdue > 0
                            ? "font-medium text-red-600"
                            : "text-slate-500"
                        }`}
                      >
                        <Currency
                          amount={report.business_position.supplier_overdue}
                        />{" "}
                        overdue
                      </p>
                    </div>

                    <WalletCards className="h-5 w-5 text-slate-400" />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Current Branch
                      </p>
                      <p className="mt-2 font-semibold text-slate-900">
                        {branch?.name ?? "All branches"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Dashboard reporting scope
                      </p>
                    </div>

                    <Building2 className="h-5 w-5 text-slate-400" />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href="/sales"
              className="group rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <ReceiptText className="h-5 w-5 text-slate-600" />

              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Sales History
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review transactions and receipts.
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
              </div>
            </Link>

            <Link
              href="/inventory"
              className="group rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <Package className="h-5 w-5 text-slate-600" />

              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Inventory</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review stock levels and valuation.
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
              </div>
            </Link>

            <Link
              href="/reports"
              className="group rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <TrendingUp className="h-5 w-5 text-slate-600" />

              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Business Reports
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Analyse sales, profit and branches.
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
