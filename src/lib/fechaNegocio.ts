import { parseLocalDate } from "@/lib/utils";

// Día de negocio = hora local de México. Debe coincidir con la zona usada en SQL
// (dashboard_kpis, pagos_listado, productividad_mora).
export const ZONA_NEGOCIO = "America/Mexico_City";

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const partesFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_NEGOCIO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partes(t: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of partesFmt.formatToParts(new Date(t))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha YYYY-MM-DD (hora de México) de un instante. Un "YYYY-MM-DD" se devuelve tal cual. */
export function fechaNegocio(v: Date | string | null | undefined = new Date()): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" && SOLO_FECHA.test(v)) return v;
  const t = (typeof v === "string" ? new Date(v) : v).getTime();
  if (Number.isNaN(t)) return "";
  const p = partes(t);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Hoy (YYYY-MM-DD) en hora de México. */
export const hoyNegocio = () => fechaNegocio(new Date());

/** Hoy en hora de México como Date local a medianoche (para calendarios/date-fns). */
export const hoyNegocioDate = () => parseLocalDate(hoyNegocio());

export function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function desfaseMs(t: number): number {
  const p = partes(t);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** Instante ISO (UTC) de las 00:00 hora de México del día dado. */
export function inicioDiaNegocio(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const pared = Date.UTC(y, m - 1, d);
  let t = pared - desfaseMs(pared);
  const ajuste = desfaseMs(t);
  if (pared - ajuste !== t) t = pared - ajuste;
  return new Date(t).toISOString();
}

/**
 * Rango [desde, hastaExcl) de instantes para filtrar columnas timestamptz por días de negocio,
 * con "hasta" inclusivo del día completo: usar .gte(col, desde).lt(col, hastaExcl).
 */
export function rangoNegocio(desdeYmd: string, hastaYmd: string) {
  return { desde: inicioDiaNegocio(desdeYmd), hastaExcl: inicioDiaNegocio(sumarDias(hastaYmd, 1)) };
}
