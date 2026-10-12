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

// ── Pagos (supabase/migrations/20261013120000_pagos_integridad.sql) ─────────────

export interface RegistrarPagoArgs {
  prestamoId: string;
  empresaId: string;
  cajaId: string;
  cobradorId: string | null;
  rutaId: string | null;
  registradoPor: string | null;
  monto: number;
  metodo: string;
  fechaPago: string;
  gpsLat: number | null;
  gpsLng: number | null;
  distribution: { cuotaId: string; mora: number; interes: number; capital: number }[];
  descuentos?: { cuota_id: string; monto: number }[] | null;
}

export function rpcRegistrarPagoCompleto(a: RegistrarPagoArgs) {
  return callRpc<unknown>("registrar_pago_completo", {
    p_prestamo_id: a.prestamoId,
    p_empresa_id: a.empresaId,
    p_caja_id: a.cajaId,
    p_cobrador_id: a.cobradorId,
    p_ruta_id: a.rutaId,
    p_registrado_por: a.registradoPor,
    p_monto: a.monto,
    p_metodo: a.metodo,
    p_fecha_pago: a.fechaPago,
    p_gps_lat: a.gpsLat,
    p_gps_lng: a.gpsLng,
    p_distribution: a.distribution,
    p_descuentos: a.descuentos?.length ? a.descuentos : null,
  });
}

export function rpcLiquidarPrestamo(a: {
  prestamoId: string;
  cajaId: string;
  modo: "completo" | "solo_capital" | "descuento";
  descMoraPct: number;
  descInteresPct: number;
  cobradorId: string | null;
  rutaId: string | null;
  fechaPago: string;
  gpsLat: number | null;
  gpsLng: number | null;
  montoEsperado: number;
  nota: string;
}) {
  return callRpc<{ prestamo_id: string; monto: number; condonado: number; cuotas: number }>("liquidar_prestamo", {
    p_prestamo_id: a.prestamoId,
    p_caja_id: a.cajaId,
    p_modo: a.modo,
    p_desc_mora_pct: a.descMoraPct,
    p_desc_interes_pct: a.descInteresPct,
    p_cobrador_id: a.cobradorId,
    p_ruta_id: a.rutaId,
    p_fecha_pago: a.fechaPago,
    p_gps_lat: a.gpsLat,
    p_gps_lng: a.gpsLng,
    p_monto_esperado: a.montoEsperado,
    p_nota: a.nota,
  });
}

export function rpcRegistrarPromesaPago(prestamoId: string, cuotaId: string | null, monto: number, fecha: string, notas?: string | null) {
  return callRpc<{ promesa_id: string }>("registrar_promesa_pago", {
    p_prestamo_id: prestamoId,
    p_cuota_id: cuotaId,
    p_monto: monto,
    p_fecha: fecha,
    p_notas: notas ?? null,
  });
}

export function rpcRegistrarVisita(a: {
  prestamoId: string;
  clienteId: string | null;
  resultado: string;
  notas?: string | null;
  cuotaId?: string | null;
  montoPromesa?: number | null;
  fechaPromesa?: string | null;
}) {
  return callRpc<{ gestion_id: string; promesa_id: string | null }>("registrar_visita", {
    p_prestamo_id: a.prestamoId,
    p_cliente_id: a.clienteId,
    p_resultado: a.resultado,
    p_notas: a.notas ?? null,
    p_cuota_id: a.cuotaId ?? null,
    p_monto_promesa: a.montoPromesa ?? null,
    p_fecha_promesa: a.fechaPromesa ?? null,
  });
}

export function rpcEditarPrestamo(prestamoId: string, datos: Record<string, unknown>) {
  return callRpc<{ prestamo_id: string; caja_cambio: boolean }>("editar_prestamo", {
    p_prestamo_id: prestamoId,
    p_datos: datos,
  });
}
