export type ReportKind = "sales" | "inventory" | "movements";
export type Cell = string | number | Date | null;
export type Column = { title: string; kind?: "currency" | "number" | "date"; width: number };
export type Report = {
  title: string;
  organization: string;
  branch: string;
  generatedAt: Date;
  period: string;
  notes: string[];
  columns: Column[];
  rows: Cell[][];
  totals: { label: string; value: number; currency?: boolean }[];
};

export const REPORT_TITLES: Record<ReportKind, string> = {
  sales: "Sales Report", inventory: "Inventory Report", movements: "Stock Movement Report",
};
export const TIME_ZONE = "Europe/London";
export const MAX_EXPORT_ROWS = 5000;

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(value);
}

export function todayInLondon() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Convert UK business-day boundaries independently, including 23/25-hour DST days.
export function dateBounds(start: string, end: string) {
  function parse(value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error("Choose valid start and end dates.");
    }
    return date;
  }
  function midnight(date: Date) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
    return new Date(date.getTime() - hour * 3600000).toISOString();
  }
  const first = parse(start), last = parse(end);
  if (last < first) throw new Error("End date must be on or after start date.");
  last.setUTCDate(last.getUTCDate() + 1);
  return { start: midnight(first), end: midnight(last) };
}

export function displayCell(value: Cell, column: Column) {
  if (value == null) return "—";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "number") return new Intl.NumberFormat("en-GB", column.kind === "currency"
    ? { style: "currency", currency: "GBP" } : { maximumFractionDigits: 4 }).format(value);
  return value;
}
