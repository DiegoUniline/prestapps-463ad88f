import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, mapChunks } from "@/lib/supabaseQuery";
import { format, startOfWeek, endOfWeek } from "date-fns";
import type { QueryData } from "@supabase/supabase-js";
import type { CuotaCobrador, PagoHistorial } from "./types";

// ── Hooks ───────────────────────────────────────────────────────
export function useCobranzaRango(fechaDesde: string, fechaHasta: string, empresaId: string, cobradorId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["cobrador-cobranza", fechaDesde, fechaHasta, empresaId, cobradorId],
    enabled: enabled && !!empresaId,
    queryFn: async () => {
      // Cuotas con su préstamo (cliente/ruta) y sus pagos embebidos; el filtro por cobrador
      // se aplica en el servidor sobre el préstamo (prestamos!inner), sin listas .in() gigantes.
      const amortizacionSelect = `
        id, prestamo_id, num_cuota, capital_interes, saldo_total, saldo_mora,
        saldo_capital, saldo_interes, mora_pagada, interes_pagado, capital_pagado,
        fecha_vencimiento, status, dias_atraso, fecha_pagada,
        prestamos!amortizacion_prestamo_id_fkey!inner (
          id, num_cuotas, cliente_id, ruta_id, cobrador_id, caja_id, empresa_id,
          clientes ( nombre_completo, telefono, direccion, gps_lat, gps_lng ),
          rutas ( nombre )
        ),
        pagos!pagos_cuota_id_fkey ( monto_recibido, anulado )
      `;
      const rangoFilter =
        `and(fecha_vencimiento.gte.${fechaDesde},fecha_vencimiento.lte.${fechaHasta}),` +
        `and(fecha_vencimiento.lt.${fechaDesde},status.neq.Pagada),` +
        `and(fecha_pagada.gte.${fechaDesde},fecha_pagada.lte.${fechaHasta})`;
      type CuotaRow = QueryData<ReturnType<typeof cuotasQuery>>[number];
      const presMap: Record<string, CuotaRow["prestamos"]> = {};
      const pagosByPrestamo: Record<string, number> = {};

      const cuotasQuery = () => {
        let q = supabase.from("amortizacion").select(amortizacionSelect);
        if (cobradorId) {
          q = q.eq("prestamos.empresa_id", empresaId).eq("prestamos.cobrador_id", cobradorId);
        } else {
          q = q.eq("empresa_id", empresaId);
        }
        return q;
      };

      // Pagos del rango (por préstamo) para repartir montos en cuotas sin pago directo
      let pagosRangoQuery = supabase.from("pagos")
        .select("id, prestamo_id, monto_recibido, prestamos!pagos_prestamo_id_fkey!inner ( cobrador_id, empresa_id )")
        .eq("empresa_id", empresaId)
        .eq("anulado", false)
        .gte("fecha_pago", fechaDesde)
        .lte("fecha_pago", fechaHasta);
      if (cobradorId) {
        pagosRangoQuery = pagosRangoQuery
          .eq("cobrador_id", cobradorId)
          .eq("prestamos.cobrador_id", cobradorId)
          .eq("prestamos.empresa_id", empresaId);
      }

      const [cuotasRango, pagosRango] = await Promise.all([
        fetchAllRows(cuotasQuery().or(rangoFilter).order("fecha_vencimiento", { ascending: true })),
        fetchAllRows(pagosRangoQuery),
      ]);
      let cuotas: CuotaRow[] = cuotasRango;
      for (const c of cuotas) presMap[c.prestamo_id] = c.prestamos;
      for (const p of pagosRango) {
        if (!p.prestamo_id) continue;
        pagosByPrestamo[p.prestamo_id] = (pagosByPrestamo[p.prestamo_id] || 0) + Number(p.monto_recibido || 0);
      }
      if (!cobradorId && cuotas.length === 0) return [];

      if (cobradorId) {
        const prestamosConPago = Object.keys(pagosByPrestamo);
        if (prestamosConPago.length > 0) {
          const cuotasTocadas = await mapChunks(prestamosConPago, 150, (chunk) =>
            fetchAllRows(cuotasQuery()
              .in("prestamo_id", chunk)
              .or("status.eq.Pagada,status.eq.Parcial,capital_pagado.gt.0,interes_pagado.gt.0,mora_pagada.gt.0")
              .order("fecha_vencimiento", { ascending: true }))
          );

          const cuotasById = new Map(cuotas.map((c) => [c.id, c]));
          for (const c of cuotasTocadas) {
            cuotasById.set(c.id, c);
            presMap[c.prestamo_id] = c.prestamos;
          }
          cuotas = Array.from(cuotasById.values()).sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)));
        }
      }

      if (!cuotas.length) return [];

      // Payments for these cuotas (embebidos, no anulados)
      const pagosByCuota: Record<string, number> = {};
      for (const c of cuotas) {
        for (const p of (c.pagos || []) as { monto_recibido: number; anulado: boolean }[]) {
          if (p.anulado) continue;
          pagosByCuota[c.id] = (pagosByCuota[c.id] || 0) + Number(p.monto_recibido);
        }
      }

      const pagoRestanteByPrestamo = { ...pagosByPrestamo };

      return cuotas
        .filter((c) => presMap[c.prestamo_id]) // only cuotas belonging to this cobrador's prestamos
        .map((c): CuotaCobrador => {
          const pres = presMap[c.prestamo_id];
          const cliente = pres.clientes;
          const ruta = pres.rutas;
          const pagadoHistorico = Number(c.capital_pagado || 0) + Number(c.interes_pagado || 0) + Number(c.mora_pagada || 0);
          const fechaPagadaEnRango = c.fecha_pagada && c.fecha_pagada >= fechaDesde && c.fecha_pagada <= fechaHasta;
          let montoPagado = pagosByCuota[c.id] || 0;
          if (montoPagado <= 0 && pagoRestanteByPrestamo[c.prestamo_id] > 0 && (fechaPagadaEnRango || c.status === "Parcial")) {
            const referencia = Math.max(pagadoHistorico, Number(c.capital_interes || 0) - Number(c.saldo_total || 0), 0);
            montoPagado = Math.min(pagoRestanteByPrestamo[c.prestamo_id], referencia > 0 ? referencia : pagoRestanteByPrestamo[c.prestamo_id]);
            pagoRestanteByPrestamo[c.prestamo_id] = Math.max(0, pagoRestanteByPrestamo[c.prestamo_id] - montoPagado);
          }
          const cobradaEnRango = montoPagado > 0 || Boolean(fechaPagadaEnRango);
          return {
            cuotaId: c.id,
            prestamoId: c.prestamo_id,
            clienteNombre: cliente?.nombre_completo || "—",
            clienteId: pres.cliente_id || "",
            clienteTelefono: cliente?.telefono || null,
            clienteDireccion: cliente?.direccion || null,
            gpsLat: cliente?.gps_lat ? Number(cliente.gps_lat) : null,
            gpsLng: cliente?.gps_lng ? Number(cliente.gps_lng) : null,
            numCuota: c.num_cuota,
            totalCuotas: pres.num_cuotas || 0,
            capitalInteres: Number(c.capital_interes || 0),
            saldoTotal: Number(c.saldo_total || 0),
            saldoMora: Number(c.saldo_mora || 0),
            saldoCapital: Number(c.saldo_capital || 0),
            saldoInteres: Number(c.saldo_interes || 0),
            moraPagada: Number(c.mora_pagada || 0),
            interesPagado: Number(c.interes_pagado || 0),
            capitalPagado: Number(c.capital_pagado || 0),
            fechaVencimiento: c.fecha_vencimiento,
            status: c.status || "Pendiente",
            diasAtraso: Number(c.dias_atraso || 0),
            ruta: ruta?.nombre || "Sin ruta",
            rutaId: pres.ruta_id || null,
            cobradorId: pres.cobrador_id || null,
            cajaId: pres.caja_id || null,
            pagada: c.status === "Pagada",
            cobradaEnRango,
            montoPagado,
          };
        });
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
      // Cuotas de la semana con pagos embebidos (no anulados, de la empresa); filtro por cobrador en servidor.
      // El select es dinámico (el join !inner sólo existe para filtrar por cobrador) y el parser de tipos
      // de supabase-js no resuelve strings no literales: se tipa con la variante sin join, cuyas columnas
      // son exactamente las que se leen abajo.
      type SelectSemana = "id, prestamo_id, capital_interes, saldo_total, status, fecha_vencimiento, pagos!pagos_cuota_id_fkey ( monto_recibido )";
      let cuotasQuery = supabase.from("amortizacion")
        .select(`id, prestamo_id, capital_interes, saldo_total, status, fecha_vencimiento,
          ${cobradorId ? "prestamos!amortizacion_prestamo_id_fkey!inner ( cobrador_id, empresa_id )," : ""}
          pagos!pagos_cuota_id_fkey ( monto_recibido )` as SelectSemana)
        .gte("fecha_vencimiento", desde)
        .lte("fecha_vencimiento", hasta)
        .eq("pagos.anulado", false)
        .eq("pagos.empresa_id", empresaId);
      cuotasQuery = cobradorId
        ? cuotasQuery.eq("prestamos.empresa_id", empresaId).eq("prestamos.cobrador_id", cobradorId)
        : cuotasQuery.eq("empresa_id", empresaId);
      const cuotas = await fetchAllRows(cuotasQuery);
      if (!cuotas.length) return { porCobrar: 0, cobrado: 0, total: 0, pct: 0, start, end };
      const filtered = cuotas;

      // Payments received for these cuotas
      let pagadoTotal = 0;
      for (const c of filtered) {
        for (const p of (c.pagos || []) as { monto_recibido: number }[]) pagadoTotal += Number(p.monto_recibido || 0);
      }

      const totalEsperado = filtered.reduce((s, c) => s + Number(c.capital_interes || 0), 0);
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

      // All assigned loans (active) con su amortización embebida (sin .in() de prestamo_ids)
      const prestamos = await fetchAllRows(supabase.from("prestamos")
        .select(`
          id, monto_solicitado, monto_total_pagar, num_cuotas, estado, fecha_registro,
          frecuencia, fecha_primer_pago,
          clientes ( nombre_completo ),
          rutas ( nombre ),
          amortizacion!amortizacion_prestamo_id_fkey ( status, saldo_total, saldo_mora )
        `)
        .eq("cobrador_id", cobradorId!)
        .eq("empresa_id", empresaId)
        .in("estado", ["Activo", "Al día", "Vencido"])
        .order("created_at", { ascending: false }));

      // Amortization summary for each loan
      const amortSummary: Record<string, { pagadas: number; saldo: number; mora: number }> = {};
      for (const p of prestamos) {
        const sum = { pagadas: 0, saldo: 0, mora: 0 };
        for (const a of (p.amortizacion || []) as { status: string | null; saldo_total: number | null; saldo_mora: number | null }[]) {
          if (a.status === "Pagada") sum.pagadas += 1;
          sum.saldo += Number(a.saldo_total || 0);
          sum.mora += Number(a.saldo_mora || 0);
        }
        amortSummary[p.id] = sum;
      }

      return {
        profile,
        cortes: cortes || [],
        totalComisionesGanadas,
        totalCobrado,
        prestamos: (prestamos || []).map((p) => ({
          id: p.id,
          cliente: p.clientes?.nombre_completo || "—",
          ruta: p.rutas?.nombre || "Sin ruta",
          monto: Number(p.monto_solicitado || 0),
          montoPagar: Number(p.monto_total_pagar || 0),
          cuotas: p.num_cuotas,
          estado: p.estado,
          frecuencia: p.frecuencia,
          pagadas: amortSummary[p.id]?.pagadas || 0,
          saldo: amortSummary[p.id]?.saldo || 0,
          mora: amortSummary[p.id]?.mora || 0,
        })),
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
