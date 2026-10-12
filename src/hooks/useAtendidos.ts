import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabaseQuery";

/**
 * Computes the current week range [start, end] based on corte_dia_semana (0=Sun..6=Sat).
 * The week starts on the configured day and ends the day before the next cycle.
 */
function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCurrentWeekRange(corteDia: number): { start: string; end: string } {
  const today = new Date();
  const todayDay = today.getDay(); // 0=Sun
  let diff = todayDay - corteDia;
  if (diff < 0) diff += 7;
  const start = new Date(today);
  start.setDate(today.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: toLocalDate(start),
    end: toLocalDate(end),
  };
}

interface AtendidosResult {
  /** Set of prestamo IDs that were attended this week */
  prestamoIds: Set<string>;
  /** Set of cliente IDs that were attended this week */
  clienteIds: Set<string>;
  /** Color configured for the dot */
  color: string;
  isLoading: boolean;
}

/**
 * Atendidos de la semana (pagos no anulados + gestiones CRM), calculado en SQL (rpc atendidos_semana).
 * Con `scope` solo se consultan los ids dados (p. ej. la página visible); sin él, todos los de la semana.
 */
export function useAtendidos(
  empresaId?: string,
  scope?: { clienteIds?: string[]; prestamoIds?: string[] }
): AtendidosResult {
  const scoped = !!scope;
  const clienteIds = scope?.clienteIds ? [...scope.clienteIds].sort() : null;
  const prestamoIds = scope?.prestamoIds ? [...scope.prestamoIds].sort() : null;
  const { data, isLoading } = useQuery({
    queryKey: ["atendidos-semana", empresaId, scoped ? { clienteIds, prestamoIds } : "todos"],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!empresaId) return { prestamoIds: [], clienteIds: [], color: "#22c55e" };

      const { data: emp } = await supabase
        .from("empresas")
        .select("corte_dia_semana, corte_color_cobrado")
        .eq("id", empresaId)
        .single();

      const corteDia = emp?.corte_dia_semana ?? 1;
      const color = emp?.corte_color_cobrado ?? "#22c55e";
      const { start, end } = getCurrentWeekRange(corteDia);

      if (scoped && !clienteIds?.length && !prestamoIds?.length) {
        return { prestamoIds: [], clienteIds: [], color };
      }

      const { data: res, error } = await rpc<{ prestamo_ids: string[]; cliente_ids: string[] }>("atendidos_semana", {
        p_desde: start,
        p_hasta: end,
        p_cliente_ids: scoped ? clienteIds || [] : null,
        p_prestamo_ids: scoped ? prestamoIds || [] : null,
      });
      if (error) throw error;

      return {
        prestamoIds: res?.prestamo_ids || [],
        clienteIds: res?.cliente_ids || [],
        color,
      };
    },
    enabled: !!empresaId,
    staleTime: 1000 * 60 * 2,
  });

  const prestamoSet = useMemo(() => new Set(data?.prestamoIds || []), [data?.prestamoIds]);
  const clienteSet = useMemo(() => new Set(data?.clienteIds || []), [data?.clienteIds]);

  return {
    prestamoIds: prestamoSet,
    clienteIds: clienteSet,
    color: data?.color || "#22c55e",
    isLoading,
  };
}
