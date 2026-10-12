import { describe, expect, it } from "vitest";
import { fechaNegocio, inicioDiaNegocio, rangoNegocio, sumarDias } from "./fechaNegocio";

describe("fechaNegocio", () => {
  it("convierte instantes a la fecha de México", () => {
    expect(fechaNegocio("2026-10-13T03:30:00Z")).toBe("2026-10-12");
    expect(fechaNegocio("2026-10-13T06:00:00Z")).toBe("2026-10-13");
    expect(fechaNegocio("2026-10-12T23:59:59.900+00:00")).toBe("2026-10-12");
    expect(fechaNegocio("2026-10-12")).toBe("2026-10-12");
    expect(fechaNegocio(null)).toBe("");
  });

  it("calcula el inicio del día en hora de México (con y sin horario de verano)", () => {
    expect(inicioDiaNegocio("2026-10-12")).toBe("2026-10-12T06:00:00.000Z");
    expect(inicioDiaNegocio("2021-07-01")).toBe("2021-07-01T05:00:00.000Z");
  });

  it("rango con hasta inclusivo del día completo", () => {
    expect(rangoNegocio("2026-10-01", "2026-10-31")).toEqual({
      desde: "2026-10-01T06:00:00.000Z",
      hastaExcl: "2026-11-01T06:00:00.000Z",
    });
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
