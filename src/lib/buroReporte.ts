import type { jsPDF } from "jspdf";
import { format } from "date-fns";
import { $$, fmtDateTime } from "@/lib/utils";

// Reporte completo de Círculo de Crédito (PM y PF) a partir de buro_consultas.respuesta.
// La respuesta se recorre de forma genérica para no depender de cada campo del API:
// objetos → pares etiqueta/valor, listas de objetos → tabla (o fichas si tienen muchas columnas).

export type Bloque =
  | { tipo: "kv"; titulo: string; pares: [string, string][] }
  | { tipo: "tabla"; titulo: string; columnas: string[]; filas: string[][] };

export interface ConsultaReporte {
  rfc: string;
  razon_social: string | null;
  tipo_persona: "fisica" | "moral";
  folio_consulta: string | null;
  score: number | null;
  created_at: string;
  autorizacion_fecha: string;
}

const MAX_COLUMNAS = 8;
const RAIZ = "Datos de la consulta";
const OMITIR = new Set(["errores", "errors", "raw"]);

const ETIQUETAS: Record<string, string> = {
  RFC: "RFC",
  CURP: "CURP",
  CP: "C.P.",
  folioConsulta: "Folio de consulta",
  folioOtorgante: "Folio otorgante",
  claveRetorno: "Clave de retorno",
  credito: "Créditos",
  cuentasFinancieras: "Cuentas financieras",
  cuentasComerciales: "Cuentas comerciales",
  calificacionCartera: "Calificación de cartera",
  consultasInstitucionales: "Consultas institucionales",
  consultasFinancieras: "Consultas financieras",
  consultasComerciales: "Consultas comerciales",
  clavePrevenciones: "Claves de prevención",
  accionistas: "Accionistas",
  avales: "Avales",
  persona: "Datos generales",
  domicilios: "Domicilios",
  empleos: "Empleos",
  creditos: "Créditos",
  consultas: "Consultas",
  scores: "Score",
  mensajes: "Mensajes",
  "29dias": "1–29 días",
  "59dias": "30–59 días",
  "89dias": "60–89 días",
  "119dias": "90–119 días",
  "179dias": "120–179 días",
  "180MasDias": "180+ días",
};

export function etiqueta(k: string): string {
  if (ETIQUETAS[k]) return ETIQUETAS[k];
  const s = k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ES_DINERO = /saldo|monto|limite|importe|vigente|maximo|avalad|^\d+dias$|masdias$/i;
const NO_DINERO = /numero|fecha|porcentaje|plazo|clave|folio/i;

export function valor(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  if (!isNaN(n) && ES_DINERO.test(k) && !NO_DINERO.test(k)) return $$(n);
  if (Array.isArray(v)) return v.map((x) => (x != null && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const esPrimitivo = (v: unknown) => v == null || typeof v !== "object";
const esListaPrimitivos = (v: unknown) => Array.isArray(v) && v.every(esPrimitivo);
const vacio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Aplana un registro un nivel: { domicilio: { ciudad } } → "Domicilio › Ciudad". */
function aplanar(o: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(o)) {
    if (vacio(v)) continue;
    if (esPrimitivo(v) || esListaPrimitivos(v)) out.push([etiqueta(k), valor(k, v)]);
    else if (Array.isArray(v)) out.push([etiqueta(k), `${v.length} registro(s)`]);
    else for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
      if (!vacio(v2)) out.push([`${etiqueta(k)} › ${etiqueta(k2)}`, valor(k2, v2)]);
    }
  }
  return out;
}

function recorrer(v: unknown, titulo: string, bloques: Bloque[]) {
  if (vacio(v)) return;
  if (Array.isArray(v)) {
    if (esListaPrimitivos(v)) {
      bloques.push({ tipo: "kv", titulo, pares: v.map((x, i) => [String(i + 1), valor("", x)]) });
      return;
    }
    const filas = v.filter((x) => x && typeof x === "object").map((x) => aplanar(x as Record<string, unknown>));
    const columnas = [...new Set(filas.flatMap((f) => f.map(([c]) => c)))];
    if (columnas.length <= MAX_COLUMNAS) {
      bloques.push({
        tipo: "tabla", titulo, columnas,
        filas: filas.map((f) => { const m = new Map(f); return columnas.map((c) => m.get(c) ?? "—"); }),
      });
    } else {
      filas.forEach((f, i) => bloques.push({ tipo: "kv", titulo: `${titulo} ${i + 1} de ${filas.length}`, pares: f }));
    }
    return;
  }
  if (typeof v !== "object") {
    bloques.push({ tipo: "kv", titulo, pares: [[titulo, valor(titulo, v)]] });
    return;
  }
  const o = v as Record<string, unknown>;
  const pares: [string, string][] = [];
  const hijos: [string, unknown][] = [];
  for (const [k, x] of Object.entries(o)) {
    if (OMITIR.has(k) || vacio(x)) continue;
    if (esPrimitivo(x) || esListaPrimitivos(x)) pares.push([etiqueta(k), valor(k, x)]);
    else hijos.push([k, x]);
  }
  if (pares.length) bloques.push({ tipo: "kv", titulo, pares });
  for (const [k, x] of hijos) recorrer(x, titulo === RAIZ ? etiqueta(k) : `${titulo} › ${etiqueta(k)}`, bloques);
}

export function construirBloques(respuesta: unknown): Bloque[] {
  const bloques: Bloque[] = [];
  recorrer(respuesta, RAIZ, bloques);
  return bloques;
}

// ── PDF ───────────────────────────────────────────────────────────────────────
const GRAY: [number, number, number] = [107, 114, 128];
const DARK: [number, number, number] = [17, 24, 39];
const WHITE: [number, number, number] = [255, 255, 255];
const LINE: [number, number, number] = [200, 200, 200];

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

export async function generarReporteBuroPdf(c: ConsultaReporte, respuesta: unknown, empresaNombre?: string) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new JsPDF({ orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const moral = c.tipo_persona === "moral";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(`REPORTE DE CRÉDITO — CÍRCULO DE CRÉDITO (${moral ? "PERSONA MORAL" : "PERSONA FÍSICA"})`, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  if (empresaNombre) doc.text(empresaNombre, 14, 21);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, W - 14, 16, { align: "right" });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(14, 24, W - 14, 24);

  const cabecera: [string, string][] = [
    [moral ? "Razón social" : "Nombre", c.razon_social || "—"],
    ["RFC", c.rfc],
    ["Folio de consulta", c.folio_consulta || "—"],
    ["Fecha de consulta", fmtDateTime(c.created_at)],
    ["Fecha de autorización", c.autorizacion_fecha],
    ...(moral ? [] : [["FICO Score", c.score != null ? String(c.score) : "—"] as [string, string]]),
  ];
  const tabla = {
    styles: { fontSize: 7, cellPadding: 1.5, textColor: DARK, lineColor: LINE, lineWidth: 0.2, overflow: "linebreak" as const },
    headStyles: { fillColor: WHITE, fontStyle: "bold" as const, textColor: DARK, lineColor: [150, 150, 150] as [number, number, number], lineWidth: 0.3 },
    alternateRowStyles: { fillColor: WHITE },
    margin: { left: 14, right: 14 },
  };
  const kvBody = (pares: [string, string][]) => {
    const rows: string[][] = [];
    for (let i = 0; i < pares.length; i += 2) rows.push([...pares[i], ...(pares[i + 1] ?? ["", ""])]);
    return rows;
  };
  const kvCols = { 0: { textColor: GRAY, cellWidth: 45 }, 2: { textColor: GRAY, cellWidth: 45 } };

  autoTable(doc, { ...tabla, startY: 28, body: kvBody(cabecera), columnStyles: kvCols, theme: "plain" });
  let y = lastTableY(doc) + 6;

  for (const b of construirBloques(respuesta)) {
    if (y > H - 30) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(b.titulo, 14, y);
    if (b.tipo === "tabla") {
      autoTable(doc, { ...tabla, startY: y + 2, head: [b.columnas], body: b.filas });
    } else {
      autoTable(doc, { ...tabla, startY: y + 2, body: kvBody(b.pares), columnStyles: kvCols });
    }
    y = lastTableY(doc) + 6;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text("Información confidencial. Uso exclusivo para evaluación crediticia con autorización del titular.", 14, H - 8);
    doc.text(`Página ${i} de ${pages}`, W - 14, H - 8, { align: "right" });
  }

  doc.save(`buro_${c.rfc}_${format(new Date(c.created_at), "yyyyMMdd_HHmm")}.pdf`);
}
