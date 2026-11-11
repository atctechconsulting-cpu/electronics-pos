import ExcelJS from "exceljs";
import { formatDate, type Report } from "./report-model";

export async function renderExcel(report: Report): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AlphaPOS";
  workbook.created = report.generatedAt;
  const sheet = workbook.addWorksheet("Report");
  sheet.addRow([`AlphaPOS — ${report.title}`]);
  sheet.addRow([report.organization, report.branch]);
  sheet.addRow([report.period]);
  sheet.addRow([`Generated ${formatDate(report.generatedAt)} (Europe/London)`]);
  for (const note of report.notes) sheet.addRow([note]);
  sheet.addRow([]);
  const headings = sheet.addRow(report.columns.map(column => column.title));
  headings.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headings.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  report.columns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });
  sheet.views = [{ state: "frozen", ySplit: headings.number }];
  for (const row of report.rows) {
    sheet.addRow(row.map(value => {
      if (!(value instanceof Date)) return value; // Strings stay literal cells, never formula objects.
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
      const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
      return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
    }));
    const added = sheet.lastRow!;
    added.alignment = { vertical: "top", wrapText: true };
    report.columns.forEach((column, index) => {
      const cell = added.getCell(index + 1);
      cell.numFmt = column.kind === "currency" ? '"£"#,##0.00;[Red]-"£"#,##0.00' : column.kind === "date" ? "dd/mm/yyyy hh:mm" : column.kind === "number" ? "0.####" : "@";
    });
  }
  sheet.autoFilter = { from: { row: headings.number, column: 1 }, to: { row: Math.max(headings.number, sheet.rowCount), column: report.columns.length } };
  sheet.addRow([]);
  for (const total of report.totals) {
    const row = sheet.addRow([total.label, total.value]);
    row.font = { bold: true };
    row.getCell(2).numFmt = total.currency ? '"£"#,##0.00;[Red]-"£"#,##0.00' : "0.####";
  }
  for (let row = 1; row < headings.number - 1; row++) {
    if (row !== 2) sheet.mergeCells(row, 1, row, report.columns.length);
    sheet.getRow(row).alignment = { wrapText: true, vertical: "top" };
    if (row >= 5) sheet.getRow(row).height = 45;
  }
  sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headings.number}:${headings.number}` };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
