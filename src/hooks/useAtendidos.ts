import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";

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

export function useAtendidos(empresaId?: string): AtendidosResult {
  const { data, isLoading } = useQuery({
    queryKey: ["atendidos-semana", empresaId],
    queryFn: async () => {
      if (!empresaId) return { prestamoIds: [], clienteIds: [], color: "#22c55e" };

      // 1. Get empresa config
      const { data: emp } = await supabase
        .from("empresas")
        .select("corte_dia_semana, corte_color_cobrado")
        .eq("id", empresaId)
        .single();

      const corteDia = emp?.corte_dia_semana ?? 1;
      const color = emp?.corte_color_cobrado ?? "#22c55e";
      const { start, end } = getCurrentWeekRange(corteDia);

      // 2. Fetch pagos and gestiones in parallel within week range
      const [pagosData, gestionesData] = await Promise.all([
        fetchAllRows(supabase
          .from("pagos")
          .select("prestamo_id")
          .eq("empresa_id", empresaId)
          .eq("anulado", false)
          .gte("fecha_pago", start)
          .lte("fecha_pago", end)),
        fetchAllRows(supabase
          .from("crm_gestiones")
          .select("prestamo_id, cliente_id")
          .eq("empresa_id", empresaId)
          .gte("created_at", `${start}T00:00:00`)
          .lte("created_at", `${end}T23:59:59`)),
      ]);

      const prestamoIdSet = new Set<string>();
      const clienteIdSet = new Set<string>();

      for (const p of pagosData) {
        prestamoIdSet.add(p.prestamo_id);
      }
      for (const g of gestionesData) {
        prestamoIdSet.add(g.prestamo_id);
        if (g.cliente_id) clienteIdSet.add(g.cliente_id);
      }

      // 3. Resolve cliente IDs from pagos via prestamos
      if (prestamoIdSet.size > 0) {
        const { data: pres } = await supabase
          .from("prestamos")
          .select("id, cliente_id")
          .in("id", [...prestamoIdSet]);
        for (const pr of pres || []) {
          clienteIdSet.add(pr.cliente_id);
        }
      }

      return {
        prestamoIds: [...prestamoIdSet],
        clienteIds: [...clienteIdSet],
        color,
      };
    },
    enabled: !!empresaId,
    staleTime: 1000 * 60 * 2,
  });

  return {
    prestamoIds: new Set(data?.prestamoIds || []),
    clienteIds: new Set(data?.clienteIds || []),
    color: data?.color || "#22c55e",
    isLoading,
  };
}
