import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseQuery";

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

export function useSolicitudes(empresaId?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ["solicitudes", empresaId, statusFilter],
    queryFn: async () => {
      let query = (supabase.from as any)("solicitudes_prestamo")
        .select("*, clientes(nombre_completo, id_cliente)")
        .order("created_at", { ascending: false });

      if (empresaId) query = query.eq("empresa_id", empresaId);
      if (statusFilter && statusFilter !== "todos") query = query.eq("status", statusFilter);

      return await fetchAllRows<Solicitud>(query);
    },
  });
}

export function useCreateSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sol: Record<string, any>) => {
      const { data, error } = await (supabase.from as any)("solicitudes_prestamo")
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
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await (supabase.from as any)("solicitudes_prestamo")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitudes"] }),
  });
}
