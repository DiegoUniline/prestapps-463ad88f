import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PAGE_SIZE, pageRange } from "@/hooks/usePaginacion";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export interface Solicitud {
  id: string;
  cliente_id: string;
  empresa_id: string;
  monto_solicitado: number;
  tasa_interes: number;
  num_cuotas: number;
  frecuencia: string;
  modalidad: string;
  fecha_primer_pago: string | null;
  gastos_legales: number;
  tipo_mora: string;
  valor_mora: number;
  notas: string | null;
  ruta_id: string | null;
  caja_id: string | null;
  solicitado_por: string | null;
  aprobado_por: string | null;
  rechazado_por: string | null;
  motivo_rechazo: string | null;
  status: string;
  prestamo_generado_id: string | null;
  created_at: string;
  resuelto_en: string | null;
  // joined
  clientes?: { nombre_completo: string; id_cliente: string } | null;
}

/**
 * Listado paginado en servidor: estado, búsqueda (nombre o ID del cliente) y orden en PostgREST.
 * Devuelve solo la página pedida + total filtrado.
 */
export function useSolicitudesPaginadas(params: { empresaId?: string; status?: string; search?: string; page?: number; pageSize?: number }) {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? PAGE_SIZE;
  return useQuery({
    queryKey: ["solicitudes", params.empresaId, params.status, "pagina", params.search || "", page, pageSize],
    enabled: !!params.empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const search = params.search?.trim();
      const columns = search
        ? "*, clientes!inner(nombre_completo, id_cliente)"
        : "*, clientes(nombre_completo, id_cliente)";
      let query = supabase
        .from("solicitudes_prestamo")
        .select(columns, { count: "exact" })
        .eq("empresa_id", params.empresaId ?? "")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (params.status && params.status !== "todos") query = query.eq("status", params.status);
      if (search) {
        const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`.replace(/["\\]/g, (c) => `\\${c}`);
        query = query.or(`nombre_completo.ilike."${like}",id_cliente.ilike."${like}"`, { referencedTable: "clientes" });
      }

      const [from, to] = pageRange(page, pageSize);
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { rows: (data || []) as Solicitud[], total: count ?? 0 };
    },
  });
}

export function useCreateSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sol: TablesInsert<"solicitudes_prestamo">) => {
      const { data, error } = await supabase
        .from("solicitudes_prestamo")
        .insert(sol)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitudes"] }),
  });
}

export function useUpdateSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"solicitudes_prestamo"> & { id: string }) => {
      const { error } = await supabase
        .from("solicitudes_prestamo")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitudes"] }),
  });
}
