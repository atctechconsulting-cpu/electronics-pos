import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { displayCell, formatDate, type Report } from "./report-model";

export function renderPdf(report: Report): Blob {
  // Standard PDF fonts cover Western European text. Fail visibly rather than
  // corrupt names written in another script; Excel preserves Unicode strings.
  const text = [report.title, report.organization, report.branch, report.period, ...report.notes,
    ...report.columns.map(column => column.title), ...report.rows.flat().filter(value => typeof value === "string")].join(" ");
  if (/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u20ac]/u.test(text)) {
    throw new Error("This report contains characters the PDF font cannot display. Download Excel to preserve all text.");
  }
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const tableWidth = width - 24;
  const weights = report.columns.reduce((sum, column) => sum + column.width, 0);
  doc.setFontSize(9);
  const organizationLines = doc.splitTextToSize(`${report.organization} / ${report.branch}`, tableWidth);
  const headerHeight = 30 + organizationLines.length * 5;
  const headedPages = new Set<number>();
  const drawHeader = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (headedPages.has(page)) return;
    headedPages.add(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text(`AlphaPOS | ${report.title}`, 12, 12);
    doc.setFontSize(9);
    doc.text(organizationLines, 12, 19);
    doc.text(report.period, 12, 22 + organizationLines.length * 5);
    doc.text(`Generated ${formatDate(report.generatedAt)} (Europe/London)`, 12, 27 + organizationLines.length * 5);
  };
  autoTable(doc, {
    head: [report.columns.map(column => column.title)],
    body: report.rows.map(row => row.map((value, index) => displayCell(value, report.columns[index]))),
    startY: headerHeight + 4,
    margin: { top: headerHeight + 4, bottom: 15, left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: Object.fromEntries(report.columns.map((column, index) => [index, { cellWidth: tableWidth * column.width / weights, halign: column.kind === "currency" || column.kind === "number" ? "right" : "left" }])),
    showHead: "everyPage", rowPageBreak: "avoid", willDrawPage: drawHeader,
  });
  // AutoTable also paginates the summary, so it can never overlap the footer.
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? headerHeight;
  autoTable(doc, {
    body: [
      ...report.totals.map(total => [total.label, displayCell(total.value, { title: "", width: 1, kind: total.currency ? "currency" : "number" })]),
      ...report.notes.map(note => [{ content: note, colSpan: 2 }]),
      ...(report.rows.length ? [] : [[{ content: "No matching records.", colSpan: 2 }]]),
    ],
    startY: finalY + 6, margin: { top: headerHeight + 4, bottom: 15, left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    theme: "plain", rowPageBreak: "avoid", willDrawPage: drawHeader,
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${page} of ${pages}`, width - 12, height - 6, { align: "right" });
  }
  return doc.output("blob");
}
