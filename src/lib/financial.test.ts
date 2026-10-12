import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calcularCuotaFija,
  calcularAmortizacion,
  calcularMora,
  aplicarWaterfall,
  calcularDiasAtraso,
  redondearCuota,
  calcNextDate,
  adjustForSkipDays,
  type AmortizacionRow,
} from "@/lib/financial";
import { parseLocalDate } from "@/lib/utils";

const sum = (rows: AmortizacionRow[], k: keyof AmortizacionRow) =>
  rows.reduce((s, r) => s.plus(r[k] as number), new Decimal(0)).toNumber();

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const hasMaxTwoDecimals = (n: number) => new Decimal(n).decimalPlaces() <= 2;

describe("calcularCuotaFija", () => {
  it("divides capital + flat interest evenly", () => {
    expect(calcularCuotaFija(1000, 10, 20)).toBe(120);
    expect(calcularCuotaFija(5000, 4, 0)).toBe(1250);
  });

  it("rounds half up to 2 decimals", () => {
    expect(calcularCuotaFija(1000, 3, 0)).toBe(333.33);
    expect(calcularCuotaFija(1000, 6, 0)).toBe(166.67);
    // 100.05 / 2 = 50.025 -> 50.03 (ROUND_HALF_UP, no float drift)
    expect(calcularCuotaFija(100.05, 2, 0)).toBe(50.03);
  });
});

describe("calcularAmortizacion — fijo", () => {
  it("builds an even schedule when everything divides exactly", () => {
    const rows = calcularAmortizacion(1000, 10, 20, "fijo", "2025-01-06", "semanal");
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      expect(r.capital).toBe(100);
      expect(r.interes).toBe(20);
      expect(r.capitalInteres).toBe(120);
    }
    expect(rows[0].saldoCapital).toBe(900);
    expect(rows[9].saldoCapital).toBe(0);
    expect(rows.map((r) => r.numCuota)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("adjusts the last installment so capital sums to monto and interest to the total", () => {
    const rows = calcularAmortizacion(1000, 3, 10, "fijo", "2025-01-06", "semanal");
    expect(rows.map((r) => r.capital)).toEqual([333.33, 333.34, 333.33]);
    expect(rows.map((r) => r.interes)).toEqual([33.33, 33.33, 33.34]);
    expect(sum(rows, "capital")).toBe(1000);
    expect(sum(rows, "interes")).toBe(100);
    expect(sum(rows, "capitalInteres")).toBe(1100);
    expect(rows[2].saldoCapital).toBe(0);
  });

  it.each([
    [1234.56, 7, 17.5],
    [999.99, 13, 33.3333],
    [50000, 52, 40],
    [777, 30, 0],
    [1, 3, 10],
  ])("sums exactly for monto=%s cuotas=%s tasa=%s", (monto, cuotas, tasa) => {
    const rows = calcularAmortizacion(monto, cuotas, tasa, "fijo", "2025-03-03", "diario");
    const interesTotal = new Decimal(monto).times(tasa).div(100).toDecimalPlaces(2).toNumber();
    expect(sum(rows, "capital")).toBe(monto);
    expect(sum(rows, "interes")).toBe(interesTotal);
    expect(sum(rows, "capitalInteres")).toBe(new Decimal(monto).plus(interesTotal).toNumber());
    expect(rows[rows.length - 1].saldoCapital).toBe(0);
    for (const r of rows) {
      expect(hasMaxTwoDecimals(r.capital)).toBe(true);
      expect(hasMaxTwoDecimals(r.interes)).toBe(true);
      expect(hasMaxTwoDecimals(r.capitalInteres)).toBe(true);
      expect(r.capital).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the rounded installment and puts the remainder in the last one", () => {
    // standard cuota would be 1100 / 3 = 366.67; rounded to 370
    const rows = calcularAmortizacion(1000, 3, 10, "fijo", "2025-01-06", "semanal", 370);
    expect(rows[0].capitalInteres).toBe(370);
    expect(rows[1].capitalInteres).toBe(370);
    expect(rows[0].interes).toBe(33.33);
    expect(rows[0].capital).toBe(336.67);
    expect(rows[2].capitalInteres).toBe(360);
    expect(sum(rows, "capital")).toBe(1000);
    expect(sum(rows, "capitalInteres")).toBe(1100);
    expect(rows[2].saldoCapital).toBe(0);
  });

  it("caps capital at the remaining balance when the rounded installment is large", () => {
    const rows = calcularAmortizacion(1000, 4, 0, "fijo", "2025-01-06", "semanal", 600);
    expect(rows.map((r) => r.capital)).toEqual([600, 400, 0, 0]);
    expect(sum(rows, "capital")).toBe(1000);
    expect(rows.map((r) => r.saldoCapital)).toEqual([400, 0, 0, 0]);
  });

  it("generates due dates by frequency starting at fechaPrimerPago", () => {
    const rows = calcularAmortizacion(300, 3, 0, "fijo", "2025-01-31", "mensual");
    expect(rows.map((r) => r.fechaVencimiento)).toEqual(["2025-01-31", "2025-02-28", "2025-03-31"]);
  });
});

describe("calcularAmortizacion — insolutos", () => {
  it("charges interest on the outstanding balance", () => {
    const rows = calcularAmortizacion(1000, 4, 10, "insolutos", "2025-01-06", "semanal");
    expect(rows.map((r) => r.capital)).toEqual([250, 250, 250, 250]);
    expect(rows.map((r) => r.interes)).toEqual([100, 75, 50, 25]);
    expect(rows.map((r) => r.capitalInteres)).toEqual([350, 325, 300, 275]);
    expect(rows.map((r) => r.saldoCapital)).toEqual([750, 500, 250, 0]);
  });

  it("adjusts the last installment so capital sums to monto", () => {
    const rows = calcularAmortizacion(1000, 3, 5, "insolutos", "2025-01-06", "semanal");
    expect(rows.map((r) => r.capital)).toEqual([333.33, 333.33, 333.34]);
    expect(rows.map((r) => r.interes)).toEqual([50, 33.33, 16.67]);
    expect(sum(rows, "capital")).toBe(1000);
    expect(rows[2].saldoCapital).toBe(0);
  });

  it.each([
    [1234.56, 7, 3.5],
    [999.99, 13, 2],
    [100, 6, 0],
  ])("capital sums exactly for monto=%s cuotas=%s tasa=%s", (monto, cuotas, tasa) => {
    const rows = calcularAmortizacion(monto, cuotas, tasa, "insolutos", "2025-03-03", "quincenal");
    expect(sum(rows, "capital")).toBe(monto);
    expect(rows[rows.length - 1].saldoCapital).toBe(0);
    for (const r of rows) {
      expect(hasMaxTwoDecimals(r.capital)).toBe(true);
      expect(hasMaxTwoDecimals(r.interes)).toBe(true);
      expect(r.capitalInteres).toBe(new Decimal(r.capital).plus(r.interes).toNumber());
    }
  });
});

describe("calcularMora", () => {
  it("returns 0 when not overdue or no mora configured", () => {
    expect(calcularMora(0, 1000, "porcentaje", 1)).toBe(0);
    expect(calcularMora(-3, 1000, "fijo", 10)).toBe(0);
    expect(calcularMora(5, 1000, "porcentaje", 0)).toBe(0);
  });

  it("computes percentage mora per day on the balance", () => {
    expect(calcularMora(3, 1000, "porcentaje", 1)).toBe(30);
    expect(calcularMora(1, 333.33, "porcentaje", 1.5)).toBe(5);
    expect(calcularMora(7, 123.45, "porcentaje", 2)).toBe(17.28);
  });

  it("computes fixed mora per day", () => {
    expect(calcularMora(4, 1000, "fijo", 25)).toBe(100);
    expect(calcularMora(3, 0, "fijo", 0.1)).toBe(0.3);
  });
});

describe("aplicarWaterfall", () => {
  it("applies mora, then interest, then capital", () => {
    expect(aplicarWaterfall(100, 10, 20, 200)).toEqual({
      aplicadoMora: 10,
      aplicadoInteres: 20,
      aplicadoCapital: 70,
      sobrante: 0,
    });
  });

  it("stops at mora when the payment is small", () => {
    expect(aplicarWaterfall(5, 10, 20, 200)).toEqual({
      aplicadoMora: 5,
      aplicadoInteres: 0,
      aplicadoCapital: 0,
      sobrante: 0,
    });
  });

  it("returns the excess as sobrante", () => {
    expect(aplicarWaterfall(300, 10, 20, 200)).toEqual({
      aplicadoMora: 10,
      aplicadoInteres: 20,
      aplicadoCapital: 200,
      sobrante: 70,
    });
  });

  it("has no float drift", () => {
    const r = aplicarWaterfall(0.3, 0.1, 0.1, 0.1);
    expect(r).toEqual({ aplicadoMora: 0.1, aplicadoInteres: 0.1, aplicadoCapital: 0.1, sobrante: 0 });
    const parts = aplicarWaterfall(1234.57, 12.34, 56.78, 999.99);
    expect(
      new Decimal(parts.aplicadoMora).plus(parts.aplicadoInteres).plus(parts.aplicadoCapital).plus(parts.sobrante).toNumber()
    ).toBe(1234.57);
  });
});

describe("calcularDiasAtraso", () => {
  it("counts whole days past due", () => {
    expect(calcularDiasAtraso("2025-01-01", "2025-01-11")).toBe(10);
    expect(calcularDiasAtraso("2024-02-28", "2024-03-01")).toBe(2);
  });

  it("never returns negative values", () => {
    expect(calcularDiasAtraso("2025-01-10", "2025-01-10")).toBe(0);
    expect(calcularDiasAtraso("2025-01-10", "2025-01-01")).toBe(0);
  });

  it("is not off by one across a DST change", () => {
    // US DST starts 2025-03-09; in such time zones a 23h day must still count as a full day
    expect(calcularDiasAtraso("2025-03-08", "2025-03-10")).toBe(2);
    expect(calcularDiasAtraso("2025-11-01", "2025-11-03")).toBe(2);
  });
});

describe("redondearCuota", () => {
  it("keeps the total and moves the difference to the last installment", () => {
    expect(redondearCuota(366.67, 370, 3)).toEqual({ cuotaEstandar: 370, cuotaUltima: 360.01, totalReal: 1100.01 });
    expect(redondearCuota(120, 100, 5)).toEqual({ cuotaEstandar: 100, cuotaUltima: 200, totalReal: 600 });
  });
});

describe("calcNextDate / adjustForSkipDays", () => {
  const base = parseLocalDate("2025-01-06"); // Monday

  it("advances by frequency", () => {
    expect(fmt(calcNextDate(base, "diario", 3))).toBe("2025-01-09");
    expect(fmt(calcNextDate(base, "semanal", 2))).toBe("2025-01-20");
    expect(fmt(calcNextDate(base, "quincenal", 2))).toBe("2025-02-05");
    expect(fmt(calcNextDate(base, "mensual", 1))).toBe("2025-02-06");
    expect(fmt(calcNextDate(parseLocalDate("2025-01-31"), "mensual", 1))).toBe("2025-02-28");
    expect(fmt(calcNextDate(base, "diario", 0))).toBe("2025-01-06");
  });

  it("moves a date that lands on a skipped weekday to the next allowed day", () => {
    // n=6 from Monday is Sunday 2025-01-12
    expect(fmt(calcNextDate(base, "diario", 6))).toBe("2025-01-12");
    expect(fmt(calcNextDate(base, "diario", 6, [0]))).toBe("2025-01-13");
    // Saturday + Sunday skipped: Sat 2025-01-11 -> Mon 2025-01-13
    expect(fmt(calcNextDate(base, "diario", 5, [6, 0]))).toBe("2025-01-13");
    // weekly on a non-skipped day is unchanged
    expect(fmt(calcNextDate(base, "semanal", 1, [0]))).toBe("2025-01-13");
  });

  it("does not loop forever when every weekday is skipped", () => {
    const d = adjustForSkipDays(base, [0, 1, 2, 3, 4, 5, 6]);
    expect(d).toBeInstanceOf(Date);
  });

  it("returns the same date when skipDays is empty", () => {
    expect(adjustForSkipDays(base, [])).toBe(base);
  });

  it("applies skip days in the amortization schedule", () => {
    const rows = calcularAmortizacion(700, 7, 0, "fijo", "2025-01-06", "diario", undefined, [0]);
    expect(rows[5].fechaVencimiento).toBe("2025-01-11");
    expect(rows[6].fechaVencimiento).toBe("2025-01-13");
  });

  // Known issue (reported, not changed): with daily frequency the skipped day is pushed onto the
  // next installment's date instead of shifting the rest of the schedule, so two cuotas share a date.
  it.fails("daily schedule skipping Sundays has distinct due dates", () => {
    const fechas = Array.from({ length: 14 }, (_, i) => fmt(calcNextDate(base, "diario", i, [0])));
    expect(new Set(fechas).size).toBe(fechas.length);
  });
});
