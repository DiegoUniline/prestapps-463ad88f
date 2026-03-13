import Decimal from "decimal.js";
import { addDays, addWeeks, addMonths } from "date-fns";

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

type Frecuencia = "diario" | "semanal" | "quincenal" | "mensual";
type Modalidad = "fijo" | "insolutos";

/**
 * Calculate fixed installment amount
 */
export function calcularCuotaFija(monto: number, cuotas: number, tasaPorcentaje: number): number {
  const m = new Decimal(monto);
  const interes = m.times(tasaPorcentaje).div(100);
  const total = m.plus(interes);
  return total.div(cuotas).toDecimalPlaces(2).toNumber();
}

/**
 * Generate full amortization schedule
 */
export function calcularAmortizacion(
  monto: number, cuotas: number, tasa: number,
  modalidad: Modalidad, fechaPrimerPago: string, frecuencia: Frecuencia
): AmortizacionRow[] {
  const rows: AmortizacionRow[] = [];
  const base = new Date(fechaPrimerPago);

  if (modalidad === "fijo") {
    const m = new Decimal(monto);
    const interesTotal = m.times(tasa).div(100);
    const totalPagar = m.plus(interesTotal);
    const cuotaExacta = totalPagar.div(cuotas);
    const capitalPorCuota = m.div(cuotas);
    const interesPorCuota = interesTotal.div(cuotas);

    let saldo = m;
    for (let i = 1; i <= cuotas; i++) {
      const cap = i === cuotas ? saldo : capitalPorCuota.toDecimalPlaces(2);
      const int = i === cuotas
        ? interesTotal.minus(interesPorCuota.toDecimalPlaces(2).times(cuotas - 1))
        : interesPorCuota.toDecimalPlaces(2);

      saldo = saldo.minus(cap);

      rows.push({
        numCuota: i,
        fechaVencimiento: calcNextDate(base, frecuencia, i - 1).toISOString().slice(0, 10),
        capital: cap.toDecimalPlaces(2).toNumber(),
        interes: int.toDecimalPlaces(2).toNumber(),
        capitalInteres: cap.plus(int).toDecimalPlaces(2).toNumber(),
        saldoCapital: Decimal.max(0, saldo).toDecimalPlaces(2).toNumber(),
      });
    }
  } else {
    // Saldos insolutos
    const m = new Decimal(monto);
    const tasaDecimal = new Decimal(tasa).div(100);
    const capitalPorCuota = m.div(cuotas);
    let saldo = m;

    for (let i = 1; i <= cuotas; i++) {
      const int = saldo.times(tasaDecimal).toDecimalPlaces(2);
      const cap = i === cuotas ? saldo : capitalPorCuota.toDecimalPlaces(2);
      saldo = saldo.minus(cap);

      rows.push({
        numCuota: i,
        fechaVencimiento: calcNextDate(base, frecuencia, i - 1).toISOString().slice(0, 10),
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
    return new Decimal(saldoCapitalInteres).times(valorMora).div(100).toDecimalPlaces(2).toNumber();
  }
  return new Decimal(valorMora).toDecimalPlaces(2).toNumber();
}

/**
 * Apply payment waterfall: mora → interes → capital
 */
export function aplicarWaterfall(
  montoRecibido: number, saldoMora: number, saldoInteres: number, saldoCapital: number
): WaterfallResult {
  let restante = new Decimal(montoRecibido);

  const mora = Decimal.min(restante, new Decimal(saldoMora));
  restante = restante.minus(mora);

  const interes = Decimal.min(restante, new Decimal(saldoInteres));
  restante = restante.minus(interes);

  const capital = Decimal.min(restante, new Decimal(saldoCapital));
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
  const venc = new Date(fechaVencimiento);
  const actual = fechaActual ? new Date(fechaActual) : new Date();
  const diff = Math.floor((actual.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Round installments to a desired amount, adjusting last installment
 */
export function redondearCuota(cuotaCalculada: number, cuotaDeseada: number, numCuotas: number): RedondeoResult {
  const desiredDec = new Decimal(cuotaDeseada);
  const totalEstandar = desiredDec.times(numCuotas - 1);
  const totalOriginal = new Decimal(cuotaCalculada).times(numCuotas);
  const ultima = totalOriginal.minus(totalEstandar);

  return {
    cuotaEstandar: desiredDec.toDecimalPlaces(2).toNumber(),
    cuotaUltima: ultima.toDecimalPlaces(2).toNumber(),
    totalReal: totalOriginal.toDecimalPlaces(2).toNumber(),
  };
}

/**
 * Calculate next date based on frequency
 */
export function calcNextDate(base: Date, frecuencia: Frecuencia, n: number): Date {
  switch (frecuencia) {
    case "diario": return addDays(base, n);
    case "semanal": return addWeeks(base, n);
    case "quincenal": return addDays(base, n * 15);
    case "mensual": return addMonths(base, n);
    default: return addWeeks(base, n);
  }
}
