import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";

/**
 * Calcula el saldo real de una o varias cajas desde las tablas fuente (rpc caja_saldos, SUM en SQL),
 * sin depender de cajas.saldo_actual ni del kardex completo.
 *
 * Fórmula:
 *   + Pagos no anulados (entradas por cobros, pagos.caja_id)
 *   - Préstamos no cancelados (salidas por desembolsos)
 *   ± Movimientos manuales (movimientos_caja con prestamo_id IS NULL): depósitos, retiros,
 *     transferencias, gastos, comisiones…
 *     EXCEPTO las entradas de corte/liquidación de cobrador ("Corte cobrador: …", "Liquidación ruta …"):
 *     ese efectivo ya está contado en los pagos de la caja; sumarlo otra vez lo duplicaba.
 */
export function useCajaSaldoReal(cajaIds: string[]) {
  const ids = [...cajaIds].sort();
  return useQuery({
    queryKey: ["caja-saldo-real", ...ids],
    enabled: ids.length > 0,
    refetchOnMount: "always" as const,
    queryFn: async () => {
      const result: Record<string, number> = {};
      for (const id of ids) result[id] = 0;

      const { data, error } = await rpc<{ caja_id: string; saldo: number | string | null }[]>("caja_saldos", { p_caja_ids: ids });
      if (error) throw error;
      for (const row of data || []) result[row.caja_id] = Number(row.saldo || 0);

      return result;
    },
  });
}

/** Convenience for a single caja */
export function useSingleCajaSaldoReal(cajaId: string) {
  const { data, ...rest } = useCajaSaldoReal(cajaId ? [cajaId] : []);
  return { saldo: data?.[cajaId] ?? null, ...rest };
}
