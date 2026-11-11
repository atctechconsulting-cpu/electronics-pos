import { supabase } from "@/lib/supabase/client";
import { getSalesHistory } from "@/lib/services/sales-history";
import { getInventory } from "@/lib/services/inventory";
import { getStockMovements } from "@/lib/services/stock-movements";
import { collectExportRows } from "@/lib/services/export-pagination";
import { dateBounds, formatDate, MAX_EXPORT_ROWS, REPORT_TITLES, type Report, type ReportKind } from "./report-model";

export type ExportRequest = {
  kind: ReportKind;
  organizationId: string;
  organizationName: string;
  branchId: string;
  branchName: string;
  startDate: string;
  endDate: string;
  search?: string;
};

export async function exportAccess(input: ExportRequest) {
  if (!input.organizationId || !input.branchId) throw new Error("Choose an organisation and branch.");
  async function allowed(permission: string) {
    const { data, error } = await supabase.rpc("has_permission", {
      target_permission_key: permission,
      target_organization_id: input.organizationId,
      target_branch_id: input.branchId,
    });
    if (error) throw new Error("Unable to verify export permissions. Please retry.");
    return data === true;
  }
  if (!await allowed(input.kind === "sales" ? "sales.view" : "inventory.view")) {
    throw new Error("You do not have permission to export this report for this branch.");
  }
  return input.kind !== "sales" && await allowed("finance.view");
}

function joined<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export async function buildReport(input: ExportRequest, assertCurrent: () => void): Promise<Report> {
  assertCurrent();
  const finance = await exportAccess(input);
  assertCurrent();
  const generatedAt = new Date();
  const bounds = input.kind === "inventory" ? undefined : dateBounds(input.startDate, input.endDate);
  const report: Report = {
    title: REPORT_TITLES[input.kind], organization: input.organizationName, branch: input.branchName,
    generatedAt,
    period: bounds ? `${input.startDate.split("-").reverse().join("/")} to ${input.endDate.split("-").reverse().join("/")} (Europe/London)` : `As at ${formatDate(generatedAt)} (Europe/London)`,
    notes: [], columns: [], rows: [], totals: [],
  };

  if (input.kind === "sales") {
    const sales = await collectExportRows(page => getSalesHistory({
      organizationId: input.organizationId, branchId: input.branchId, search: input.search,
      exportPage: { ...page, ...bounds },
    }), assertCurrent, MAX_EXPORT_ROWS);
    report.columns = [
      { title: "Transaction date (UK)", kind: "date", width: 23 }, { title: "Receipt", width: 22 },
      { title: "Customer", width: 26 }, { title: "Cashier", width: 22 }, { title: "Payment method", width: 23 },
      { title: "Original total", kind: "currency", width: 19 }, { title: "Sale status", width: 18 },
    ];
    report.rows = sales.map(sale => [
      new Date(sale.completed_at ?? sale.created_at), sale.receipt_number,
      sale.customer ? `${sale.customer.first_name} ${sale.customer.last_name ?? ""}`.trim() : "Walk-in Customer",
      sale.cashier?.full_name ?? "Unavailable", [...new Set(sale.payments.map(p => p.payment_method.replaceAll("_", " ")))].join(", ") || "Unavailable",
      sale.total_amount, sale.status,
    ]);
    report.totals = [{ label: "Transactions", value: sales.length }, { label: "Original sales total", value: sum(sales.map(s => s.total_amount)), currency: true }];
    report.notes = ["Original sale totals are retained. REFUNDED is the stored sale status and can include full NO_REFUND returns. COMPLETED sales may have partial returns. Return transactions and refund amounts are listed in Returns History."];
  } else if (input.kind === "inventory") {
    const inventory = await collectExportRows(page => getInventory(input.organizationId, input.branchId, page), assertCurrent, MAX_EXPORT_ROWS);
    const search = input.search?.trim().toLowerCase();
    const items = inventory.filter(item => {
      const product = joined(item.products);
      return !search || [product?.name, product?.sku, product?.barcode].some(value => value?.toLowerCase().includes(search));
    });
    report.columns = [
      { title: "Product", width: 30 }, { title: "SKU", width: 20 }, { title: "Category", width: 20 },
      { title: "Brand", width: 18 }, { title: "On hand", kind: "number", width: 12 },
      { title: "Available", kind: "number", width: 12 }, { title: "Retail price", kind: "currency", width: 16 },
    ];
    if (finance) report.columns.push({ title: "Average cost", kind: "currency", width: 16 }, { title: "Stock value", kind: "currency", width: 18 });
    report.rows = items.map(item => {
      const product = joined(item.products);
      const row: Report["rows"][number] = [product?.name ?? "Unavailable", product?.sku ?? "", joined(product?.categories ?? null)?.name ?? "", joined(product?.brands ?? null)?.name ?? "",
        Number(item.quantity_on_hand), Number(item.quantity_available), product?.retail_price == null ? null : Number(product.retail_price)];
      if (finance) row.push(item.average_cost, item.average_cost == null ? null : Number(item.quantity_on_hand) * item.average_cost);
      return row;
    });
    report.totals = [{ label: "Products", value: items.length }, { label: "Units on hand", value: sum(items.map(i => Number(i.quantity_on_hand))) }, { label: "Units available", value: sum(items.map(i => Number(i.quantity_available))) }];
    if (finance && items.every(i => i.average_cost != null)) report.totals.push({ label: "Inventory valuation", value: sum(items.map(i => Number(i.quantity_on_hand) * i.average_cost!)), currency: true });
    if (finance && items.some(i => i.average_cost == null)) report.notes.push("Some costs are unavailable. A complete inventory valuation cannot be calculated.");
    report.notes.push("Current inventory position collected at export time.");
  } else {
    const movements = await collectExportRows(page => getStockMovements(input.organizationId, input.branchId, { ...page, ...bounds }), assertCurrent, MAX_EXPORT_ROWS);
    report.columns = [{ title: "Movement date (UK)", kind: "date", width: 23 }, { title: "Product", width: 30 }, { title: "Movement type", width: 25 }, { title: "Quantity", kind: "number", width: 14 }, { title: "Reference", width: 30 }];
    if (finance) report.columns.push({ title: "Unit cost", kind: "currency", width: 18 });
    report.rows = movements.map(movement => {
      const row: Report["rows"][number] = [new Date(movement.created_at), joined(movement.products)?.name ?? "Unavailable", movement.movement_type, Number(movement.quantity), movement.reference ?? ""];
      if (finance) row.push(movement.unit_cost);
      return row;
    });
    report.totals = [{ label: "Movements", value: movements.length }, { label: "Signed movement quantity", value: sum(movements.map(m => Number(m.quantity))) }];
  }
  if (input.search?.trim()) report.notes.push(`Search filter: ${input.search.trim()}`);
  assertCurrent();
  if (await exportAccess(input) !== finance) throw new Error("Financial access changed during export. Please retry.");
  assertCurrent();
  return report;
}
