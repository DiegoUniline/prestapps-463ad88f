-- Lista de Préstamos en una sola llamada. Antes: empresas (días de gracia) + prestamos + prestamos_resumen
-- con todos los ids subidos en el body. Mismo resultado que fetchPrestamos (src/hooks/usePrestamos.ts),
-- incluido el estado visual: Liquidado si todas las cuotas están pagadas, Vencido si el atraso supera los
-- días de gracia, si no Activo (Cancelado/Liquidado/Juridico se respetan).
-- Devuelve jsonb (sin el límite de 1000 filas de PostgREST para funciones que regresan tablas).
CREATE OR REPLACE FUNCTION public.prestamos_listado(
  p_ruta_ids uuid[] DEFAULT NULL,
  p_cobrador uuid DEFAULT NULL,
  p_today date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH e AS (
    SELECT em.id, coalesce(em.dias_gracia, 0) AS gracia
    FROM empresas em WHERE em.id = public.get_user_empresa_id()
  ),
  pr AS (
    SELECT p.*
    FROM prestamos p JOIN e ON e.id = p.empresa_id
    WHERE (p_ruta_ids IS NULL OR cardinality(p_ruta_ids) = 0 OR p.ruta_id = ANY (p_ruta_ids))
      AND (p_cobrador IS NULL OR p.cobrador_id = p_cobrador)
  ),
  rs AS (
    SELECT * FROM public.prestamos_resumen((SELECT coalesce(array_agg(id), '{}') FROM pr), p_today)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'idPrestamo', coalesce(nullif(pr.id_prestamo, ''), left(pr.id::text, 8)),
    'codigoInterno', coalesce(pr.codigo_interno, ''),
    'tipoCuenta', coalesce(pr.tipo_cuenta::text, 'prestamo'),
    'cliente', coalesce(rs.cliente_nombre, '—'),
    'clienteFoto', nullif(rs.cliente_foto, ''),
    'clienteId', pr.cliente_id,
    'montoSolicitado', coalesce(pr.monto_solicitado, 0),
    'montoPagar', coalesce(pr.monto_total_pagar, 0),
    'cuotasPagadas', coalesce(rs.cuotas_pagadas, 0),
    'totalCuotas', coalesce(pr.num_cuotas, 0),
    'caja', CASE WHEN pr.caja_id IS NULL THEN '—' ELSE coalesce(rs.caja_nombre, '—') END,
    'ruta', CASE WHEN pr.ruta_id IS NULL THEN '—' ELSE coalesce(rs.ruta_nombre, '—') END,
    'rutaId', pr.ruta_id,
    'cobrador', CASE WHEN pr.cobrador_id IS NULL THEN '—' ELSE coalesce(rs.cobrador_nombre, '—') END,
    'cobradorId', pr.cobrador_id,
    'saldo', coalesce(rs.saldo, 0),
    'saldoCapital', coalesce(rs.saldo_capital, 0),
    'saldoInteres', coalesce(rs.saldo_interes, 0),
    'mora', coalesce(rs.mora, 0),
    'saldoAtrasado', coalesce(rs.saldo_atrasado, 0),
    'moraAtrasada', coalesce(rs.mora_atrasada, 0),
    'estado', CASE
      WHEN coalesce(pr.estado::text, 'Activo') IN ('Cancelado', 'Liquidado', 'Juridico') THEN pr.estado::text
      WHEN coalesce(pr.num_cuotas, 0) > 0 AND coalesce(rs.cuotas_pagadas, 0) >= pr.num_cuotas THEN 'Liquidado'
      WHEN coalesce(rs.dias_atraso, 0) > e.gracia THEN 'Vencido'
      ELSE 'Activo' END,
    'fechaRegistro', coalesce(to_jsonb(pr.fecha_registro) #>> '{}', ''),
    'fechaPrimerPago', coalesce(to_jsonb(pr.fecha_primer_pago) #>> '{}', ''),
    'tieneAtraso', coalesce(rs.tiene_atraso, false),
    'diasAtraso', coalesce(rs.dias_atraso, 0),
    'ultimoPagoFecha', nullif(rs.ultimo_pago_fecha, ''),
    'ultimoPagoMonto', nullif(rs.ultimo_pago_monto, 0),
    'proximoVencimiento', rs.proximo_vencimiento
  ) ORDER BY pr.created_at DESC), '[]'::jsonb)
  FROM pr
  CROSS JOIN e
  LEFT JOIN rs ON rs.prestamo_id = pr.id;
$$;

REVOKE ALL ON FUNCTION public.prestamos_listado(uuid[], uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prestamos_listado(uuid[], uuid, date) TO authenticated;
