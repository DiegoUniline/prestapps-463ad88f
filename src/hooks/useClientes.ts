import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Cliente, ClienteInsert } from "@/types/cliente";

const CLIENTE_COLUMNS = `
  id, id_cliente, nombre_completo, telefono, correo,
  documento_identidad, dni, direccion, foto_cliente,
  gps_lat, gps_lng, activo, sexo, situacion_laboral,
  ingresos, estado_civil, dependientes, estado, created_at, empresa_id,
  fecha_nacimiento, tipo_vivienda, gastos_mensuales, notas,
  trabajo_empresa, trabajo_cargo, trabajo_telefono, trabajo_antiguedad, direccion_trabajo,
  ref1_nombre, ref1_telefono, ref1_parentesco,
  ref2_nombre, ref2_telefono, ref2_parentesco,
  aval_nombre, aval_telefono, aval_direccion, aval_dni, aval_parentesco
`;

export function useClientes(filters?: { estado?: string; search?: string; empresaId?: string }) {
  return useQuery({
    queryKey: ["clientes", filters],
    queryFn: async () => {
      let query = (supabase.from as any)("clientes")
        .select(CLIENTE_COLUMNS)
        .order("created_at", { ascending: false });

      if (filters?.empresaId) {
        query = query.eq("empresa_id", filters.empresaId);
      }
      if (filters?.estado && filters.estado !== "todos") {
        query = query.eq("estado", filters.estado);
      }
      if (filters?.search) {
        query = query.or(
          `nombre_completo.ilike.%${filters.search}%,id_cliente.ilike.%${filters.search}%,telefono.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Cliente[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCliente(id: string | undefined) {
  return useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("clientes")
        .select(CLIENTE_COLUMNS)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Cliente;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cliente: ClienteInsert & { empresa_id?: string }) => {
      const { data, error } = await supabase
        .from("clientes")
        .insert(cliente as any)
        .select()
        .single();
      if (error) throw error;
      return data as Cliente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}

export function useUpdateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Cliente> & { id: string }) => {
      const { data, error } = await supabase
        .from("clientes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Cliente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}

export function useDeleteCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}
