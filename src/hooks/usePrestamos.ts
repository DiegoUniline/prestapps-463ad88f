import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabaseQuery";
import { hoyNegocio } from "@/lib/fechaNegocio";

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

export interface FetchFilters {
  rutaIds?: string[];
  cobradorId?: string | null;
  empresaId?: string;
}

export async function fetchPrestamos(filters?: FetchFilters): Promise<PrestamoListItem[]> {
  // Préstamos + saldos, atraso, último pago, nombres y estado visual (días de gracia): una sola RPC.
  const { data, error } = await rpc<PrestamoListItem[]>("prestamos_listado", {
    p_ruta_ids: filters?.rutaIds?.length ? filters.rutaIds : null,
    p_cobrador: filters?.cobradorId || null,
    p_today: hoyNegocio(),
  });
  if (error) throw error;
  return data ?? [];
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
