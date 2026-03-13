import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const $$ = (n: number | null | undefined) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PRIMARY_COLOR: [number, number, number] = [234, 24, 77]; // #EA184D
const GRAY: [number, number, number] = [107, 114, 128];
const DARK: [number, number, number] = [17, 24, 39];
const LIGHT_BG: [number, number, number] = [249, 250, 251];

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

  // Title bar
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 28, "F");

  let logoEndX = 14;
  // Logo in header
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "JPEG", 14, 3, 22, 22);
      logoEndX = 40;
    } catch {
      // Logo failed, continue without it
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(title, logoEndX, 14);

  // Company name under title if available
  if (empresaNombre) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(empresaNombre, logoEndX, 22);
  }

  // Right side - date
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - 14, 18, { align: "right" });

  // Prestamo info line
  doc.setTextColor(...DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Préstamo: PRE-${prestamoId.slice(0, 8)}`, 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`Cliente: ${clienteNombre}`, 14, 44);

  return 52; // y position after header
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

// ── 1. ESTADO DE CUENTA ──────────────────────────────────────────
export async function generarEstadoCuenta(prestamo: PrestamoData, cuotas: CuotaData[], pagos: PagoData[]) {
  const doc = new jsPDF();
  const logoBase64 = prestamo.logoUrl ? await loadImageAsBase64(prestamo.logoUrl) : null;
  let y = addHeader(doc, "ESTADO DE CUENTA", prestamo.id, prestamo.clienteNombre, logoBase64, prestamo.empresaNombre);

  // Summary section
  const totalPagado = cuotas.reduce((s, c) => s + (c.capital_pagado || 0) + (c.interes_pagado || 0) + (c.mora_pagada || 0), 0);
  const saldoPendiente = cuotas.reduce((s, c) => s + (c.saldo_total || 0), 0);

  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(14, y, 182, 28, 2, 2, "F");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);

  const summaryItems = [
    { label: "Monto Prestado", value: $$(prestamo.montoSolicitado) },
    { label: "Total a Pagar", value: $$(prestamo.montoTotalPagar) },
    { label: "Total Pagado", value: $$(totalPagado) },
    { label: "Saldo Pendiente", value: $$(saldoPendiente) },
  ];

  summaryItems.forEach((item, i) => {
    const x = 20 + i * 45;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(item.label.toUpperCase(), x, y + 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(item.value, x, y + 18);
  });

  y += 36;

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
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY_COLOR, fontSize: 7, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      5: { halign: "center" },
      8: { halign: "center" },
    },
    margin: { left: 14, right: 14 },
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
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: PRIMARY_COLOR, fontSize: 7, fontStyle: "bold" },
      footStyles: { fillColor: LIGHT_BG, textColor: DARK, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`estado-cuenta-PRE-${prestamo.id.slice(0, 8)}.pdf`);
}

// ── 2. CONTRATO ──────────────────────────────────────────────────
export function generarContrato(prestamo: PrestamoData, cuotas: CuotaData[]) {
  const doc = new jsPDF();
  let y = addHeader(doc, "CONTRATO DE PRÉSTAMO", prestamo.id, prestamo.clienteNombre);

  const modalidadText = prestamo.modalidad === "fijo" ? "Interés Fijo" : "Saldos Insolutos";
  const cuotaVal = $$(prestamo.cuotaRedondeada || prestamo.cuotaCalculada);

  // Client info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Datos del Cliente", 14, y);
  y += 6;

  const clientFields = [
    ["Nombre", prestamo.clienteNombre],
    ["Documento", prestamo.clienteDni || "—"],
    ["Dirección", prestamo.clienteDireccion || "—"],
    ["Teléfono", prestamo.clienteTelefono || "—"],
  ];

  doc.setFontSize(8);
  clientFields.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(value, 55, y);
    y += 5;
  });

  y += 6;

  // Contract terms
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Condiciones del Crédito", 14, y);
  y += 6;

  const terms = [
    ["Monto Solicitado", $$(prestamo.montoSolicitado)],
    ["Total a Pagar", $$(prestamo.montoTotalPagar)],
    ["Modalidad", modalidadText],
    ["Número de Cuotas", `${prestamo.numCuotas}`],
    ["Frecuencia de Pago", prestamo.frecuencia],
    ["Tasa de Interés", `${prestamo.tasaInteres}%`],
    ["Valor de Cuota", cuotaVal],
    ["Gastos Legales", $$(prestamo.gastosLegales)],
    ["Tipo de Mora", `${prestamo.tipoMora} — ${prestamo.valorMora}${prestamo.tipoMora === "porcentaje" ? "%" : ""}`],
    ["Fecha de Registro", prestamo.fechaRegistro],
    ["Fecha Primer Pago", prestamo.fechaPrimerPago],
    ["Ruta", prestamo.ruta || "—"],
    ["Caja", prestamo.caja || "—"],
  ];

  doc.setFontSize(8);
  terms.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(value, 65, y);
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
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY_COLOR, fontSize: 7, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 30;

  // Signatures
  if (y > 240) { doc.addPage(); y = 20; }
  
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  
  // Left signature
  doc.line(14, y + 20, 90, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("Firma del Cliente", 52, y + 26, { align: "center" });
  doc.text(prestamo.clienteNombre, 52, y + 31, { align: "center" });

  // Right signature
  doc.line(120, y + 20, 196, y + 20);
  doc.text("Firma Autorizada", 158, y + 26, { align: "center" });
  doc.text("Empresa", 158, y + 31, { align: "center" });

  addFooter(doc);
  doc.save(`contrato-PRE-${prestamo.id.slice(0, 8)}.pdf`);
}

// ── 3. RECIBO DE PAGOS ──────────────────────────────────────────
export function generarReciboPagos(prestamo: PrestamoData, pagos: PagoData[]) {
  const doc = new jsPDF();
  let y = addHeader(doc, "RECIBO DE PAGOS", prestamo.id, prestamo.clienteNombre);

  if (pagos.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text("No se han registrado pagos para este préstamo.", 14, y);
    addFooter(doc);
    doc.save(`pagos-PRE-${prestamo.id.slice(0, 8)}.pdf`);
    return;
  }

  // Summary
  const totalMonto = pagos.reduce((s, p) => s + p.monto_recibido, 0);
  const totalMora = pagos.reduce((s, p) => s + p.aplicado_mora, 0);
  const totalInteres = pagos.reduce((s, p) => s + p.aplicado_interes, 0);
  const totalCapital = pagos.reduce((s, p) => s + p.aplicado_capital, 0);

  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(14, y, 182, 20, 2, 2, "F");

  const sumItems = [
    { label: "Total Pagado", value: $$(totalMonto) },
    { label: "A Mora", value: $$(totalMora) },
    { label: "A Interés", value: $$(totalInteres) },
    { label: "A Capital", value: $$(totalCapital) },
  ];

  sumItems.forEach((item, i) => {
    const x = 20 + i * 45;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(item.label.toUpperCase(), x, y + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(item.value, x, y + 15);
  });

  y += 28;

  // Payments table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Detalle de Pagos", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["#", "Fecha", "Monto Recibido", "→ Mora", "→ Interés", "→ Capital", "Método", "Caja"]],
    body: pagos.map((p, i) => [
      i + 1,
      p.created_at ? format(new Date(p.created_at), "dd/MM/yyyy HH:mm") : "—",
      $$(p.monto_recibido),
      p.aplicado_mora > 0 ? $$(p.aplicado_mora) : "—",
      p.aplicado_interes > 0 ? $$(p.aplicado_interes) : "—",
      p.aplicado_capital > 0 ? $$(p.aplicado_capital) : "—",
      p.metodo_pago || "Efectivo",
      p.cajaNombre || "—",
    ]),
    foot: [["", "TOTALES", $$(totalMonto), $$(totalMora), $$(totalInteres), $$(totalCapital), "", ""]],
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY_COLOR, fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: LIGHT_BG, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`pagos-PRE-${prestamo.id.slice(0, 8)}.pdf`);
}
