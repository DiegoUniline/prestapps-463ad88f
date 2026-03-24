import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";

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

  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter(Boolean) as string[])];

  const prestamoIds = prestamos.map((p) => p.id);
  const clienteIds = unique(prestamos.map((p) => p.cliente_id));
  const cajaIds = unique(prestamos.map((p) => p.caja_id));
  const rutaIds = unique(prestamos.map((p) => p.ruta_id));
  const cobradorIds = unique(prestamos.map((p) => p.cobrador_id));

  // Amortization can exceed 1000 rows — use fetchAllRows
  // Other lookups (clientes, cajas, rutas, profiles) are bounded by unique IDs so they're fine
  const [amortData, clientesRes, cajasRes, rutasRes, cobradoresRes, pagosRes] = await Promise.all([
    fetchAllRows<any>(
      supabase
        .from("amortizacion")
        .select("prestamo_id, saldo_total, saldo_mora, saldo_capital, saldo_interes, status, fecha_vencimiento")
        .in("prestamo_id", prestamoIds)
        .order("prestamo_id", { ascending: true })
        .order("num_cuota", { ascending: true })
    ),
    clienteIds.length > 0
      ? supabase.from("clientes").select("id, nombre_completo, foto_cliente").in("id", clienteIds)
      : Promise.resolve({ data: [], error: null }),
    cajaIds.length > 0
      ? supabase.from("cajas").select("id, nombre").in("id", cajaIds)
      : Promise.resolve({ data: [], error: null }),
    rutaIds.length > 0
      ? supabase.from("rutas").select("id, nombre").in("id", rutaIds)
      : Promise.resolve({ data: [], error: null }),
    cobradorIds.length > 0
      ? supabase.from("profiles").select("id, nombre_completo").in("id", cobradorIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("pagos")
      .select("prestamo_id, fecha_pago, monto_recibido")
      .in("prestamo_id", prestamoIds)
      .eq("anulado", false)
      .order("fecha_pago", { ascending: false }),
  ]);

  const clientesData = clientesRes.error ? [] : clientesRes.data || [];
  const cajasData = cajasRes.error ? [] : cajasRes.data || [];
  const rutasData = rutasRes.error ? [] : rutasRes.data || [];
  const cobradoresData = cobradoresRes.error ? [] : cobradoresRes.data || [];

  const clientesMap = Object.fromEntries(clientesData.map((c) => [c.id, c.nombre_completo || "—"]));
  const clientesFotoMap = Object.fromEntries(clientesData.map((c) => [c.id, c.foto_cliente || null]));
  const cajasMap = Object.fromEntries(cajasData.map((c) => [c.id, c.nombre || "—"]));
  const rutasMap = Object.fromEntries(rutasData.map((r) => [r.id, r.nombre || "—"]));
  const cobradorMap = Object.fromEntries(cobradoresData.map((c) => [c.id, c.nombre_completo || "—"]));

  // Build último pago map (pagos already sorted desc by fecha_pago, keep first per prestamo)
  const ultimoPagoMap: Record<string, { fecha: string; monto: number }> = {};
  for (const pg of (pagosRes.data || [])) {
    if (!ultimoPagoMap[pg.prestamo_id]) {
      ultimoPagoMap[pg.prestamo_id] = { fecha: pg.fecha_pago, monto: Number(pg.monto_recibido || 0) };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const amortByPrestamo: Record<string, { saldo: number; saldoCapital: number; saldoInteres: number; mora: number; pagadas: number; tieneAtraso: boolean; diasAtraso: number; proximoVencimiento: string | null }> = {};

  for (const a of amortData) {
    if (!amortByPrestamo[a.prestamo_id]) {
      amortByPrestamo[a.prestamo_id] = { saldo: 0, saldoCapital: 0, saldoInteres: 0, mora: 0, pagadas: 0, tieneAtraso: false, diasAtraso: 0, proximoVencimiento: null };
    }
    const entry = amortByPrestamo[a.prestamo_id];
    entry.saldo += Number(a.saldo_total || 0);
    entry.saldoCapital += Number(a.saldo_capital || 0);
    entry.saldoInteres += Number(a.saldo_interes || 0);
    entry.mora += Number(a.saldo_mora || 0);
    if (a.status === "Pagada") entry.pagadas += 1;
    // Track next pending installment
    if (Number(a.saldo_total || 0) > 0 && a.fecha_vencimiento >= today) {
      if (!entry.proximoVencimiento || a.fecha_vencimiento < entry.proximoVencimiento) {
        entry.proximoVencimiento = a.fecha_vencimiento;
      }
    }
    if (a.fecha_vencimiento < today && Number(a.saldo_total || 0) > 0) {
      entry.tieneAtraso = true;
      const diffDays = Math.floor((new Date(today).getTime() - new Date(a.fecha_vencimiento).getTime()) / 86400000);
      if (diffDays > entry.diasAtraso) {
        entry.diasAtraso = diffDays;
      }
    }
  }

  return prestamos.map((p) => {
    const amort = amortByPrestamo[p.id] || { saldo: 0, saldoCapital: 0, saldoInteres: 0, mora: 0, pagadas: 0, tieneAtraso: false, diasAtraso: 0, proximoVencimiento: null };

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
      cliente: clientesMap[p.cliente_id] || "—",
      clienteFoto: clientesFotoMap[p.cliente_id] || null,
      clienteId: p.cliente_id,
      montoSolicitado: Number(p.monto_solicitado || 0),
      montoPagar: Number(p.monto_total_pagar || 0),
      cuotasPagadas: amort.pagadas,
      totalCuotas: Number(p.num_cuotas || 0),
      caja: p.caja_id ? (cajasMap[p.caja_id] || "—") : "—",
      ruta: p.ruta_id ? (rutasMap[p.ruta_id] || "—") : "—",
      rutaId: p.ruta_id,
      cobrador: p.cobrador_id ? (cobradorMap[p.cobrador_id] || "—") : "—",
      cobradorId: p.cobrador_id,
      saldo: amort.saldo,
      saldoCapital: amort.saldoCapital,
      saldoInteres: amort.saldoInteres,
      mora: amort.mora,
      estado,
      fechaRegistro: p.fecha_registro || "",
      fechaPrimerPago: p.fecha_primer_pago || "",
      tieneAtraso: amort.tieneAtraso,
      diasAtraso: amort.diasAtraso,
      ultimoPagoFecha: ultimoPagoMap[p.id]?.fecha || null,
      ultimoPagoMonto: ultimoPagoMap[p.id]?.monto || null,
      proximoVencimiento: amort.proximoVencimiento,
    };
  });
}

export function usePrestamos(filters?: FetchFilters) {
  const result = useQuery({
    queryKey: ["prestamos-list-v2", filters?.rutaIds, filters?.cobradorId, filters?.empresaId],
    queryFn: () => fetchPrestamos(filters),
    staleTime: 1000 * 60 * 5, // 5 min — use global default
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
