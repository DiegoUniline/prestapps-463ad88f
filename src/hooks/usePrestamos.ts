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
  cobrador: string;
  saldo: number;
  mora: number;
  estado: string;
  fechaRegistro: string;
  fechaPrimerPago: string;
  tieneAtraso: boolean;
}

async function fetchPrestamos(): Promise<PrestamoListItem[]> {
  // Fetch prestamos with joins
  const { data: prestamos, error } = await supabase
    .from("prestamos")
    .select(`
      id,
      monto_solicitado,
      monto_total_pagar,
      num_cuotas,
      estado,
      fecha_registro,
      fecha_primer_pago,
      cliente_id,
      caja_id,
      ruta_id,
      cobrador_id,
      clientes ( id, nombre_completo ),
      cajas ( nombre ),
      rutas ( nombre, cobrador_id )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!prestamos) return [];

  // Fetch amortization data for saldo/mora/cuotas pagadas
  const ids = prestamos.map((p) => p.id);
  const { data: amortData } = await supabase
    .from("amortizacion")
    .select("prestamo_id, saldo_total, saldo_mora, status")
    .in("prestamo_id", ids);

  // Group amort by prestamo
  const amortByPrestamo: Record<string, { saldo: number; mora: number; pagadas: number }> = {};
  for (const a of amortData || []) {
    if (!amortByPrestamo[a.prestamo_id]) {
      amortByPrestamo[a.prestamo_id] = { saldo: 0, mora: 0, pagadas: 0 };
    }
    amortByPrestamo[a.prestamo_id].saldo += Number(a.saldo_total || 0);
    amortByPrestamo[a.prestamo_id].mora += Number(a.saldo_mora || 0);
    if (a.status === "Pagada") amortByPrestamo[a.prestamo_id].pagadas += 1;
  }

  return prestamos.map((p) => {
    const amort = amortByPrestamo[p.id] || { saldo: 0, mora: 0, pagadas: 0 };
    const cliente = p.clientes as any;
    const caja = p.cajas as any;
    const ruta = p.rutas as any;

    return {
      id: p.id,
      cliente: cliente?.nombre_completo || "—",
      clienteId: p.cliente_id,
      montoSolicitado: Number(p.monto_solicitado || 0),
      montoPagar: Number(p.monto_total_pagar || 0),
      cuotasPagadas: amort.pagadas,
      totalCuotas: p.num_cuotas,
      caja: caja?.nombre || "—",
      ruta: ruta?.nombre || "—",
      cobrador: "—", // TODO: join to profiles/users
      saldo: amort.saldo,
      mora: amort.mora,
      estado: p.estado || "Activo",
      fechaRegistro: p.fecha_registro || "",
      fechaPrimerPago: p.fecha_primer_pago || "",
    };
  });
}

export function usePrestamos() {
  return useQuery({
    queryKey: ["prestamos-list"],
    queryFn: fetchPrestamos,
  });
}

// Fetch filter options from DB
export function useCajasOptions() {
  return useQuery({
    queryKey: ["cajas-options"],
    queryFn: async () => {
      const { data } = await supabase.from("cajas").select("id, nombre").order("nombre");
      return data || [];
    },
  });
}

export function useRutasOptions() {
  return useQuery({
    queryKey: ["rutas-options"],
    queryFn: async () => {
      const { data } = await supabase.from("rutas").select("id, nombre").order("nombre");
      return data || [];
    },
  });
}
