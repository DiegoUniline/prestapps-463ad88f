import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Calcula el saldo real de una o varias cajas desde las tablas fuente,
 * sin depender de cajas.saldo_actual ni del kardex completo.
 *
 * Fórmula:
 *   + Pagos no anulados (entradas por cobros)
 *   - Préstamos no cancelados (salidas por desembolsos)
 *   + Movimientos manuales entrada (depósitos, transferencias recibidas)
 *   - Movimientos manuales salida (retiros, transferencias realizadas, gastos)
 *
 * "Manual" = movimientos_caja donde prestamo_id IS NULL
 */
export function useCajaSaldoReal(cajaIds: string[]) {
  return useQuery({
    queryKey: ["caja-saldo-real", ...cajaIds.sort()],
    enabled: cajaIds.length > 0,
    refetchOnMount: "always" as const,
    queryFn: async () => {
      const result: Record<string, number> = {};
      for (const id of cajaIds) result[id] = 0;

      // 1. Pagos no anulados por caja
      const { data: pagos } = await supabase
        .from("pagos")
        .select("caja_id, monto_recibido")
        .in("caja_id", cajaIds)
        .eq("anulado", false);

      for (const p of pagos || []) {
        if (p.caja_id) result[p.caja_id] = (result[p.caja_id] || 0) + Number(p.monto_recibido || 0);
      }

      // 2. Préstamos no cancelados (desembolsos = salida)
      const { data: prestamos } = await supabase
        .from("prestamos")
        .select("caja_id, monto_solicitado, estado")
        .in("caja_id", cajaIds)
        .not("estado", "eq", "Cancelado");

      for (const pr of prestamos || []) {
        if (pr.caja_id) result[pr.caja_id] = (result[pr.caja_id] || 0) - Number(pr.monto_solicitado || 0);
      }

      // 3. Movimientos manuales (prestamo_id IS NULL) = depósitos, retiros, transferencias, gastos
      const { data: manuales } = await supabase
        .from("movimientos_caja")
        .select("caja_id, tipo, monto")
        .in("caja_id", cajaIds)
        .is("prestamo_id", null);

      for (const m of manuales || []) {
        const sign = m.tipo === "entrada" ? 1 : -1;
        result[m.caja_id] = (result[m.caja_id] || 0) + sign * Number(m.monto || 0);
      }

      return result;
    },
  });
}

/** Convenience for a single caja */
export function useSingleCajaSaldoReal(cajaId: string) {
  const { data, ...rest } = useCajaSaldoReal(cajaId ? [cajaId] : []);
  return { saldo: data?.[cajaId] ?? null, ...rest };
}
