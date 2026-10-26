import { describe, it, expect } from "vitest";
import { construirBloques, etiqueta, valor } from "@/lib/buroReporte";

const pm = {
  folioConsulta: 1170856439,
  folioOtorgante: "b665c3a5b343434f9d67c1",
  persona: { RFC: "VJS231120T20", nombre: "VIVERO LA JIRAFA SPR DE RL", domicilio: { ciudad: "HERMOSILLO", CP: "83000" } },
  credito: {
    cuentasFinancieras: [
      { otorgante: "BANCO", saldoTotal: 150000, vigente: 150000, "29dias": 0, atrasoMayor: 0 },
      { otorgante: "BANCO 2", saldoTotal: 140088, vigente: 140088, "29dias": 0, atrasoMayor: 0 },
    ],
    cuentasComerciales: [],
  },
  calificacionCartera: [{ calificacion: "A1" }],
  accionistas: [{ nombre: "JOSE ARTURO SOTO CAMARGO", porcentaje: 50 }, { nombre: "JORGE ANTONIO SOTO RODRIGUEZ", porcentaje: 50 }],
  errores: null,
};

describe("buroReporte", () => {
  it("etiquetas legibles", () => {
    expect(etiqueta("cuentasFinancieras")).toBe("Cuentas financieras");
    expect(etiqueta("saldoVencidoPeorAtraso")).toBe("Saldo vencido peor atraso");
    expect(etiqueta("180MasDias")).toBe("180+ días");
  });

  it("formatea dinero solo en campos de importe", () => {
    expect(valor("saldoTotal", 150000)).toContain("150,000");
    expect(valor("saldoTotal", 150000)).toContain("$");
    expect(valor("porcentaje", 50)).toBe("50");
    expect(valor("numeroPagosVencidos", 3)).toBe("3");
    expect(valor("x", null)).toBe("—");
  });

  it("arma bloques de la respuesta PM", () => {
    const b = construirBloques(pm);
    const titulos = b.map((x) => x.titulo);
    expect(titulos).toEqual([
      "Datos de la consulta",
      "Datos generales",
      "Datos generales › Domicilio",
      "Créditos › Cuentas financieras",
      "Calificación de cartera",
      "Accionistas",
    ]);
    const dom = b[2];
    expect(dom.tipo === "kv" && dom.pares).toContainEqual(["C.P.", "83000"]);
    const cuentas = b[3];
    expect(cuentas.tipo).toBe("tabla");
    if (cuentas.tipo === "tabla") {
      expect(cuentas.columnas).toContain("1–29 días");
      expect(cuentas.filas).toHaveLength(2);
    }
  });

  it("listas con muchas columnas se muestran como fichas", () => {
    const fila = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`campo${i}`, i]));
    const b = construirBloques({ creditos: [fila, fila] });
    expect(b.map((x) => x.titulo)).toEqual(["Créditos 1 de 2", "Créditos 2 de 2"]);
    expect(b.every((x) => x.tipo === "kv")).toBe(true);
  });
});
