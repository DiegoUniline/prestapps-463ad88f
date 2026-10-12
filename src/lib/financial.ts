import Decimal from "decimal.js";
import { addDays, addWeeks, addMonths, differenceInCalendarDays, format } from "date-fns";
import { parseLocalDate, $$ } from "@/lib/utils";

// Configure Decimal for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface AmortizacionRow {
  numCuota: number;
  fechaVencimiento: string;
  capital: number;
  interes: number;
  capitalInteres: number;
  saldoCapital: number;
}

export interface WaterfallResult {
  aplicadoMora: number;
  aplicadoInteres: number;
  aplicadoCapital: number;
  sobrante: number;
}

export interface RedondeoResult {
  cuotaEstandar: number;
  cuotaUltima: number;
  totalReal: number;
}

export type Frecuencia = "diario" | "semanal" | "quincenal" | "mensual";
export type Modalidad = "fijo" | "insolutos";

/**
 * Calculate fixed installment amount
 */
export function calcularCuotaFija(monto: number, cuotas: number, tasaPorcentaje: number): number {
  const m = new Decimal(monto);
  const interes = m.times(tasaPorcentaje).div(100);
  const total = m.plus(interes);
  return total.div(cuotas).toDecimalPlaces(2).toNumber();
}

function validarParametros(monto: number, cuotas: number, tasa: number): string | null {
  if (!Number.isFinite(monto) || monto <= 0) return "El monto debe ser mayor a 0";
  if (!Number.isInteger(cuotas) || cuotas < 1) return "El número de cuotas debe ser un entero mayor a 0";
  if (!Number.isFinite(tasa)) return "La tasa de interés no es válida";
  return null;
}

interface CuotaFija {
  cap: Decimal;
  int: Decimal;
}

/**
 * Capital/interest split of the "fijo" modality. Interest is flat per cuota; with a rounded
 * cuota the capital of each cuota is cuota - interest and the last cuota absorbs the remainder.
 */
function cuotasFijo(monto: number, cuotas: number, tasa: number, cuotaRed: Decimal | null): CuotaFija[] {
  const m = new Decimal(monto);
  const interesTotal = m.times(tasa).div(100);
  const interesPorCuota = interesTotal.div(cuotas).toDecimalPlaces(2);
  const result: CuotaFija[] = [];
  let saldoCapital = m;
  let saldoInteres = interesTotal;

  for (let i = 1; i <= cuotas; i++) {
    const isLast = i === cuotas;
    const int = isLast ? saldoInteres : Decimal.min(interesPorCuota, Decimal.max(0, saldoInteres));
    let cap: Decimal;
    if (isLast) cap = saldoCapital;
    else if (cuotaRed) cap = cuotaRed.minus(int);
    else cap = saldoCapital.div(cuotas - i + 1).toDecimalPlaces(2);

    saldoCapital = saldoCapital.minus(cap);
    saldoInteres = saldoInteres.minus(int);
    result.push({ cap, int });
  }
  return result;
}

/**
 * Validate a rounded installment ("fijo" modality). Returns a user-facing error or null if valid.
 * Empty/0 means "no rounding" and is valid.
 */
export function validarCuotaRedondeada(
  monto: number, cuotas: number, tasa: number, cuotaRedondeada?: number | null
): string | null {
  const errorParams = validarParametros(monto, cuotas, tasa);
  if (errorParams) return errorParams;
  if (cuotaRedondeada === undefined || cuotaRedondeada === null || cuotaRedondeada === 0) return null;
  if (!Number.isFinite(cuotaRedondeada) || cuotaRedondeada < 0) return "La cuota redondeada debe ser mayor a 0";

  const cuota = new Decimal(cuotaRedondeada).toDecimalPlaces(2);
  const minima = new Decimal(calcularCuotaFija(monto, cuotas, tasa));
  if (cuota.lt(minima)) {
    return `La cuota redondeada (${$$(cuota.toNumber())}) es menor que la cuota calculada (${$$(minima.toNumber())}); no alcanzaría a cubrir el préstamo. Usa una cuota de al menos ${$$(minima.toNumber())}.`;
  }

  const ultima = cuotasFijo(monto, cuotas, tasa, cuota)[cuotas - 1];
  if (ultima.cap.isNegative() || ultima.cap.plus(ultima.int).toDecimalPlaces(2).lte(0)) {
    return `La cuota redondeada (${$$(cuota.toNumber())}) es demasiado alta para ${cuotas} cuotas: el préstamo quedaría pagado antes de la última cuota. Usa una cuota menor o menos cuotas.`;
  }
  return null;
}

/**
 * Generate full amortization schedule
 */
export function calcularAmortizacion(
  monto: number, cuotas: number, tasa: number,
  modalidad: Modalidad, fechaPrimerPago: string, frecuencia: Frecuencia,
  cuotaRedondeada?: number, skipDays?: number[]
): AmortizacionRow[] {
  const errorParams = validarParametros(monto, cuotas, tasa);
  if (errorParams) throw new Error(errorParams);

  const rows: AmortizacionRow[] = [];
  const fechas = generarFechasVencimiento(parseLocalDate(fechaPrimerPago), frecuencia, cuotas, skipDays);
  const fecha = (i: number) => format(fechas[i - 1], "yyyy-MM-dd");

  if (modalidad === "fijo") {
    const errorCuota = validarCuotaRedondeada(monto, cuotas, tasa, cuotaRedondeada);
    if (errorCuota) throw new Error(errorCuota);

    const usarRedondeo = cuotaRedondeada !== undefined && cuotaRedondeada !== 0;
    const cuotaRedDec = usarRedondeo ? new Decimal(cuotaRedondeada).toDecimalPlaces(2) : null;
    let saldoCapital = new Decimal(monto);

    cuotasFijo(monto, cuotas, tasa, cuotaRedDec).forEach(({ cap, int }, idx) => {
      saldoCapital = saldoCapital.minus(cap);
      rows.push({
        numCuota: idx + 1,
        fechaVencimiento: fecha(idx + 1),
        capital: cap.toDecimalPlaces(2).toNumber(),
        interes: int.toDecimalPlaces(2).toNumber(),
        capitalInteres: cap.plus(int).toDecimalPlaces(2).toNumber(),
        saldoCapital: Decimal.max(0, saldoCapital).toDecimalPlaces(2).toNumber(),
      });
    });
  } else {
    // Saldos insolutos
    const m = new Decimal(monto);
    const tasaDecimal = new Decimal(tasa).div(100);
    const capitalPorCuota = m.div(cuotas).toDecimalPlaces(2);
    let saldo = m;

    for (let i = 1; i <= cuotas; i++) {
      const int = saldo.times(tasaDecimal).toDecimalPlaces(2);
      const cap = i === cuotas ? saldo : Decimal.min(capitalPorCuota, saldo);
      saldo = saldo.minus(cap);

      rows.push({
        numCuota: i,
        fechaVencimiento: fecha(i),
        capital: cap.toDecimalPlaces(2).toNumber(),
        interes: int.toDecimalPlaces(2).toNumber(),
        capitalInteres: cap.plus(int).toDecimalPlaces(2).toNumber(),
        saldoCapital: Decimal.max(0, saldo).toDecimalPlaces(2).toNumber(),
      });
    }
  }

  return rows;
}

/**
 * Calculate late fee (mora) amount
 */
export function calcularMora(
  diasAtraso: number, saldoCapitalInteres: number,
  tipoMora: "porcentaje" | "fijo", valorMora: number
): number {
  if (diasAtraso <= 0 || valorMora <= 0) return 0;
  if (tipoMora === "porcentaje") {
    return new Decimal(saldoCapitalInteres).times(valorMora).div(100).times(diasAtraso).toDecimalPlaces(2).toNumber();
  }
  return new Decimal(valorMora).times(diasAtraso).toDecimalPlaces(2).toNumber();
}

/**
 * Apply payment waterfall: mora → interes → capital
 */
export function aplicarWaterfall(
  montoRecibido: number, saldoMora: number, saldoInteres: number, saldoCapital: number
): WaterfallResult {
  if (!Number.isFinite(montoRecibido) || montoRecibido <= 0) {
    throw new Error("El monto del pago debe ser mayor a 0");
  }
  if (![saldoMora, saldoInteres, saldoCapital].every(Number.isFinite)) {
    throw new Error("Saldo inválido para aplicar el pago");
  }
  const saldo = (n: number) => Decimal.max(0, new Decimal(n));
  let restante = new Decimal(montoRecibido);

  const mora = Decimal.min(restante, saldo(saldoMora));
  restante = restante.minus(mora);

  const interes = Decimal.min(restante, saldo(saldoInteres));
  restante = restante.minus(interes);

  const capital = Decimal.min(restante, saldo(saldoCapital));
  restante = restante.minus(capital);

  return {
    aplicadoMora: mora.toDecimalPlaces(2).toNumber(),
    aplicadoInteres: interes.toDecimalPlaces(2).toNumber(),
    aplicadoCapital: capital.toDecimalPlaces(2).toNumber(),
    sobrante: restante.toDecimalPlaces(2).toNumber(),
  };
}

/**
 * Calculate days overdue
 */
export function calcularDiasAtraso(fechaVencimiento: string, fechaActual?: string): number {
  const venc = parseLocalDate(fechaVencimiento);
  const actual = fechaActual ? parseLocalDate(fechaActual) : new Date();
  const diff = differenceInCalendarDays(actual, venc);
  return Math.max(0, diff);
}

/**
 * Round installments to a desired amount ("fijo" modality), adjusting the last installment.
 * Throws if the rounded cuota is invalid (see validarCuotaRedondeada).
 */
export function redondearCuota(monto: number, numCuotas: number, tasa: number, cuotaDeseada: number): RedondeoResult {
  const error = validarCuotaRedondeada(monto, numCuotas, tasa, cuotaDeseada);
  if (error) throw new Error(error);
  if (!cuotaDeseada) throw new Error("La cuota redondeada debe ser mayor a 0");

  const desiredDec = new Decimal(cuotaDeseada).toDecimalPlaces(2);
  const ultima = cuotasFijo(monto, numCuotas, tasa, desiredDec)[numCuotas - 1];
  const m = new Decimal(monto);
  const totalExacto = m.plus(m.times(tasa).div(100));

  return {
    cuotaEstandar: desiredDec.toNumber(),
    cuotaUltima: ultima.cap.plus(ultima.int).toDecimalPlaces(2).toNumber(),
    totalReal: totalExacto.toDecimalPlaces(2).toNumber(),
  };
}

/**
 * Adjust a date forward if it falls on a skipped weekday.
 * skipDays is an array of JS weekday numbers (0=Sun, 1=Mon, ..., 6=Sat).
 */
export function adjustForSkipDays(date: Date, skipDays: number[]): Date {
  if (!skipDays || skipDays.length === 0) return date;
  let d = new Date(date);
  let guard = 0;
  while (skipDays.includes(d.getDay()) && guard < 7) {
    d = addDays(d, 1);
    guard++;
  }
  return d;
}

function avanzarFecha(base: Date, frecuencia: Frecuencia, n: number): Date {
  switch (frecuencia) {
    case "diario": return addDays(base, n);
    case "semanal": return addWeeks(base, n);
    case "quincenal": return addDays(base, n * 15);
    case "mensual": return addMonths(base, n);
    default: return addWeeks(base, n);
  }
}

/**
 * Due dates for `count` installments. Without skip days each date is base + n periods.
 * With skip days dates are sequential: each one is the previous (already adjusted) date plus one
 * period, moved forward past skipped weekdays, so dates never repeat and spacing is preserved.
 */
export function generarFechasVencimiento(base: Date, frecuencia: Frecuencia, count: number, skipDays?: number[]): Date[] {
  const skip = skipDays || [];
  if (skip.length === 0) return Array.from({ length: count }, (_, i) => avanzarFecha(base, frecuencia, i));
  const fechas: Date[] = [];
  let d = adjustForSkipDays(base, skip);
  for (let i = 0; i < count; i++) {
    if (i > 0) d = adjustForSkipDays(avanzarFecha(d, frecuencia, 1), skip);
    fechas.push(d);
  }
  return fechas;
}

/**
 * Due date of installment index n (0-based); same schedule as generarFechasVencimiento.
 */
export function calcNextDate(base: Date, frecuencia: Frecuencia, n: number, skipDays?: number[]): Date {
  if (!skipDays || skipDays.length === 0) return avanzarFecha(base, frecuencia, n);
  return generarFechasVencimiento(base, frecuencia, n + 1, skipDays)[n];
}
