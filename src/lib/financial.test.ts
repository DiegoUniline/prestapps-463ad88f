import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calcularCuotaFija,
  calcularAmortizacion,
  calcularMora,
  aplicarWaterfall,
  calcularDiasAtraso,
  redondearCuota,
  validarCuotaRedondeada,
  calcNextDate,
  generarFechasVencimiento,
  adjustForSkipDays,
  type AmortizacionRow,
} from "@/lib/financial";
import { parseLocalDate } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";

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

  it("rejects a rounded installment so high that the loan is paid before the last cuota", () => {
    expect(() => calcularAmortizacion(1000, 4, 0, "fijo", "2025-01-06", "semanal", 600)).toThrow(/demasiado alta para 4 cuotas/);
    // last cuota would be exactly 0
    expect(() => calcularAmortizacion(1000, 3, 0, "fijo", "2025-01-06", "semanal", 500)).toThrow(/demasiado alta/);
    // last cuota positive but the last capital would be negative (interest-only would not cover it)
    expect(() => calcularAmortizacion(100, 2, 100, "fijo", "2025-01-06", "semanal", 180)).toThrow(/demasiado alta/);
  });

  it("rejects a rounded installment below the calculated one (never negative capital)", () => {
    // calculated cuota 1100 / 3 = 366.67
    expect(() => calcularAmortizacion(1000, 3, 10, "fijo", "2025-01-06", "semanal", 366.66)).toThrow(/menor que la cuota calculada/);
    // below the per-cuota interest: would have produced negative capital
    expect(() => calcularAmortizacion(1000, 4, 40, "fijo", "2025-01-06", "semanal", 50)).toThrow(/menor que la cuota calculada/);
    expect(() => calcularAmortizacion(1000, 4, 40, "fijo", "2025-01-06", "semanal", -10)).toThrow(/mayor a 0/);
  });

  it("accepts the calculated cuota (rounded to cents) and the largest valid rounded cuota", () => {
    const a = calcularAmortizacion(1000, 3, 0, "fijo", "2025-01-06", "semanal", 333.33);
    expect(a.map((r) => r.capitalInteres)).toEqual([333.33, 333.33, 333.34]);
    const b = calcularAmortizacion(1000, 3, 0, "fijo", "2025-01-06", "semanal", 499.99);
    expect(b.map((r) => r.capital)).toEqual([499.99, 499.99, 0.02]);
    // last capital 0, last cuota = interest only (> 0)
    const c = calcularAmortizacion(100, 2, 100, "fijo", "2025-01-06", "semanal", 150);
    expect(c.map((r) => r.capital)).toEqual([100, 0]);
    expect(c.map((r) => r.capitalInteres)).toEqual([150, 50]);
  });

  it.each([
    [1000, 3, 10, 370],
    [1000, 3, 10, 366.67],
    [1234.56, 7, 17.5, 210],
    [50000, 52, 40, 1350],
    [100, 52, 5, 2.05],
    [999.99, 13, 33.3333, 105],
    [500, 1, 20, 600],
  ])("rounded schedule monto=%s cuotas=%s tasa=%s cuota=%s keeps totals and never goes negative", (monto, cuotas, tasa, cuota) => {
    expect(validarCuotaRedondeada(monto, cuotas, tasa, cuota)).toBeNull();
    const rows = calcularAmortizacion(monto, cuotas, tasa, "fijo", "2025-03-03", "diario", cuota);
    const interesTotal = new Decimal(monto).times(tasa).div(100).toDecimalPlaces(2).toNumber();
    expect(sum(rows, "capital")).toBe(monto);
    expect(sum(rows, "interes")).toBe(interesTotal);
    expect(rows[rows.length - 1].saldoCapital).toBe(0);
    rows.slice(0, -1).forEach((r) => expect(r.capitalInteres).toBe(cuota));
    expect(rows[rows.length - 1].capitalInteres).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.capital).toBeGreaterThanOrEqual(0);
      expect(r.interes).toBeGreaterThanOrEqual(0);
      expect(r.saldoCapital).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < rows.length; i++) expect(rows[i].saldoCapital).toBeLessThanOrEqual(rows[i - 1].saldoCapital);
  });

  it("never yields negative interest when per-cuota interest rounds up", () => {
    // 5 / 52 = 0.0961... -> 0.10; 51 * 0.10 would exceed the 5.00 total
    const rows = calcularAmortizacion(100, 52, 5, "fijo", "2025-01-06", "semanal");
    expect(sum(rows, "interes")).toBe(5);
    expect(sum(rows, "capital")).toBe(100);
    for (const r of rows) expect(r.interes).toBeGreaterThanOrEqual(0);
  });

  it("throws on invalid base parameters", () => {
    expect(() => calcularAmortizacion(0, 3, 10, "fijo", "2025-01-06", "semanal")).toThrow(/monto/);
    expect(() => calcularAmortizacion(NaN, 3, 10, "insolutos", "2025-01-06", "semanal")).toThrow(/monto/);
    expect(() => calcularAmortizacion(1000, 0, 10, "fijo", "2025-01-06", "semanal")).toThrow(/cuotas/);
    expect(() => calcularAmortizacion(1000, 2.5, 10, "insolutos", "2025-01-06", "semanal")).toThrow(/cuotas/);
    expect(() => calcularAmortizacion(1000, 3, NaN, "fijo", "2025-01-06", "semanal")).toThrow(/tasa/);
  });

  it("ignores an empty / zero rounded cuota", () => {
    const base = calcularAmortizacion(1000, 3, 10, "fijo", "2025-01-06", "semanal");
    expect(calcularAmortizacion(1000, 3, 10, "fijo", "2025-01-06", "semanal", 0)).toEqual(base);
    expect(validarCuotaRedondeada(1000, 3, 10, null)).toBeNull();
    expect(validarCuotaRedondeada(1000, 3, 10, undefined)).toBeNull();
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

  it("ignores the rounded cuota (not applicable)", () => {
    expect(calcularAmortizacion(1000, 4, 10, "insolutos", "2025-01-06", "semanal", 1)).toEqual(
      calcularAmortizacion(1000, 4, 10, "insolutos", "2025-01-06", "semanal")
    );
  });

  it("never produces negative capital on tiny amounts", () => {
    // 0.05 / 7 rounds up to 0.01; 6 * 0.01 would exceed the monto
    const rows = calcularAmortizacion(0.05, 7, 1, "insolutos", "2025-01-06", "semanal");
    expect(sum(rows, "capital")).toBe(0.05);
    for (const r of rows) expect(r.capital).toBeGreaterThanOrEqual(0);
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

  it("rejects zero, negative or non-finite payments", () => {
    for (const m of [0, -10, -0.01, NaN, Infinity, -Infinity]) {
      expect(() => aplicarWaterfall(m, 10, 20, 200)).toThrow(/mayor a 0/);
    }
    expect(() => aplicarWaterfall(10, NaN, 20, 200)).toThrow(/Saldo/);
  });

  it("never applies negative amounts when a balance is negative", () => {
    const r = aplicarWaterfall(50, -5, 10, -3);
    expect(r).toEqual({ aplicadoMora: 0, aplicadoInteres: 10, aplicadoCapital: 0, sobrante: 40 });
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

describe("redondearCuota / validarCuotaRedondeada", () => {
  it("keeps the exact total and moves the difference to the last installment", () => {
    expect(redondearCuota(1000, 3, 10, 370)).toEqual({ cuotaEstandar: 370, cuotaUltima: 360, totalReal: 1100 });
    expect(redondearCuota(1000, 3, 10, 366.67)).toEqual({ cuotaEstandar: 366.67, cuotaUltima: 366.66, totalReal: 1100 });
    expect(redondearCuota(1000, 3, 0, 333.33)).toEqual({ cuotaEstandar: 333.33, cuotaUltima: 333.34, totalReal: 1000 });
    expect(redondearCuota(999.99, 13, 33.3333, 105).totalReal).toBe(1333.32);
  });

  it("matches the last row of calcularAmortizacion", () => {
    const rows = calcularAmortizacion(1234.56, 7, 17.5, "fijo", "2025-01-06", "semanal", 210);
    const r = redondearCuota(1234.56, 7, 17.5, 210);
    expect(r.cuotaUltima).toBe(rows[6].capitalInteres);
    expect(r.totalReal).toBe(sum(rows, "capitalInteres"));
  });

  it("rejects a rounded cuota below the calculated one", () => {
    // calculated 600 / 5 = 120
    expect(() => redondearCuota(500, 5, 20, 100)).toThrow(/menor que la cuota calculada/);
    expect(validarCuotaRedondeada(500, 5, 20, 119.99)).toMatch(/al menos \$120\.00/);
    expect(validarCuotaRedondeada(500, 5, 20, 120)).toBeNull();
  });

  it("rejects a rounded cuota that would make the last one <= 0", () => {
    expect(() => redondearCuota(1000, 4, 0, 600)).toThrow(/demasiado alta para 4 cuotas/);
    expect(validarCuotaRedondeada(1000, 3, 0, 500)).toMatch(/demasiado alta para 3 cuotas/);
    expect(validarCuotaRedondeada(1000, 3, 0, 499.99)).toBeNull();
    // whole-peso ceiling can be too high for small loans with many cuotas: 100 / 60 = 1.67 -> 2
    expect(validarCuotaRedondeada(100, 60, 0, 2)).toMatch(/demasiado alta/);
  });

  it("rejects non-positive or non-numeric rounded cuotas", () => {
    expect(validarCuotaRedondeada(1000, 3, 10, -1)).toMatch(/mayor a 0/);
    expect(validarCuotaRedondeada(1000, 3, 10, NaN)).toMatch(/mayor a 0/);
    expect(() => redondearCuota(1000, 3, 10, 0)).toThrow(/mayor a 0/);
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

  it("daily schedule skipping Sundays shifts the rest of the schedule (distinct dates)", () => {
    const fechas = Array.from({ length: 14 }, (_, i) => fmt(calcNextDate(base, "diario", i, [0])));
    expect(new Set(fechas).size).toBe(fechas.length);
    expect(fechas).toEqual([
      "2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10", "2025-01-11",
      "2025-01-13", "2025-01-14", "2025-01-15", "2025-01-16", "2025-01-17", "2025-01-18",
      "2025-01-20", "2025-01-21",
    ]);
    expect(generarFechasVencimiento(base, "diario", 14, [0]).map(fmt)).toEqual(fechas);
  });

  it("daily schedule skipping weekends never lands on a weekend", () => {
    const fechas = generarFechasVencimiento(parseLocalDate("2025-01-10"), "diario", 10, [6, 0]);
    expect(fechas.map(fmt)).toEqual([
      "2025-01-10", "2025-01-13", "2025-01-14", "2025-01-15", "2025-01-16",
      "2025-01-17", "2025-01-20", "2025-01-21", "2025-01-22", "2025-01-23",
    ]);
  });

  it("a skipped first date moves the whole schedule (next cuota starts from the adjusted date)", () => {
    const sunday = parseLocalDate("2025-01-05");
    expect(generarFechasVencimiento(sunday, "semanal", 3, [0]).map(fmt)).toEqual(["2025-01-06", "2025-01-13", "2025-01-20"]);
    expect(generarFechasVencimiento(sunday, "quincenal", 3, [0]).map(fmt)).toEqual(["2025-01-06", "2025-01-21", "2025-02-05"]);
    // 2025-02-06 Thu, 2025-03-06 Thu
    expect(generarFechasVencimiento(sunday, "mensual", 3, [0]).map(fmt)).toEqual(["2025-01-06", "2025-02-06", "2025-03-06"]);
  });

  it.each([
    ["diario", 120],
    ["semanal", 60],
    ["quincenal", 40],
    ["mensual", 36],
  ] as const)("%s schedules with skip days are strictly increasing, distinct and avoid skipped days", (frecuencia, n) => {
    for (const skip of [[0], [6, 0], [0, 3], [1, 2, 3, 4, 5]]) {
      for (const start of ["2025-01-04", "2025-01-05", "2025-01-31", "2025-03-08", "2025-10-31"]) {
        const fechas = generarFechasVencimiento(parseLocalDate(start), frecuencia, n, skip);
        expect(fechas).toHaveLength(n);
        expect(new Set(fechas.map(fmt)).size).toBe(n);
        for (let i = 0; i < n; i++) {
          expect(skip).not.toContain(fechas[i].getDay());
          if (i > 0) expect(fechas[i].getTime()).toBeGreaterThan(fechas[i - 1].getTime());
          expect(fmt(calcNextDate(parseLocalDate(start), frecuencia, i, skip))).toBe(fmt(fechas[i]));
        }
        const rows = calcularAmortizacion(1000, n, 10, "fijo", start, frecuencia, undefined, skip);
        expect(rows.map((r) => r.fechaVencimiento)).toEqual(fechas.map(fmt));
      }
    }
  });

  it("keeps spacing between consecutive cuotas at least one period", () => {
    const fechas = generarFechasVencimiento(parseLocalDate("2025-01-04"), "semanal", 20, [0]);
    for (let i = 1; i < fechas.length; i++) {
      expect(differenceInCalendarDays(fechas[i], fechas[i - 1])).toBe(7);
    }
  });

  it("without skip days keeps dates anchored to the first payment date", () => {
    expect(generarFechasVencimiento(parseLocalDate("2025-01-31"), "mensual", 4).map(fmt)).toEqual([
      "2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30",
    ]);
  });
});
