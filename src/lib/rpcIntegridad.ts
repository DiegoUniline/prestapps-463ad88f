import { supabase } from "@/integrations/supabase/client";

/**
 * Wrappers de las RPC transaccionales (supabase/migrations/20261012150000_rpc_integridad.sql).
 * Cada flujo de dinero es UNA llamada = una transacción; si falla, no queda nada a medias.
 * Lanzan Error con el mensaje (en español) que devuelve la base de datos.
 */
async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message || "Error en el servidor");
  return data as T;
}

export function rpcTransferirCaja(origenId: string, destinoId: string, monto: number, concepto?: string | null) {
  return callRpc<{ salida_id: string; entrada_id: string }>("transferir_caja", {
    p_origen: origenId,
    p_destino: destinoId,
    p_monto: monto,
    p_concepto: concepto ?? null,
  });
}

export function rpcRegistrarMovimientoCaja(cajaId: string, tipo: "entrada" | "salida", monto: number, concepto?: string | null) {
  return callRpc<{ movimiento_id: string }>("registrar_movimiento_caja", {
    p_caja_id: cajaId,
    p_tipo: tipo,
    p_monto: monto,
    p_concepto: concepto ?? null,
  });
}

export interface LiquidarRutaResult {
  corte_id: string;
  pagos: number;
  total_cobrado: number;
  monto_efectivo: number;
  monto_comision: number;
}

export function rpcLiquidarRuta(args: {
  cobradorId: string;
  pagoIds: string[];
  cajaId: string;
  periodoHasta?: string | null;
  concepto?: string | null;
  conceptoComision?: string | null;
}) {
  return callRpc<LiquidarRutaResult>("liquidar_ruta", {
    p_cobrador_id: args.cobradorId,
    p_pago_ids: args.pagoIds,
    p_caja_id: args.cajaId,
    p_periodo_hasta: args.periodoHasta ?? null,
    p_concepto: args.concepto ?? null,
    p_concepto_comision: args.conceptoComision ?? null,
  });
}

export interface DesembolsoInput {
  caja_id: string;
  monto: number;
  concepto: string;
}

export function rpcCrearPrestamo(
  prestamo: Record<string, unknown>,
  cuotas: Record<string, unknown>[],
  desembolso?: DesembolsoInput | null,
  solicitudId?: string | null,
) {
  return callRpc<{ prestamo_id: string; id_prestamo: string; codigo_interno: string | null }>("crear_prestamo", {
    p_prestamo: prestamo,
    p_cuotas: cuotas,
    p_desembolso: desembolso ?? null,
    p_solicitud_id: solicitudId ?? null,
  });
}

export function rpcCancelarPrestamo(prestamoId: string, motivo: string) {
  return callRpc<{ prestamo_id: string }>("cancelar_prestamo", { p_prestamo_id: prestamoId, p_motivo: motivo });
}

export function rpcReestructurarPrestamo(
  prestamoId: string,
  nuevo: Record<string, unknown>,
  cuotas: Record<string, unknown>[],
  motivo: string,
) {
  return callRpc<{ prestamo_id: string }>("reestructurar_prestamo", {
    p_prestamo_id: prestamoId,
    p_nuevo: nuevo,
    p_cuotas: cuotas,
    p_motivo: motivo,
  });
}

export function rpcEditarPago(args: {
  pagoId: string;
  monto: number;
  metodo: string;
  cajaId: string | null;
  cobradorId?: string | null;
}) {
  return callRpc<{ pago_id: string }>("editar_pago", {
    p_pago_id: args.pagoId,
    p_monto: args.monto,
    p_metodo: args.metodo,
    p_caja_id: args.cajaId || null,
    p_cobrador_id: args.cobradorId ?? null,
  });
}

export function rpcSiguienteIdCliente() {
  return callRpc<string>("siguiente_id_cliente", {});
}
