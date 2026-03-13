import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Métodos de Pago ──
export interface MetodoPago {
  id: string;
  nombre: string;
  requiere_validacion: boolean;
  descripcion: string;
  activo: boolean;
}

export function useMetodosPago() {
  return useQuery({
    queryKey: ["cat-metodos-pago"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_metodos_pago" as any)
        .select("id, nombre, requiere_validacion, descripcion, activo")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as MetodoPago[];
    },
  });
}

export function useUpsertMetodoPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<MetodoPago> & { nombre: string }) => {
      if (item.id) {
        const { error } = await supabase
          .from("cat_metodos_pago" as any)
          .update({ nombre: item.nombre, requiere_validacion: item.requiere_validacion, descripcion: item.descripcion, activo: item.activo } as any)
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cat_metodos_pago" as any)
          .insert({ nombre: item.nombre, requiere_validacion: item.requiere_validacion ?? false, descripcion: item.descripcion ?? "", activo: item.activo ?? true } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-metodos-pago"] });
      toast.success("Método de pago guardado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteMetodoPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cat_metodos_pago" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-metodos-pago"] });
      toast.success("Método de pago eliminado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ── Estados de Préstamo ──
export interface EstadoPrestamo {
  id: string;
  nombre: string;
  color: string;
  descripcion: string;
  activo: boolean;
}

export function useEstadosPrestamo() {
  return useQuery({
    queryKey: ["cat-estados-prestamo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cat_estados_prestamo" as any)
        .select("id, nombre, color, descripcion, activo")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as EstadoPrestamo[];
    },
  });
}

export function useUpsertEstadoPrestamo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<EstadoPrestamo> & { nombre: string }) => {
      if (item.id) {
        const { error } = await supabase
          .from("cat_estados_prestamo" as any)
          .update({ nombre: item.nombre, color: item.color, descripcion: item.descripcion, activo: item.activo } as any)
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cat_estados_prestamo" as any)
          .insert({ nombre: item.nombre, color: item.color ?? "", descripcion: item.descripcion ?? "", activo: item.activo ?? true } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-estados-prestamo"] });
      toast.success("Estado guardado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteEstadoPrestamo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cat_estados_prestamo" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cat-estados-prestamo"] });
      toast.success("Estado eliminado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
