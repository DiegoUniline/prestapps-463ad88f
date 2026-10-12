import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, mapChunks, rpc } from "@/lib/supabaseQuery";

export interface PrestamoListItem {
  id: string;
  idPrestamo: string;
  codigoInterno: string;
  tipoCuenta: string;
  cliente: string;
  clienteFoto: string | null;
  clienteId: string;
  montoSolicitado: number;
  montoPagar: number;
  cuotasPagadas: number;
  totalCuotas: number;
  caja: string;
  ruta: string;
  rutaId: string | null;
  cobrador: string;
  cobradorId: string | null;
  saldo: number;
  saldoCapital: number;
  saldoInteres: number;
  mora: number;
  estado: string;
  fechaRegistro: string;
  fechaPrimerPago: string;
  tieneAtraso: boolean;
  diasAtraso: number;
  ultimoPagoFecha: string | null;
  ultimoPagoMonto: number | null;
  proximoVencimiento: string | null;
  saldoAtrasado: number;
  moraAtrasada: number;
}

interface PrestamoResumenRow {
  prestamo_id: string;
  cliente_nombre: string | null;
  cliente_foto: string | null;
  caja_nombre: string | null;
  ruta_nombre: string | null;
  cobrador_nombre: string | null;
  saldo: number | string | null;
  saldo_capital: number | string | null;
  saldo_interes: number | string | null;
  mora: number | string | null;
  saldo_atrasado: number | string | null;
  mora_atrasada: number | string | null;
  cuotas_pagadas: number | null;
  tiene_atraso: boolean | null;
  dias_atraso: number | null;
  proximo_vencimiento: string | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_monto: number | string | null;
}

export interface FetchFilters {
  rutaIds?: string[];
  cobradorId?: string | null;
  empresaId?: string;
}

export async function fetchPrestamos(filters?: FetchFilters): Promise<PrestamoListItem[]> {
  // Fetch dias_gracia for the empresa
  let diasGracia = 0;
  if (filters?.empresaId) {
    const { data: empData } = await (supabase as any)
      .from("empresas")
      .select("dias_gracia")
      .eq("id", filters.empresaId)
      .single();
    diasGracia = empData?.dias_gracia ?? 0;
  }

  let query = (supabase.from as any)("prestamos")
    .select(
      "id, id_prestamo, codigo_interno, tipo_cuenta, monto_solicitado, monto_total_pagar, num_cuotas, estado, fecha_registro, fecha_primer_pago, cliente_id, caja_id, ruta_id, cobrador_id"
    )
    .order("created_at", { ascending: false });

  if (filters?.empresaId) {
    query = query.eq("empresa_id", filters.empresaId);
  }
  if (filters?.rutaIds && filters.rutaIds.length > 0) {
    query = query.in("ruta_id", filters.rutaIds);
  }
  if (filters?.cobradorId) {
    query = query.eq("cobrador_id", filters.cobradorId);
  }

  const prestamos = await fetchAllRows<{
    id: string;
    id_prestamo: string;
    codigo_interno: string | null;
    tipo_cuenta: string | null;
    monto_solicitado: number | null;
    monto_total_pagar: number | null;
    num_cuotas: number | null;
    estado: string | null;
    fecha_registro: string | null;
    fecha_primer_pago: string | null;
    cliente_id: string;
    caja_id: string | null;
    ruta_id: string | null;
    cobrador_id: string | null;
  }>(query);

  if (prestamos.length === 0) return [];

  // Agregados por préstamo (saldos, atraso, último pago, nombres) calculados en SQL.
  // Los ids viajan en el body del RPC (sin límite de URL); lotes de 1000 = límite de filas de PostgREST.
  const today = new Date().toISOString().slice(0, 10);
  const resumen = await mapChunks(prestamos.map((p) => p.id), 1000, async (chunk) => {
    const { data, error } = await rpc<PrestamoResumenRow[]>("prestamos_resumen", { p_ids: chunk, p_today: today });
    if (error) throw error;
    return data || [];
  });
  const resumenMap = new Map(resumen.map((r) => [r.prestamo_id, r]));
  const emptyResumen: PrestamoResumenRow = {
    prestamo_id: "", cliente_nombre: null, cliente_foto: null, caja_nombre: null, ruta_nombre: null, cobrador_nombre: null,
    saldo: 0, saldo_capital: 0, saldo_interes: 0, mora: 0, saldo_atrasado: 0, mora_atrasada: 0,
    cuotas_pagadas: 0, tiene_atraso: false, dias_atraso: 0, proximo_vencimiento: null, ultimo_pago_fecha: null, ultimo_pago_monto: null,
  };

  return prestamos.map((p) => {
    const r = resumenMap.get(p.id) || emptyResumen;
    const amort = {
      saldo: Number(r.saldo || 0),
      saldoCapital: Number(r.saldo_capital || 0),
      saldoInteres: Number(r.saldo_interes || 0),
      mora: Number(r.mora || 0),
      saldoAtrasado: Number(r.saldo_atrasado || 0),
      moraAtrasada: Number(r.mora_atrasada || 0),
      pagadas: Number(r.cuotas_pagadas || 0),
      tieneAtraso: !!r.tiene_atraso,
      diasAtraso: Number(r.dias_atraso || 0),
      proximoVencimiento: r.proximo_vencimiento,
    };

    // Compute visual estado: override DB estado if real-time data says otherwise
    let estado = p.estado || "Activo";
    if (estado !== "Cancelado" && estado !== "Liquidado" && estado !== "Juridico") {
      if (amort.pagadas >= Number(p.num_cuotas || 0) && Number(p.num_cuotas || 0) > 0) {
        estado = "Liquidado";
      } else if (amort.diasAtraso > diasGracia) {
        estado = "Vencido";
      } else {
        estado = "Activo";
      }
    }

    return {
      id: p.id,
      idPrestamo: p.id_prestamo || p.id.slice(0, 8),
      codigoInterno: p.codigo_interno || "",
      tipoCuenta: p.tipo_cuenta || "prestamo",
      cliente: r.cliente_nombre || "—",
      clienteFoto: r.cliente_foto || null,
      clienteId: p.cliente_id,
      montoSolicitado: Number(p.monto_solicitado || 0),
      montoPagar: Number(p.monto_total_pagar || 0),
      cuotasPagadas: amort.pagadas,
      totalCuotas: Number(p.num_cuotas || 0),
      caja: p.caja_id ? (r.caja_nombre || "—") : "—",
      ruta: p.ruta_id ? (r.ruta_nombre || "—") : "—",
      rutaId: p.ruta_id,
      cobrador: p.cobrador_id ? (r.cobrador_nombre || "—") : "—",
      cobradorId: p.cobrador_id,
      saldo: amort.saldo,
      saldoCapital: amort.saldoCapital,
      saldoInteres: amort.saldoInteres,
      mora: amort.mora,
      saldoAtrasado: amort.saldoAtrasado,
      moraAtrasada: amort.moraAtrasada,
      estado,
      fechaRegistro: p.fecha_registro || "",
      fechaPrimerPago: p.fecha_primer_pago || "",
      tieneAtraso: amort.tieneAtraso,
      diasAtraso: amort.diasAtraso,
      ultimoPagoFecha: r.ultimo_pago_fecha || null,
      ultimoPagoMonto: r.ultimo_pago_monto != null ? Number(r.ultimo_pago_monto) || null : null,
      proximoVencimiento: amort.proximoVencimiento,
    };
  });
}

export function usePrestamos(filters?: FetchFilters) {
  const result = useQuery({
    queryKey: ["prestamos-list-v2", filters?.rutaIds, filters?.cobradorId, filters?.empresaId],
    queryFn: () => fetchPrestamos(filters),
    staleTime: 1000 * 60 * 5,
  });
  return result;
}

export function useCajasOptions(empresaId?: string) {
  return useQuery({
    queryKey: ["cajas-options", empresaId],
    queryFn: async () => {
      let query = supabase.from("cajas").select("id, nombre, saldo_actual").order("nombre");
      if (empresaId) query = query.eq("empresa_id", empresaId);
      const { data } = await query;
      return data || [];
    },
  });
}

export function useRutasOptions(empresaId?: string) {
  return useQuery({
    queryKey: ["rutas-options", empresaId],
    queryFn: async () => {
      let query = supabase.from("rutas").select("id, nombre").order("nombre");
      if (empresaId) query = query.eq("empresa_id", empresaId);
      const { data } = await query;
      return data || [];
    },
  });
}
