import { HandCoins, AlertTriangle, CalendarCheck, Activity, CreditCard, FileText } from "lucide-react";
import type { usePrestamoDetalle, useAmortizacion, usePagos, usePromesas } from "@/hooks/usePrestamoDetalle";
import type { generarReciboPagos } from "@/lib/pdfDocuments";

// ── Badge colors ──────────────────────────────────────────────────
export const estadoBadge: Record<string, string> = {
  Activo: "bg-badge-activo text-badge-activo-foreground",
  "Al día": "bg-badge-aldia text-badge-aldia-foreground",
  Vencido: "bg-badge-vencido text-badge-vencido-foreground",
  Liquidado: "bg-badge-liquidado text-badge-liquidado-foreground",
  Cancelado: "bg-badge-cancelado text-badge-cancelado-foreground",
  Juridico: "bg-badge-juridico text-badge-juridico-foreground",
  Reestructurado: "bg-amber-100 text-amber-800",
};

// ── Helpers ───────────────────────────────────────────────────────

export const dash = (n: number | null | undefined) => (n || 0) === 0 ? "—" : null;
export const dashStr = (s: string | null | undefined) => s || "—";

export const activityColors: Record<string, string> = {
  pago: "bg-[hsl(142,72%,37%)]",
  registro: "bg-[hsl(220,9%,70%)]",
  promesa: "bg-[hsl(38,92%,50%)]",
  promesa_incumplida: "bg-[hsl(0,72%,51%)]",
  estado: "bg-[hsl(220,9%,70%)]",
};

export const activityIcon: Record<string, typeof CreditCard> = {
  registro: FileText,
  pago: HandCoins,
  promesa: CalendarCheck,
  promesa_incumplida: AlertTriangle,
  estado: Activity,
};

// ── Default & optional columns ────────────────────────────────────
export const defaultCols = ["#", "Capital", "Interés", "Cuota", "F.Venc.", "Días", "Mora", "Pagado", "Saldo Total", "Saldo Atrasado", "Status", "F.Pagada"];
export const optionalCols = ["Cap.Pag.", "Int.Pag.", "Mora Pag.", "S.Cap", "S.Int", "S.Mora", "Desc.Mora", "Avisado"];

// Compute visual status: override "Pendiente" to "Vencida" when past due
const today = new Date().toISOString().slice(0, 10);
export function cuotaVisualStatus(c: { status: string | null; fecha_vencimiento: string; saldo_total: number | null }): string {
  const dbStatus = c.status || "Pendiente";
  if (dbStatus === "Pendiente" && c.fecha_vencimiento < today && Number(c.saldo_total || 0) > 0) {
    return "Vencida";
  }
  return dbStatus;
}

export type PrestamoDetalle = NonNullable<ReturnType<typeof usePrestamoDetalle>["data"]>;
export type CuotaAmort = NonNullable<ReturnType<typeof useAmortizacion>["data"]>[number];
export type PagoRow = NonNullable<ReturnType<typeof usePagos>["data"]>[number];
export type PromesaRow = NonNullable<ReturnType<typeof usePromesas>["data"]>[number];
export type AmortFilter = "todas" | "Pagada" | "Pendiente" | "Vencida";
export type DocType = "estado" | "contrato" | "pagos";
export type PdfPrestamo = Parameters<typeof generarReciboPagos>[0];
export type PdfPagos = Parameters<typeof generarReciboPagos>[1];
export interface Actividad {
  tipo: string;
  desc: string;
  usuario: string;
  fecha: string;
}
