import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePrestamoDetalle(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["prestamo-detalle", prestamoId],
    queryFn: async () => {
      if (!prestamoId) throw new Error("No ID");

      const { data: prestamo, error } = await (supabase.from as any)("prestamos")
        .select(`
          id, id_prestamo, cliente_id, monto_solicitado, monto_total_pagar, tasa_interes,
          num_cuotas, frecuencia, modalidad, fecha_primer_pago, fecha_registro,
          caja_id, ruta_id, cobrador_id, estado, gastos_legales, tipo_mora,
          valor_mora, notas, cuota_calculada, cuota_redondeada, empresa,
          cancelado_por, cancelado_en, motivo_cancelacion, reestructurado_de,
          gps_lat, gps_lng, created_at, generado_por, empresa_id, codigo_interno,
          clientes ( id, id_cliente, nombre_completo, dni, direccion, telefono, correo, foto_cliente ),
          cajas ( id, nombre ),
          rutas ( id, nombre )
        `)
        .eq("id", prestamoId)
        .maybeSingle();

      if (error) throw error;

      // Fetch cobro_automatico_stripe separately (column may not be in types yet)
      let cobro_automatico_stripe = false;
      try {
        const { data: extraData } = await supabase
          .from("prestamos")
          .select("cobro_automatico_stripe" as any)
          .eq("id", prestamoId)
          .maybeSingle();
        cobro_automatico_stripe = (extraData as any)?.cobro_automatico_stripe ?? false;
      } catch { /* column may not exist yet */ }

      return prestamo ? { ...prestamo, cobro_automatico_stripe } : null;
    },
    enabled: !!prestamoId,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useAmortizacion(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["amortizacion", prestamoId],
    queryFn: async () => {
      if (!prestamoId) return [];
      const { data, error } = await supabase
        .from("amortizacion")
        .select(`
          id, prestamo_id, num_cuota, capital, interes, capital_interes,
          fecha_vencimiento, fecha_pagada, fecha_calculo, dias_atraso,
          mora, capital_pagado, interes_pagado, mora_pagada,
          saldo_capital, saldo_interes, saldo_mora, saldo_total,
          status, descuento_mora, avisado
        `)
        .eq("prestamo_id", prestamoId)
        .order("num_cuota", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!prestamoId,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
          id, prestamo_id, cuota_id, monto_recibido, metodo_pago,
          aplicado_capital, aplicado_interes, aplicado_mora,
          caja_id, cobrador_id, ruta_id, registrado_por,
          gps_lat, gps_lng, created_at,
          anulado, anulado_por, anulado_en, motivo_anulacion,
          cajas ( nombre )
        `)
        .eq("prestamo_id", prestamoId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!prestamoId,
    staleTime: 1000 * 60 * 2,
  });
}

export function usePromesas(prestamoId: string | undefined) {
  return useQuery({
    queryKey: ["promesas", prestamoId],
    queryFn: async () => {
      if (!prestamoId) return [];
      const { data, error } = await supabase
        .from("promesas_pago")
        .select("id, prestamo_id, cuota_id, monto_prometido, fecha_prometida, status, notas, created_at")
        .eq("prestamo_id", prestamoId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!prestamoId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCajas() {
  return useQuery({
    queryKey: ["cajas-all"],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre").order("nombre");
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5min - rarely changes
  });
}
