import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PrestamoListItem {
  id: string;
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
    .select(`
      id, monto_solicitado, monto_total_pagar, num_cuotas, estado,
      fecha_registro, fecha_primer_pago, cliente_id, caja_id, ruta_id, cobrador_id,
      clientes ( id, nombre_completo ),
      cajas ( nombre ),
      rutas ( nombre )
    `)
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

  // Cast to any[] to avoid type inference issues with dynamic columns
  const prestamos = rawPrestamos as any[];

  const ids = prestamos.map((p) => p.id);

  // Fetch amortization data with error handling
  let amortData: any[] = [];
  try {
    const { data, error: amortError } = await supabase
      .from("amortizacion")
      .select("prestamo_id, saldo_total, saldo_mora, status, fecha_vencimiento")
      .in("prestamo_id", ids);
    if (!amortError && data) amortData = data;
  } catch { /* continue without amort data */ }

  // Fetch cobrador names from profiles
  const cobradorIds = [...new Set(prestamos.map((p) => p.cobrador_id).filter(Boolean))] as string[];
  let cobradorMap: Record<string, string> = {};
  if (cobradorIds.length > 0) {
    try {
      const { data: cobProfiles } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .in("id", cobradorIds);
      for (const cp of cobProfiles || []) {
        cobradorMap[cp.id] = cp.nombre_completo;
      }
    } catch { /* continue without cobrador names */ }
  }

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

  return prestamos.map((p: any) => {
    const amort = amortByPrestamo[p.id] || { saldo: 0, mora: 0, pagadas: 0, tieneAtraso: false };
    const cliente = p.clientes;
    const caja = p.cajas;
    const ruta = p.rutas;

    return {
      id: p.id,
      cliente: cliente?.nombre_completo || "—",
      clienteId: p.cliente_id,
      montoSolicitado: Number(p.monto_solicitado || 0),
      montoPagar: Number(p.monto_total_pagar || 0),
      cuotasPagadas: amort.pagadas,
      totalCuotas: p.num_cuotas || 0,
      caja: caja?.nombre || "—",
      ruta: ruta?.nombre || "—",
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
    queryKey: ["prestamos-list", filters?.rutaIds, filters?.cobradorId, filters?.empresaId],
    queryFn: () => fetchPrestamos(filters),
    staleTime: 1000 * 60 * 5,
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
