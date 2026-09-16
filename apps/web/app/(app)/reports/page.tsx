"use client";

import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Package,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  Currency,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/ui/alpha-components";
import { BusinessReport, getBusinessReport } from "@/lib/services/reports";

type DatePreset = "TODAY" | "7_DAYS" | "30_DAYS" | "THIS_MONTH" | "CUSTOM";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPresetDates(preset: DatePreset) {
  const today = new Date();
  const endDate = toDateInput(today);

  if (preset === "TODAY") {
    return {
      startDate: endDate,
      endDate,
    };
  }

  if (preset === "7_DAYS") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);

    return {
      startDate: toDateInput(start),
      endDate,
    };
  }

  if (preset === "30_DAYS") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);

    return {
      startDate: toDateInput(start),
      endDate,
    };
  }

  if (preset === "THIS_MONTH") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
      startDate: toDateInput(start),
      endDate,
    };
  }

  return {
    startDate: endDate,
    endDate,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(Number(value || 0));
}

function formatPercent(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getMarginTone(margin: number | null | undefined) {
  const value = Number(margin ?? 0);

  if (value >= 30) {
    return "text-emerald-700";
  }

  if (value >= 15) {
    return "text-amber-700";
  }

  return "text-red-700";
}

function MetricRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2 ${
        strong ? "font-semibold text-slate-900" : "text-sm text-slate-600"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ReportsPage() {
  const {
    organization,
    branch,
    branches,
    permissions,
    loading: authLoading,
    switchingContext,
    accessLoading,
    hasPermission,
  } = useAuth();

  const initialDates = useMemo(() => getPresetDates("30_DAYS"), []);

  const [preset, setPreset] = useState<DatePreset>("30_DAYS");
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);

  const [branchId, setBranchId] = useState("");
  const [report, setReport] = useState<BusinessReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canViewReports = hasPermission("reports.view");

  /*
   * The effective permissions in AuthProvider are loaded for the current
   * active branch. That is enough to authorise branch reporting.
   *
   * Organisation-wide reporting, however, requires an organisation-scoped
   * reports.view assignment. We do not infer that from branch membership.
   *
   * The hardened database RPC remains the final authority. The UI initially
   * requests the active branch. If an organisation-wide request succeeds,
   * that scope is then available through the selector.
   */
  const [canViewAllBranches, setCanViewAllBranches] = useState(false);

  const activeBranchId = branch?.id ?? null;

  useEffect(() => {
    // Whenever the workspace changes, return reporting to the active branch
    // and discard data from the previous context.
    setReport(null);
    setError("");
    setCanViewAllBranches(false);
    setBranchId(activeBranchId ?? "");
  }, [organization?.id, activeBranchId]);

  const loadReport = useCallback(async () => {
    if (
      authLoading ||
      switchingContext ||
      accessLoading ||
      !organization?.id ||
      !canViewReports
    ) {
      return;
    }

    if (!startDate || !endDate) {
      setError("Select a valid reporting period.");
      return;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    const requestedBranchId = branchId || activeBranchId;

    if (!requestedBranchId) {
      setError("No authorised branch is available for reporting.");
      setReport(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const data = await getBusinessReport({
        organizationId: organization.id,
        startDate,
        endDate,
        branchId: requestedBranchId,
      });

      setReport(data);
    } catch (reportError) {
      console.error(reportError);

      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to load the business report."
      );
    } finally {
      setLoading(false);
    }
  }, [
    authLoading,
    switchingContext,
    accessLoading,
    organization?.id,
    canViewReports,
    startDate,
    endDate,
    branchId,
    activeBranchId,
  ]);

  /*
   * Probe organisation-wide reporting through the hardened RPC itself.
   * A branch-scoped reports.view user will receive Permission denied and
   * never gets the All branches option.
   *
   * An organisation-scoped reports.view user succeeds and may subsequently
   * select organisation-wide reporting.
   */
  useEffect(() => {
    let cancelled = false;

    async function checkAllBranchAccess() {
      if (
        authLoading ||
        switchingContext ||
        accessLoading ||
        !organization?.id ||
        !canViewReports
      ) {
        if (!cancelled) {
          setCanViewAllBranches(false);
        }
        return;
      }

      try {
        await getBusinessReport({
          organizationId: organization.id,
          startDate,
          endDate,
          branchId: null,
        });

        if (!cancelled) {
          setCanViewAllBranches(true);
        }
      } catch {
        if (!cancelled) {
          setCanViewAllBranches(false);
        }
      }
    }

    void checkAllBranchAccess();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    switchingContext,
    accessLoading,
    organization?.id,
    canViewReports,
    startDate,
    endDate,
    permissions,
  ]);

  useEffect(() => {
    if (
      authLoading ||
      switchingContext ||
      accessLoading ||
      !organization?.id ||
      !canViewReports
    ) {
      return;
    }

    void loadReport();
  }, [
    authLoading,
    switchingContext,
    accessLoading,
    organization?.id,
    canViewReports,
    loadReport,
  ]);

  function applyPreset(nextPreset: DatePreset) {
    setPreset(nextPreset);

    if (nextPreset === "CUSTOM") {
      return;
    }

    const dates = getPresetDates(nextPreset);

    setStartDate(dates.startDate);
    setEndDate(dates.endDate);
  }

  async function loadAllBranchesReport() {
    if (!organization?.id || !canViewReports || !canViewAllBranches) {
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const data = await getBusinessReport({
        organizationId: organization.id,
        startDate,
        endDate,
        branchId: null,
      });

      setReport(data);
    } catch (reportError) {
      console.error(reportError);

      setCanViewAllBranches(false);
      setBranchId(activeBranchId ?? "");

      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to load the business report."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleBranchChange(nextBranchId: string) {
    setBranchId(nextBranchId);

    if (!organization?.id || !canViewReports) {
      return;
    }

    if (!nextBranchId) {
      if (!canViewAllBranches) {
        setBranchId(activeBranchId ?? "");
        return;
      }

      await loadAllBranchesReport();
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const data = await getBusinessReport({
        organizationId: organization.id,
        startDate,
        endDate,
        branchId: nextBranchId,
      });

      setReport(data);
    } catch (reportError) {
      console.error(reportError);

      setBranchId(activeBranchId ?? "");

      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to load the business report."
      );
    } finally {
      setLoading(false);
    }
  }

  const canViewFinance = Boolean(report?.access.can_view_finance);

  const selectedBranchName =
    branchId === ""
      ? "All branches"
      : (branches.find((candidate) => candidate.id === branchId)?.name ??
        branch?.name ??
        "Current branch");

  const maxTrendValue = useMemo(() => {
    if (!report?.sales_trend.length) {
      return 0;
    }

    return Math.max(
      ...report.sales_trend.map((point) => {
        const netSales = Number(point.net_sales ?? 0);

        if (!canViewFinance) {
          return Math.max(netSales, 0);
        }

        return Math.max(netSales, Number(point.gross_profit ?? 0), 0);
      })
    );
  }, [report, canViewFinance]);

  const hasSalesActivity =
    Number(report?.summary.transaction_count ?? 0) > 0 ||
    Number(report?.summary.refunds ?? 0) > 0;

  const contextLoading = authLoading || switchingContext || accessLoading;

  if (contextLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading reporting access...
        </div>
      </div>
    );
  }

  if (!canViewReports) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reports & Business Intelligence"
          description="Business reporting and performance analysis."
        />

        <SectionCard>
          <EmptyState
            icon={TrendingUp}
            title="Reporting access required"
            description="Your current role does not have permission to view business reports."
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Business Intelligence"
        description={
          canViewFinance
            ? "Monitor sales, profitability, inventory value, supplier liabilities, products, and branch performance."
            : "Monitor authorised sales, product, inventory quantity, and branch performance."
        }
        actions={
          <button
            type="button"
            onClick={() => {
              if (branchId === "" && canViewAllBranches) {
                void loadAllBranchesReport();
              } else {
                void loadReport();
              }
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <SectionCard contentClassName="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "TODAY", label: "Today" },
              { value: "7_DAYS", label: "Last 7 days" },
              { value: "30_DAYS", label: "Last 30 days" },
              { value: "THIS_MONTH", label: "This month" },
              { value: "CUSTOM", label: "Custom" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => applyPreset(option.value as DatePreset)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  preset === option.value
                    ? "bg-slate-900 text-white"
                    : "border bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Start date
              </span>

              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setPreset("CUSTOM");
                  setStartDate(event.target.value);
                }}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                End date
              </span>

              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setPreset("CUSTOM");
                  setEndDate(event.target.value);
                }}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Branch
              </span>

              <select
                value={branchId}
                onChange={(event) =>
                  void handleBranchChange(event.target.value)
                }
                disabled={loading}
                className="w-full min-w-44 rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 disabled:opacity-50"
              >
                {canViewAllBranches ? (
                  <option value="">All branches</option>
                ) : null}

                {branches.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatLongDate(startDate)} – {formatLongDate(endDate)}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {selectedBranchName}
          </span>
        </div>
      </SectionCard>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <p className="font-semibold">Unable to generate report</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      {loading && !report ? (
        <SectionCard contentClassName="p-12">
          <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Generating business report...
          </div>
        </SectionCard>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Net Sales"
              value={<Currency amount={report.summary.net_sales} />}
              icon={Banknote}
              description={`${formatNumber(
                report.summary.transaction_count
              )} completed transactions`}
            />

            {canViewFinance ? (
              <StatCard
                label="Gross Profit"
                value={<Currency amount={report.summary.gross_profit ?? 0} />}
                icon={TrendingUp}
                description={`${formatPercent(
                  report.summary.gross_margin
                )} gross margin`}
              />
            ) : (
              <StatCard
                label="Units Sold"
                value={formatNumber(report.summary.units_sold)}
                icon={Package}
                description="Units sold in the selected period"
              />
            )}

            {canViewFinance ? (
              <StatCard
                label="Inventory Value"
                value={
                  <Currency
                    amount={report.business_position.inventory_value ?? 0}
                  />
                }
                icon={Boxes}
                description={`${formatNumber(
                  report.business_position.inventory_quantity
                )} units currently on hand`}
              />
            ) : (
              <StatCard
                label="Units on Hand"
                value={formatNumber(
                  report.business_position.inventory_quantity
                )}
                icon={Boxes}
                description="Current inventory quantity"
              />
            )}

            {canViewFinance ? (
              <StatCard
                label="Supplier Payables"
                value={
                  <Currency
                    amount={report.business_position.supplier_outstanding ?? 0}
                  />
                }
                icon={WalletCards}
                description={
                  Number(report.business_position.supplier_overdue ?? 0) > 0
                    ? `${new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: "GBP",
                      }).format(
                        Number(report.business_position.supplier_overdue ?? 0)
                      )} overdue`
                    : "No overdue supplier balance"
                }
              />
            ) : (
              <StatCard
                label="Average Order"
                value={<Currency amount={report.summary.average_order_value} />}
                icon={ShoppingCart}
                description="Average completed transaction"
              />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Gross Sales"
              value={<Currency amount={report.summary.gross_sales} />}
              icon={CircleDollarSign}
              description="Sales before returns"
            />

            <StatCard
              label="Refunds"
              value={<Currency amount={report.summary.refunds} />}
              icon={RotateCcw}
              description="Completed customer returns"
            />

            {canViewFinance ? (
              <StatCard
                label="Net COGS"
                value={<Currency amount={report.summary.net_cogs ?? 0} />}
                icon={Package}
                description="Cost of goods after returns"
              />
            ) : (
              <StatCard
                label="Transactions"
                value={formatNumber(report.summary.transaction_count)}
                icon={ReceiptText}
                description="Completed transactions"
              />
            )}

            <StatCard
              label="Average Order"
              value={<Currency amount={report.summary.average_order_value} />}
              icon={ShoppingCart}
              description={`${formatNumber(
                report.summary.units_sold
              )} units sold`}
            />
          </div>

          <div
            className={`grid gap-4 ${canViewFinance ? "xl:grid-cols-3" : ""}`}
          >
            <SectionCard
              title={canViewFinance ? "Sales & Profit Trend" : "Sales Trend"}
              description={
                canViewFinance
                  ? "Net sales and gross profit across the selected reporting period."
                  : "Net sales across the selected reporting period."
              }
              className={canViewFinance ? "xl:col-span-2" : ""}
            >
              {!hasSalesActivity ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No sales activity"
                  description="There are no completed sales or returns in the selected reporting period."
                />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                      Net sales
                    </span>

                    {canViewFinance ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                        Gross profit
                      </span>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto">
                    <div
                      className="flex h-72 items-end gap-2 border-b border-slate-200 pt-6"
                      style={{
                        minWidth: `${Math.max(
                          report.sales_trend.length * 42,
                          650
                        )}px`,
                      }}
                    >
                      {report.sales_trend.map((point) => {
                        const salesHeight =
                          maxTrendValue > 0
                            ? Math.max(
                                (Number(point.net_sales) / maxTrendValue) * 220,
                                Number(point.net_sales) > 0 ? 4 : 0
                              )
                            : 0;

                        const profitValue = Number(point.gross_profit ?? 0);

                        const profitHeight =
                          canViewFinance && maxTrendValue > 0
                            ? Math.max(
                                (profitValue / maxTrendValue) * 220,
                                profitValue > 0 ? 4 : 0
                              )
                            : 0;

                        return (
                          <div
                            key={point.date}
                            className="group flex min-w-8 flex-1 flex-col items-center justify-end"
                          >
                            <div className="relative flex h-56 w-full items-end justify-center gap-1">
                              <div
                                title={`Net sales: £${Number(
                                  point.net_sales
                                ).toFixed(2)}`}
                                className="w-2.5 rounded-t bg-slate-900 transition-opacity group-hover:opacity-75"
                                style={{
                                  height: `${salesHeight}px`,
                                }}
                              />

                              {canViewFinance ? (
                                <div
                                  title={`Gross profit: £${profitValue.toFixed(
                                    2
                                  )}`}
                                  className="w-2.5 rounded-t bg-slate-300 transition-opacity group-hover:opacity-75"
                                  style={{
                                    height: `${profitHeight}px`,
                                  }}
                                />
                              ) : null}
                            </div>

                            <span className="mt-2 whitespace-nowrap text-[10px] text-slate-400">
                              {formatDate(point.date)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            {canViewFinance ? (
              <SectionCard
                title="Profitability"
                description="Financial performance for the selected period."
              >
                <div className="divide-y">
                  <MetricRow
                    label="Gross sales"
                    value={<Currency amount={report.summary.gross_sales} />}
                  />

                  <MetricRow
                    label="Returns / refunds"
                    value={
                      <span className="text-red-600">
                        -
                        <Currency amount={report.summary.refunds} />
                      </span>
                    }
                  />

                  <MetricRow
                    label="Net sales"
                    strong
                    value={<Currency amount={report.summary.net_sales} />}
                  />

                  <MetricRow
                    label="Gross COGS"
                    value={<Currency amount={report.summary.gross_cogs ?? 0} />}
                  />

                  <MetricRow
                    label="Returned COGS"
                    value={
                      <span className="text-emerald-700">
                        -
                        <Currency amount={report.summary.returned_cogs ?? 0} />
                      </span>
                    }
                  />

                  <MetricRow
                    label="Net COGS"
                    strong
                    value={<Currency amount={report.summary.net_cogs ?? 0} />}
                  />

                  <MetricRow
                    label="Gross profit"
                    strong
                    value={
                      <Currency amount={report.summary.gross_profit ?? 0} />
                    }
                  />

                  <MetricRow
                    label="Gross margin"
                    strong
                    value={
                      <span
                        className={getMarginTone(report.summary.gross_margin)}
                      >
                        {formatPercent(report.summary.gross_margin)}
                      </span>
                    }
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Discounts</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      <Currency amount={report.summary.discount_amount} />
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">VAT</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      <Currency amount={report.summary.vat_amount ?? 0} />
                    </p>
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard
              title="Top Products"
              description={
                canViewFinance
                  ? "Highest revenue products and profitability during the selected period."
                  : "Highest revenue products during the selected period."
              }
            >
              {report.top_products.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No product sales"
                  description="Product performance will appear when sales are recorded in this period."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 text-right font-medium">Units</th>
                        <th className="pb-3 text-right font-medium">Revenue</th>

                        {canViewFinance ? (
                          <>
                            <th className="pb-3 text-right font-medium">
                              Profit
                            </th>
                            <th className="pb-3 text-right font-medium">
                              Margin
                            </th>
                          </>
                        ) : null}
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {report.top_products.map((product) => (
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

                          {canViewFinance ? (
                            <>
                              <td className="py-3 text-right font-medium text-slate-900">
                                <Currency amount={product.gross_profit ?? 0} />
                              </td>

                              <td
                                className={`py-3 text-right font-medium ${getMarginTone(
                                  product.gross_margin
                                )}`}
                              >
                                {formatPercent(product.gross_margin)}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Branch Performance"
              description={
                canViewFinance
                  ? "Compare revenue and profitability across authorised locations."
                  : "Compare revenue and transaction activity across authorised locations."
              }
            >
              {report.branch_performance.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="No branch activity"
                  description="Branch performance will appear when sales are recorded."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-3 font-medium">Branch</th>
                        <th className="pb-3 text-right font-medium">Sales</th>
                        <th className="pb-3 text-right font-medium">
                          Transactions
                        </th>

                        {canViewFinance ? (
                          <>
                            <th className="pb-3 text-right font-medium">
                              Profit
                            </th>
                            <th className="pb-3 text-right font-medium">
                              Margin
                            </th>
                          </>
                        ) : null}
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {report.branch_performance.map((branchPerformance) => (
                        <tr key={branchPerformance.branch_id}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-slate-400" />
                              <span className="font-medium text-slate-900">
                                {branchPerformance.branch_name}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 text-right font-medium text-slate-900">
                            <Currency amount={branchPerformance.net_sales} />
                          </td>

                          <td className="py-3 text-right text-slate-600">
                            {formatNumber(branchPerformance.transactions)}
                          </td>

                          {canViewFinance ? (
                            <>
                              <td className="py-3 text-right font-medium text-slate-900">
                                <Currency
                                  amount={branchPerformance.gross_profit ?? 0}
                                />
                              </td>

                              <td
                                className={`py-3 text-right font-medium ${getMarginTone(
                                  branchPerformance.gross_margin
                                )}`}
                              >
                                {formatPercent(branchPerformance.gross_margin)}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <div
            className={`grid gap-4 ${
              canViewFinance ? "xl:grid-cols-3" : "xl:grid-cols-2"
            }`}
          >
            <SectionCard
              title="Sales Activity"
              description="Operational sales metrics."
            >
              <div className="divide-y">
                <MetricRow
                  label="Transactions"
                  value={formatNumber(report.summary.transaction_count)}
                />

                <MetricRow
                  label="Units sold"
                  value={formatNumber(report.summary.units_sold)}
                />

                <MetricRow
                  label="Average order value"
                  value={
                    <Currency amount={report.summary.average_order_value} />
                  }
                />

                <MetricRow
                  label="Refunds"
                  value={<Currency amount={report.summary.refunds} />}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Inventory Position"
              description="Current inventory quantity for the selected reporting scope."
            >
              <div className="divide-y">
                <MetricRow
                  label="Units on hand"
                  value={formatNumber(
                    report.business_position.inventory_quantity
                  )}
                />

                {canViewFinance ? (
                  <MetricRow
                    label="Inventory value"
                    strong
                    value={
                      <Currency
                        amount={report.business_position.inventory_value ?? 0}
                      />
                    }
                  />
                ) : null}
              </div>

              <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                {canViewFinance
                  ? "Inventory position is based on current quantity on hand and weighted average inventory cost."
                  : "Inventory quantity represents the current units on hand within the authorised reporting scope."}
              </div>
            </SectionCard>

            {canViewFinance ? (
              <SectionCard
                title="Accounts Payable"
                description="Current supplier liability position."
              >
                <div className="divide-y">
                  <MetricRow
                    label="Outstanding"
                    strong
                    value={
                      <Currency
                        amount={
                          report.business_position.supplier_outstanding ?? 0
                        }
                      />
                    }
                  />

                  <MetricRow
                    label="Overdue"
                    value={
                      <span
                        className={
                          Number(
                            report.business_position.supplier_overdue ?? 0
                          ) > 0
                            ? "font-semibold text-red-600"
                            : ""
                        }
                      >
                        <Currency
                          amount={
                            report.business_position.supplier_overdue ?? 0
                          }
                        />
                      </span>
                    }
                  />
                </div>

                <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                  {Number(report.business_position.supplier_overdue ?? 0) >
                  0 ? (
                    <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  ) : (
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                  Supplier balances represent the current payable position, not
                  a historical balance at the report end date.
                </div>
              </SectionCard>
            ) : null}
          </div>

          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            <div className="flex items-start gap-2">
              <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />

              <p>
                {canViewFinance
                  ? "Sales and profitability use the selected reporting period. Inventory and supplier payable figures represent the current business position. Historical COGS uses the cost captured on each original sale item."
                  : "Sales metrics use the selected reporting period. Inventory quantity represents the current authorised business position. Financial cost, profit, valuation, VAT, and supplier liability information is restricted for this role."}
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
