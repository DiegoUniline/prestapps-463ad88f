import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PrestamoListItem {
  id: string;
  idPrestamo: string;
  cliente: string;
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
  mora: number;
  estado: string;
  fechaRegistro: string;
  fechaPrimerPago: string;
  tieneAtraso: boolean;
}

interface FetchFilters {
  rutaIds?: string[];
  cobradorId?: string | null;
  empresaId?: string;
}

async function fetchPrestamos(filters?: FetchFilters): Promise<PrestamoListItem[]> {
  let query = supabase
    .from("prestamos")
    .select(
      "id, monto_solicitado, monto_total_pagar, num_cuotas, estado, fecha_registro, fecha_primer_pago, cliente_id, caja_id, ruta_id, cobrador_id"
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

  const { data: rawPrestamos, error } = await query;
  if (error) throw error;
  if (!rawPrestamos || rawPrestamos.length === 0) return [];

  const prestamos = rawPrestamos as Array<{
    id: string;
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
  }>;

  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter(Boolean) as string[])];

  const prestamoIds = prestamos.map((p) => p.id);
  const clienteIds = unique(prestamos.map((p) => p.cliente_id));
  const cajaIds = unique(prestamos.map((p) => p.caja_id));
  const rutaIds = unique(prestamos.map((p) => p.ruta_id));
  const cobradorIds = unique(prestamos.map((p) => p.cobrador_id));

  const [amortRes, clientesRes, cajasRes, rutasRes, cobradoresRes] = await Promise.all([
    supabase
      .from("amortizacion")
      .select("prestamo_id, saldo_total, saldo_mora, status, fecha_vencimiento")
      .in("prestamo_id", prestamoIds),
    clienteIds.length > 0
      ? supabase.from("clientes").select("id, nombre_completo").in("id", clienteIds)
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
  ]);

  const amortData = amortRes.error ? [] : amortRes.data || [];
  const clientesData = clientesRes.error ? [] : clientesRes.data || [];
  const cajasData = cajasRes.error ? [] : cajasRes.data || [];
  const rutasData = rutasRes.error ? [] : rutasRes.data || [];
  const cobradoresData = cobradoresRes.error ? [] : cobradoresRes.data || [];

  const clientesMap = Object.fromEntries(clientesData.map((c) => [c.id, c.nombre_completo || "—"]));
  const cajasMap = Object.fromEntries(cajasData.map((c) => [c.id, c.nombre || "—"]));
  const rutasMap = Object.fromEntries(rutasData.map((r) => [r.id, r.nombre || "—"]));
  const cobradorMap = Object.fromEntries(cobradoresData.map((c) => [c.id, c.nombre_completo || "—"]));

  const today = new Date().toISOString().slice(0, 10);
  const amortByPrestamo: Record<string, { saldo: number; mora: number; pagadas: number; tieneAtraso: boolean }> = {};

  for (const a of amortData) {
    if (!amortByPrestamo[a.prestamo_id]) {
      amortByPrestamo[a.prestamo_id] = { saldo: 0, mora: 0, pagadas: 0, tieneAtraso: false };
    }
    amortByPrestamo[a.prestamo_id].saldo += Number(a.saldo_total || 0);
    amortByPrestamo[a.prestamo_id].mora += Number(a.saldo_mora || 0);
    if (a.status === "Pagada") amortByPrestamo[a.prestamo_id].pagadas += 1;
    if (a.fecha_vencimiento < today && Number(a.saldo_total || 0) > 0) {
      amortByPrestamo[a.prestamo_id].tieneAtraso = true;
    }
  }

  return prestamos.map((p) => {
    const amort = amortByPrestamo[p.id] || { saldo: 0, mora: 0, pagadas: 0, tieneAtraso: false };

    return {
      id: p.id,
      cliente: clientesMap[p.cliente_id] || "—",
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
      mora: amort.mora,
      estado: p.estado || "Activo",
      fechaRegistro: p.fecha_registro || "",
      fechaPrimerPago: p.fecha_primer_pago || "",
      tieneAtraso: amort.tieneAtraso,
    };
  });
}

export function usePrestamos(filters?: FetchFilters) {
  return useQuery({
    queryKey: ["prestamos-list-v2", filters?.rutaIds, filters?.cobradorId, filters?.empresaId],
    queryFn: () => fetchPrestamos(filters),
    staleTime: 1000 * 30,
  });
}

export function useCajasOptions(empresaId?: string) {
  return useQuery({
    queryKey: ["cajas-options", empresaId],
    queryFn: async () => {
      let query = supabase.from("cajas").select("id, nombre").order("nombre");
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
