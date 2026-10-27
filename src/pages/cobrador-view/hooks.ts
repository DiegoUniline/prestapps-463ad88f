import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, rpc } from "@/lib/supabaseQuery";
import { format, startOfWeek, endOfWeek } from "date-fns";
import type { CuotaCobrador, PagoHistorial } from "./types";

// ── Hooks ───────────────────────────────────────────────────────
export function useCobranzaRango(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-cobranza", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      // Cuotas del rango, vencidas sin pagar y pagadas en el rango, con cliente/ruta y el monto
      // cobrado por cuota (incluye el reparto de pagos del rango): todo en el servidor.
      const { data, error } = await rpc<CuotaCobrador[]>("cobrador_cobranza", {
        p_desde: fechaDesde, p_hasta: fechaHasta, p_cobrador: cobradorId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePagosCobrador(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-pagos", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      let pagosQuery = supabase
        .from("pagos")
        .select(`
          id, prestamo_id, monto_recibido, aplicado_capital, aplicado_interes,
          aplicado_mora, metodo_pago, created_at, fecha_pago, anulado, cuota_id,
          prestamos!inner ( cliente_id, clientes ( nombre_completo ) ),
          amortizacion:cuota_id ( num_cuota )
        `)
        .eq("empresa_id", empresaId)
        .gte("fecha_pago", fechaDesde)
        .lte("fecha_pago", fechaHasta)
        .order("fecha_pago", { ascending: false })
        .order("created_at", { ascending: false });

      if (cobradorId) {
        pagosQuery = pagosQuery.eq("cobrador_id", cobradorId);
      }

      const data = await fetchAllRows(pagosQuery);

      return data.map((p): PagoHistorial => ({
        id: p.id,
        prestamoId: p.prestamo_id,
        clienteNombre: p.prestamos?.clientes?.nombre_completo || "—",
        montoRecibido: Number(p.monto_recibido || 0),
        aplicadoCapital: Number(p.aplicado_capital || 0),
        aplicadoInteres: Number(p.aplicado_interes || 0),
        aplicadoMora: Number(p.aplicado_mora || 0),
        metodoPago: p.metodo_pago || "Efectivo",
        fechaPago: p.fecha_pago || p.created_at || "",
        anulado: p.anulado || false,
        numCuota: p.amortizacion?.num_cuota || null,
      }));
    },
  });
}

// ── Get empresa week start day ──────────────────────────────────
export function useEmpresaSemana(empresaId: string) {
  return useQuery({
    queryKey: ["empresa-semana", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("empresas")
        .select("corte_dia_semana")
        .eq("id", empresaId)
        .single();
      return (data?.corte_dia_semana ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    },
    staleTime: 10 * 60 * 1000,
  });
}

function getWeekRange(weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  const start = startOfWeek(new Date(), { weekStartsOn });
  const end = endOfWeek(new Date(), { weekStartsOn });
  return { start, end };
}

// ── Weekly summary hook ─────────────────────────────────────────
export function useResumenSemanal(empresaId: string, cobradorId: string | null, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6, enabled = true) {
  const { start, end } = getWeekRange(weekStartsOn);
  const desde = format(start, "yyyy-MM-dd");
  const hasta = format(end, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["cobrador-resumen-semanal", desde, hasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      const { data, error } = await rpc<{ total: number; cobrado: number }>("cobrador_resumen_semanal", {
        p_desde: desde, p_hasta: hasta, p_cobrador: cobradorId,
      });
      if (error) throw error;
      const totalEsperado = Number(data?.total || 0);
      const pagadoTotal = Number(data?.cobrado || 0);
      const porCobrar = Math.max(0, totalEsperado - pagadoTotal);
      const pct = totalEsperado > 0 ? Math.min(100, (pagadoTotal / totalEsperado) * 100) : 0;
      return { porCobrar, cobrado: pagadoTotal, total: totalEsperado, pct, start, end };
    },
    staleTime: 30 * 1000,
  });
}

export function useCajasAll(empresaId: string) {
  return useQuery({
    queryKey: ["cajas-all", empresaId, "nombres"],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre").eq("empresa_id", empresaId).order("nombre");
      return data || [];
    },
  });
}

// Profile data for cobrador
export function usePerfilCobrador(cobradorId: string | null, empresaId: string, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-perfil", cobradorId, empresaId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      // Profile info
      const { data: profile } = await supabase
        .from("profiles")
        .select("nombre_completo, telefono, direccion, foto_url, porcentaje_comision, efectivo_en_mano, comision_tipo, comision_prestamos, comision_cobros_equipo, bono_meta_objetivo, bono_meta_monto")
        .eq("id", cobradorId!)
        .single();

      // Comisiones ganadas (cortes)
      const { data: cortes } = await supabase
        .from("cortes")
        .select("id, monto_comision, monto_efectivo, monto_depositado, total_cobrado, created_at")
        .eq("cobrador_id", cobradorId!)
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(50);

      const totalComisionesGanadas = (cortes || []).reduce((s, c) => s + Number(c.monto_comision || 0), 0);
      const totalCobrado = (cortes || []).reduce((s, c) => s + Number(c.total_cobrado || 0), 0);

      // Préstamos vigentes con cuotas pagadas, saldo y mora (agregados en el servidor)
      const { data: prestamos, error: carteraErr } = await rpc<{
        id: string; cliente: string; ruta: string; monto: number; montoPagar: number; cuotas: number;
        estado: string; frecuencia: string; pagadas: number; saldo: number; mora: number;
      }[]>("cobrador_cartera", { p_cobrador: cobradorId });
      if (carteraErr) throw carteraErr;

      return {
        profile,
        cortes: cortes || [],
        totalComisionesGanadas,
        totalCobrado,
        prestamos: prestamos ?? [],
      };
    },
  });
}

export function useProfileEmpresa(userId: string | undefined) {
  return useQuery({
    queryKey: ["current-profile-empresa", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", userId!)
        .single();
      return data?.empresa_id || "";
    },
    staleTime: 10 * 60 * 1000,
  });
}

export type ResumenSemanal = NonNullable<ReturnType<typeof useResumenSemanal>["data"]>;
export type PerfilCobrador = NonNullable<ReturnType<typeof usePerfilCobrador>["data"]>;
