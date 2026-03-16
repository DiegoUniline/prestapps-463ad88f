import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { $$ } from "@/lib/utils";

const GRAY: [number, number, number] = [107, 114, 128];
const DARK: [number, number, number] = [17, 24, 39];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

/** Load an image URL as base64 data URL for jsPDF */
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addHeader(doc: jsPDF, title: string, prestamoId: string, clienteNombre: string, logoBase64?: string | null, empresaNombre?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();

  let logoEndX = 14;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "JPEG", 14, 10, 18, 18);
      logoEndX = 36;
    } catch { /* skip */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BLACK);
  doc.text(title, logoEndX, 18);

  if (empresaNombre) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(empresaNombre, logoEndX, 24);
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - 14, 18, { align: "right" });

  // Thin separator line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(14, 30, pageWidth - 14, 30);

  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Préstamo: PRE-${prestamoId.slice(0, 8)}`, 14, 37);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`Cliente: ${clienteNombre}`, 14, 42);

  return 50;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  }
}

interface PrestamoData {
  id: string;
  clienteNombre: string;
  clienteDni: string;
  clienteDireccion: string;
  clienteTelefono: string;
  empresa: string;
  modalidad: string;
  montoSolicitado: number;
  montoTotalPagar: number;
  numCuotas: number;
  frecuencia: string;
  tasaInteres: number;
  cuotaCalculada: number;
  cuotaRedondeada: number;
  gastosLegales: number;
  tipoMora: string;
  valorMora: number;
  estado: string;
  fechaRegistro: string;
  fechaPrimerPago: string;
  caja: string;
  ruta: string;
  notas: string;
  logoUrl?: string | null;
  empresaNombre?: string;
}

interface CuotaData {
  num_cuota: number;
  capital: number;
  interes: number;
  capital_interes: number;
  fecha_vencimiento: string;
  dias_atraso: number;
  mora: number;
  saldo_total: number;
  status: string;
  fecha_pagada: string | null;
  capital_pagado: number;
  interes_pagado: number;
  mora_pagada: number;
}

interface PagoData {
  created_at: string;
  monto_recibido: number;
  aplicado_mora: number;
  aplicado_interes: number;
  aplicado_capital: number;
  metodo_pago: string;
  cajaNombre: string;
}

const cleanTableStyles = {
  styles: { fontSize: 7, cellPadding: 2, textColor: DARK },
  headStyles: { fillColor: TABLE_HEAD_BG, fontSize: 7, fontStyle: "bold" as const, textColor: [255, 255, 255] as [number, number, number] },
  alternateRowStyles: {},
  margin: { left: 14, right: 14 },
};

// ── 1. ESTADO DE CUENTA ──────────────────────────────────────────
export async function generarEstadoCuenta(prestamo: PrestamoData, cuotas: CuotaData[], pagos: PagoData[]) {
  const doc = new jsPDF();
  const logoBase64 = prestamo.logoUrl ? await loadImageAsBase64(prestamo.logoUrl) : null;
  let y = addHeader(doc, "ESTADO DE CUENTA", prestamo.id, prestamo.clienteNombre, logoBase64, prestamo.empresaNombre);

  const totalPagado = cuotas.reduce((s, c) => s + (c.capital_pagado || 0) + (c.interes_pagado || 0) + (c.mora_pagada || 0), 0);
  const saldoPendiente = cuotas.reduce((s, c) => s + (c.saldo_total || 0), 0);

  // Summary as simple text grid - no background
  doc.setFontSize(7);
  const summaryItems = [
    { label: "Monto Prestado", value: $$(prestamo.montoSolicitado) },
    { label: "Total a Pagar", value: $$(prestamo.montoTotalPagar) },
    { label: "Total Pagado", value: $$(totalPagado) },
    { label: "Saldo Pendiente", value: $$(saldoPendiente) },
  ];

  summaryItems.forEach((item, i) => {
    const x = 16 + i * 45;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(item.label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(item.value, x, y + 6);
    doc.setFontSize(7);
  });

  y += 16;

  // Loan details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Información del Préstamo", 14, y);
  y += 6;

  const details = [
    ["Estado", prestamo.estado],
    ["Modalidad", prestamo.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos"],
    ["Cuotas", `${prestamo.numCuotas} — ${prestamo.frecuencia}`],
    ["Tasa de Interés", `${prestamo.tasaInteres}%`],
    ["Cuota", $$(prestamo.cuotaRedondeada || prestamo.cuotaCalculada)],
    ["F. Registro", prestamo.fechaRegistro],
    ["F. Primer Pago", prestamo.fechaPrimerPago],
  ];

  doc.setFontSize(8);
  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(value || "—", 65, y);
    y += 5;
  });

  y += 6;

  // Amortization table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Tabla de Amortización", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["#", "Capital", "Interés", "Cuota", "F. Venc.", "Días", "Mora", "Saldo", "Status"]],
    body: cuotas.map((c) => [
      c.num_cuota,
      $$(c.capital),
      $$(c.interes),
      $$(c.capital_interes),
      format(new Date(c.fecha_vencimiento), "dd/MM/yy"),
      c.dias_atraso > 0 ? c.dias_atraso : "—",
      c.mora > 0 ? $$(c.mora) : "—",
      $$(c.saldo_total),
      c.status,
    ]),
    ...cleanTableStyles,
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      5: { halign: "center" },
      8: { halign: "center" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Payments table
  if (pagos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text("Pagos Realizados", 14, y);
    y += 4;

    const totalMonto = pagos.reduce((s, p) => s + p.monto_recibido, 0);

    autoTable(doc, {
      startY: y,
      head: [["#", "Fecha", "Monto", "→ Mora", "→ Interés", "→ Capital", "Método"]],
      body: [
        ...pagos.map((p, i) => [
          i + 1,
          p.created_at ? format(new Date(p.created_at), "dd/MM/yyyy") : "—",
          $$(p.monto_recibido),
          p.aplicado_mora > 0 ? $$(p.aplicado_mora) : "—",
          p.aplicado_interes > 0 ? $$(p.aplicado_interes) : "—",
          p.aplicado_capital > 0 ? $$(p.aplicado_capital) : "—",
          p.metodo_pago || "Efectivo",
        ]),
      ],
      foot: [["", "TOTAL", $$(totalMonto), "", "", "", ""]],
      ...cleanTableStyles,
      footStyles: { textColor: DARK, fontStyle: "bold" as const },
    });
  }

  addFooter(doc);
  return doc;
}


// ── 2. CONTRATO ──────────────────────────────────────────────────
export async function generarContrato(prestamo: PrestamoData, cuotas: CuotaData[]) {
  const doc = new jsPDF();
  const logoBase64 = prestamo.logoUrl ? await loadImageAsBase64(prestamo.logoUrl) : null;
  let y = addHeader(doc, "CONTRATO DE PRÉSTAMO", prestamo.id, prestamo.clienteNombre, logoBase64, prestamo.empresaNombre);

  const modalidadText = prestamo.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos";
  const cuotaVal = $$(prestamo.cuotaRedondeada || prestamo.cuotaCalculada);

  // Client info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Datos del Cliente", 14, y);
  y += 6;

  const clientFields = [
    [["Nombre", prestamo.clienteNombre], ["Documento", prestamo.clienteDni || "—"]],
    [["Dirección", prestamo.clienteDireccion || "—"], ["Teléfono", prestamo.clienteTelefono || "—"]],
  ];

  doc.setFontSize(8);
  clientFields.forEach((row) => {
    row.forEach(([label, value], col) => {
      const x = col === 0 ? 14 : 110;
      const xVal = col === 0 ? 45 : 145;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(label, x, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(value, xVal, y);
    });
    y += 5;
  });

  y += 6;

  // Contract terms
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Condiciones del Crédito", 14, y);
  y += 6;

  const terms: [string, string][][] = [
    [["Monto Solicitado", $$(prestamo.montoSolicitado)], ["Total a Pagar", $$(prestamo.montoTotalPagar)]],
    [["Modalidad", modalidadText], ["Tasa de Interés", `${prestamo.tasaInteres}%`]],
    [["Número de Cuotas", `${prestamo.numCuotas}`], ["Frecuencia", prestamo.frecuencia], ["Valor de Cuota", cuotaVal]],
    [["Gastos Legales", $$(prestamo.gastosLegales)], ["Tipo de Mora", `${prestamo.tipoMora} — ${prestamo.valorMora}${prestamo.tipoMora === "porcentaje" ? "%" : ""}`]],
    [["Fecha Registro", prestamo.fechaRegistro], ["Primer Pago", prestamo.fechaPrimerPago]],
    [["Ruta", prestamo.ruta || "—"], ["Caja", prestamo.caja || "—"]],
  ];

  doc.setFontSize(8);
  terms.forEach((row) => {
    const colWidth = 196 / row.length;
    row.forEach(([label, value], col) => {
      const x = 14 + col * colWidth;
      const xVal = x + Math.min(colWidth * 0.45, 35);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(label, x, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(value, xVal, y);
    });
    y += 5;
  });

  y += 8;

  // Contract text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  const contractText = `Por medio del presente documento, el cliente ${prestamo.clienteNombre} se compromete al pago de la cantidad de ${$$(prestamo.montoTotalPagar)} en ${prestamo.numCuotas} cuotas de ${cuotaVal} con frecuencia ${prestamo.frecuencia}, bajo la modalidad de ${modalidadText} con una tasa de interés del ${prestamo.tasaInteres}%.

El incumplimiento de pago generará una mora de tipo ${prestamo.tipoMora} con un valor de ${prestamo.valorMora}${prestamo.tipoMora === "porcentaje" ? "%" : ""} sobre el saldo de la cuota.

${prestamo.notas ? `Notas: ${prestamo.notas}` : ""}`;

  const lines = doc.splitTextToSize(contractText, 180);
  doc.text(lines, 14, y);
  y += lines.length * 4 + 10;

  // Amortization schedule
  if (y > 200) { doc.addPage(); y = 20; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Plan de Pagos", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["#", "F. Vencimiento", "Capital", "Interés", "Cuota"]],
    body: cuotas.map((c) => [
      c.num_cuota,
      format(new Date(c.fecha_vencimiento), "dd/MM/yyyy"),
      $$(c.capital),
      $$(c.interes),
      $$(c.capital_interes),
    ]),
    ...cleanTableStyles,
  });

  y = (doc as any).lastAutoTable.finalY + 30;

  // Signatures
  if (y > 240) { doc.addPage(); y = 20; }
  
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  
  doc.line(14, y + 20, 90, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("Firma del Cliente", 52, y + 26, { align: "center" });
  doc.text(prestamo.clienteNombre, 52, y + 31, { align: "center" });

  doc.line(120, y + 20, 196, y + 20);
  doc.text("Firma Autorizada", 158, y + 26, { align: "center" });
  doc.text(prestamo.empresaNombre || "Empresa", 158, y + 31, { align: "center" });

  addFooter(doc);
  return doc;
}


// ── 3. RECIBO DE PAGOS (formato ticket 80mm) ─────────────────────
export async function generarReciboPagos(prestamo: PrestamoData, pagos: PagoData[]) {
  const ticketW = 80; // mm
  const margin = 5;
  const contentW = ticketW - margin * 2;
  
  // We'll build content first to calculate height, start with an estimate
  const logoBase64 = prestamo.logoUrl ? await loadImageAsBase64(prestamo.logoUrl) : null;
  
  // Calculate approximate height needed
  let estHeight = 40; // header
  if (logoBase64) estHeight += 20;
  estHeight += 30; // loan info
  estHeight += pagos.length * 28; // each payment block
  estHeight += 30; // totals + footer
  estHeight = Math.max(estHeight, 100);

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: [ticketW, estHeight] });

  let y = margin;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "JPEG", ticketW / 2 - 10, y, 20, 20);
      y += 22;
    } catch { /* skip */ }
  }

  // Company name
  if (prestamo.empresaNombre) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(prestamo.empresaNombre.toUpperCase(), ticketW / 2, y, { align: "center" });
    y += 4;
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text("RECIBO DE PAGO", ticketW / 2, y, { align: "center" });
  y += 5;

  // Dashed line
  doc.setDrawColor(150, 150, 150);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, ticketW - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  // Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text(`Fecha: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, y);
  y += 4;

  // Loan & client info
  const infoLines = [
    [`Préstamo: PRE-${prestamo.id.slice(0, 8)}`],
    [`Cliente: ${prestamo.clienteNombre}`],
  ];
  doc.setFontSize(7);
  doc.setTextColor(...DARK);
  infoLines.forEach(([line]) => {
    doc.text(line, margin, y);
    y += 3.5;
  });

  y += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, ticketW - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  if (pagos.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text("Sin pagos registrados.", margin, y);
    return doc;
  }

  // Each payment
  let totalMonto = 0, totalMora = 0, totalInteres = 0, totalCapital = 0;

  pagos.forEach((p, i) => {
    totalMonto += p.monto_recibido;
    totalMora += p.aplicado_mora;
    totalInteres += p.aplicado_interes;
    totalCapital += p.aplicado_capital;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text(`Pago #${i + 1}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(p.created_at ? format(new Date(p.created_at), "dd/MM/yy HH:mm") : "—", ticketW - margin, y, { align: "right" });
    y += 3.5;

    const rows = [
      ["Monto:", $$(p.monto_recibido)],
      ["→ Mora:", $$(p.aplicado_mora)],
      ["→ Interés:", $$(p.aplicado_interes)],
      ["→ Capital:", $$(p.aplicado_capital)],
      ["Método:", p.metodo_pago || "Efectivo"],
    ];

    doc.setFontSize(7);
    rows.forEach(([label, val]) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(label, margin + 2, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(val, ticketW - margin, y, { align: "right" });
      y += 3.2;
    });

    y += 2;
  });

  // Totals separator
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, ticketW - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  // Totals
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text("TOTAL PAGADO", margin, y);
  doc.text($$(totalMonto), ticketW - margin, y, { align: "right" });
  y += 4;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  const totRows = [
    ["Total Mora:", $$(totalMora)],
    ["Total Interés:", $$(totalInteres)],
    ["Total Capital:", $$(totalCapital)],
  ];
  totRows.forEach(([l, v]) => {
    doc.text(l, margin + 2, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(v, ticketW - margin, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    y += 3.2;
  });

  y += 3;

  // Footer
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, ticketW - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text("Gracias por su pago", ticketW / 2, y, { align: "center" });
  y += 3;
  doc.text(`${prestamo.empresaNombre || ""} © ${new Date().getFullYear()}`, ticketW / 2, y, { align: "center" });

  return doc;
}
