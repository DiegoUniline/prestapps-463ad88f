import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { $$, fmtDate } from "@/lib/utils";
interface ExportColumn {
  header: string;
  key: string;
  format?: "money" | "date" | "number";
}

interface ExportOptions {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, number>;
  dateRange?: { from: string; to: string };
  empresaNombre?: string;
}

function fmtCell(val: any, fmt?: string) {
  if (val == null) return "";
  if (fmt === "money") return $$(Number(val));
  if (fmt === "date") return val ? fmtDate(val) : "";
  if (fmt === "number") return Number(val).toLocaleString("en-US");
  return String(val);
}

export function exportToPDF(opts: ExportOptions) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(234, 24, 77);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.title, 14, 15);

  if (opts.empresaNombre) {
    doc.setFontSize(9);
    doc.text(opts.empresaNombre, pageWidth - 14, 10, { align: "right" });
  }

  let startY = 28;
  if (opts.dateRange) {
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`Período: ${opts.dateRange.from} — ${opts.dateRange.to}`, 14, startY);
    startY += 6;
  }

  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, startY);
  startY += 6;

  const head = [opts.columns.map((c) => c.header)];
  const body = opts.rows.map((row) =>
    opts.columns.map((c) => fmtCell(row[c.key], c.format))
  );

  if (opts.totals) {
    const totalRow = opts.columns.map((c) => {
      if (c.key === opts.columns[0].key) return "TOTAL";
      if (opts.totals![c.key] !== undefined) return fmtCell(opts.totals![c.key], c.format || "money");
      return "";
    });
    body.push(totalRow);
  }

  autoTable(doc, {
    startY,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [234, 24, 77], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    didParseCell: (data) => {
      if (opts.totals && data.section === "body" && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [234, 234, 234];
      }
    },
  });

  doc.save(`${opts.title.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

export function exportToCSV(opts: ExportOptions) {
  const sep = ",";
  const header = opts.columns.map((c) => `"${c.header}"`).join(sep);
  const rows = opts.rows.map((row) =>
    opts.columns.map((c) => {
      const val = fmtCell(row[c.key], c.format);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(sep)
  );

  if (opts.totals) {
    const totalRow = opts.columns.map((c) => {
      if (c.key === opts.columns[0].key) return `"TOTAL"`;
      if (opts.totals![c.key] !== undefined) return `"${fmtCell(opts.totals![c.key], c.format || "money")}"`;
      return `""`;
    }).join(sep);
    rows.push(totalRow);
  }

  const bom = "\uFEFF";
  const csv = bom + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.title.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
