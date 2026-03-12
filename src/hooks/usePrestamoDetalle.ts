import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePrestamoDetalle(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["prestamo-detalle", prestamoId],
    queryFn: async () => {
      if (!prestamoId) throw new Error("No ID");

      const { data: prestamo, error } = await supabase
        .from("prestamos")
        .select(`
          *,
          clientes ( id, id_cliente, nombre_completo ),
          cajas ( id, nombre ),
          rutas ( id, nombre )
        `)
        .eq("id", prestamoId)
        .maybeSingle();

      if (error) throw error;
      return prestamo;
    },
    enabled: !!prestamoId,
  });
}

export function useAmortizacion(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["amortizacion", prestamoId],
    queryFn: async () => {
      if (!prestamoId) return [];

      // Recalculate mora/vencimientos before fetching
      await supabase.rpc("recalcular_mora", { p_prestamo_id: prestamoId });

      const { data, error } = await supabase
        .from("amortizacion")
        .select("*")
        .eq("prestamo_id", prestamoId)
        .order("num_cuota", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!prestamoId,
  });
}

export function usePagos(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["pagos", prestamoId],
    queryFn: async () => {
      if (!prestamoId) return [];
      const { data, error } = await supabase
        .from("pagos")
        .select(`
          *,
          cajas ( nombre )
        `)
        .eq("prestamo_id", prestamoId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!prestamoId,
  });
}

export function usePromesas(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["promesas", prestamoId],
    queryFn: async () => {
      if (!prestamoId) return [];
      const { data, error } = await supabase
        .from("promesas_pago")
        .select("*")
        .eq("prestamo_id", prestamoId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!prestamoId,
  });
}

export function useCajas() {
  return useQuery({
    queryKey: ["cajas-all"],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre").order("nombre");
      return data || [];
    },
  });
}
